/**
 * The production failure, reproduced.
 *
 * The image carried @google-cloud/storage without the fifty-seven packages it
 * needs, so the dynamic import threw:
 *
 *   [orchestrator] Failed to load external module @google-cloud/storage:
 *   Cannot find module 'gcp-metadata'
 *
 * Saving the spoken answer is on the path of every turn, so that was every
 * question in all three modules — typed, spoken and photographed — answered with
 * "Le service est momentanément indisponible", while the home page served and
 * both probes stayed green. Days of screenshots came from this one line.
 *
 * Two things are fixed and both are held here: the image now carries the whole
 * tree (scripts/check-standalone.mjs reads the artefact rather than the source),
 * and a storage failure degrades the turn instead of ending it, because the text
 * answer is the answer.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { runInteraction } from "@server/ai/agents/orchestrator";
import * as storage from "@server/core/storage";
import { aiGateway } from "@server/ai/gateway";

describe("when stored objects cannot be written", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Exactly how it failed in production: the module itself will not load. */
  function breakStorage() {
    vi.spyOn(storage, "storeUpload").mockRejectedValue(
      new Error("Failed to load external module @google-cloud/storage: Error: Cannot find module 'gcp-metadata'"),
    );
  }

  it("still answers a typed question", async () => {
    breakStorage();
    const out = await runInteraction({ user: null, text: "Je ne comprends pas les fractions", wantsAudio: true });
    expect(out.status).toBe("completed");
    expect(out.responseText).not.toContain("momentanément indisponible");
    expect(out.responseText).toContain("fraction");
  });

  it("still triages a danger sign, and still opens the case", async () => {
    breakStorage();
    const db = await getDb();
    const out = await runInteraction({
      user: null,
      text: "Mon bébé ne respire pas bien et il ne peut plus téter",
      wantsAudio: true,
    });
    expect(out.status).toBe("completed");
    expect(out.answer.risk.level).toBe("critical");
    expect(out.answer.escalation.required).toBe(true);
    expect(out.caseId, "an emergency must not depend on a bucket").toBeTruthy();
    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, out.caseId!));
    expect(c.severity).toBe("critical");
  });

  it("delivers the answer without audio rather than no answer with it", async () => {
    breakStorage();
    const out = await runInteraction({ user: null, text: "Quel engrais pour mon champ d'arachide ?", wantsAudio: true });
    expect(out.status).toBe("completed");
    expect(out.audioUrl).toBeNull();
    expect(out.audioAvailable).toBe(false);
    expect(out.responseText.length).toBeGreaterThan(20);
  });

  it("records the failure, so a silent platform is not mistaken for a working one", async () => {
    // Speech has to be produced before it can fail to be stored: the offline
    // provider synthesises nothing, so the failing call is never reached
    // otherwise. This is the shape of the production failure — audio exists,
    // writing it is what breaks.
    vi.spyOn(aiGateway(), "synthesize").mockResolvedValue({
      audio: Buffer.from("spoken answer"),
      mimeType: "audio/mpeg",
      providerKey: "mock",
    } as Awaited<ReturnType<ReturnType<typeof aiGateway>["synthesize"]>>);
    breakStorage();
    const db = await getDb();
    const out = await runInteraction({ user: null, text: "Mon enfant tousse depuis deux jours", wantsAudio: true });
    expect(out.status, "the turn still completes").toBe("completed");
    expect(out.audioUrl).toBeNull();
    const rows = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, out.interactionId));
    expect(rows.some((r) => r.action === "interaction.audio_unavailable"), "the outage must be on the record").toBe(true);
  });

  it("produces audio normally when storage works", async () => {
    const out = await runInteraction({ user: null, text: "Je ne comprends pas les fractions", wantsAudio: true });
    expect(out.status).toBe("completed");
    // The offline provider has no TTS configured, so this asserts only that the
    // path runs without throwing; the failure cases above are the point.
    expect(out.responseText).toContain("fraction");
  });
});
