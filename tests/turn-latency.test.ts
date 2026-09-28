/**
 * What the citizen waits for, and what they no longer wait for.
 *
 * A turn came back at 38022 ms with a person watching a spinner. Two things
 * were on that path that did not need to be: speech synthesis with the upload
 * behind it, and a localisation loop that sent each sentence of the answer only
 * after the previous one came back.
 *
 * These tests hold both open. They are about the shape of the work — what runs
 * in sequence and what runs together — rather than about a wall-clock number,
 * because a wall-clock assertion would measure this container's mood.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("the answer no longer waits for its own audio", () => {
  it("points at the audio route instead of synthesising during the turn", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/server/ai/agents/orchestrator.ts", import.meta.url), "utf8"),
    );
    // The turn names the route; it does not call the synthesiser.
    expect(source).toContain("/audio`");
    expect(source).not.toMatch(/await\s+aiGateway\(\)\.synthesize/);
  });

  it("still records the audio, on the route that makes it", async () => {
    const route = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/app/api/v1/interactions/[id]/audio/route.ts", import.meta.url), "utf8"),
    );
    // "Everything saved" is unchanged: a file row is still written, just later
    // and only for the turns somebody listens to.
    expect(route).toContain("schema.files");
    expect(route).toContain("storeUpload");
    // And it is written once, however many times the answer is played.
    expect(route).toContain("existing");
  });

  it("returns 204 rather than an error when no audio can be made", async () => {
    const route = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/app/api/v1/interactions/[id]/audio/route.ts", import.meta.url), "utf8"),
    );
    // The page falls back to the handset's own voice on 204. Silence is never
    // the outcome for someone who cannot read.
    expect(route).toContain("status: 204");
    expect(route).toContain("interaction.audio_unavailable");
  });
});

describe("the sentences of an answer are rendered together", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("sends every segment at once rather than one after another", async () => {
    let inFlight = 0;
    let peak = 0;

    vi.doMock("@server/ai/gateway", () => ({
      aiGateway: () => ({
        generateJson: async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 20));
          inFlight -= 1;
          return { output: { text: "rendu" }, model: "test", inputTokens: 0, outputTokens: 0, providerKey: "test" };
        },
      }),
      resetGatewayForTests: () => undefined,
    }));

    const { localiseWithGlossary } = await import("@server/ai/agents/language");
    const { DISCLAIMERS } = await import("@server/ai/safety");

    /**
     * Free text either side of reviewed text, which is the ordinary shape of a
     * health answer: withDisclaimer appends the reviewed disclaimer to every
     * one of them, so guidance followed by the disclaimer followed by a closing
     * instruction is three segments, two of which need the model.
     */
    const answer = `Donnez-lui à boire souvent. ${DISCLAIMERS.fr} Retournez au centre demain matin.`;
    const out = await localiseWithGlossary(answer, "ln", { module: "health" });

    expect(out.text.length).toBeGreaterThan(0);
    // The point of the change: more than one call was open at the same time.
    expect(peak).toBeGreaterThan(1);
  });

  it("keeps the sentences in the order the answer was written", async () => {
    vi.doMock("@server/ai/gateway", () => ({
      aiGateway: () => ({
        // Each segment takes longer the earlier it is, so an implementation
        // that returned them as they finished would reverse them.
        generateJson: async (req: { user: string }) => {
          const first = req.user.includes("boire");
          await new Promise((r) => setTimeout(r, first ? 40 : 5));
          return { output: { text: first ? "EKOTI" : "ESUKI" }, model: "t", inputTokens: 0, outputTokens: 0, providerKey: "t" };
        },
      }),
      resetGatewayForTests: () => undefined,
    }));
    const { localiseWithGlossary } = await import("@server/ai/agents/language");
    const { DISCLAIMERS } = await import("@server/ai/safety");
    const out = await localiseWithGlossary(`Donnez-lui à boire souvent. ${DISCLAIMERS.fr} Retournez au centre demain matin.`, "ln", { module: "health" });
    expect(out.text.indexOf("EKOTI")).toBeLessThan(out.text.indexOf("ESUKI"));
  });
});
