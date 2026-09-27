/**
 * NFR-A-01: what a danger sign gets when every AI provider is unreachable.
 *
 * This was a silent, total failure. The web pipeline begins with a model call —
 * language and module classification — so a provider outage failed the whole
 * turn, and a caregiver who had written that their baby was not breathing and
 * could no longer feed received "Le service est momentanément indisponible,
 * réessayez dans quelques instants". No instruction, no case, nobody alerted.
 * The IVR path had short-circuited on danger keywords since it was written; the
 * web path, which is what most people use, never did.
 *
 * An outage is also the most likely moment for this to matter: the networks this
 * platform runs on drop providers far more often than they drop the platform,
 * and someone on a bad line may not get a second chance to ask.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { resetGatewayForTests } from "@server/ai/gateway";
import { runInteraction } from "@server/ai/agents/orchestrator";
import { EMERGENCY_MESSAGES } from "@server/ai/safety";

/** Points every capability at a provider with no credentials, and forbids the mock. */
function breakEveryProvider() {
  process.env.AI_ALLOW_MOCK = "false";
  process.env.AI_LLM_ORDER = "anthropic";
  process.env.AI_STT_ORDER = "openai";
  resetGatewayForTests();
}

function restoreProviders() {
  process.env.AI_ALLOW_MOCK = "true";
  process.env.AI_LLM_ORDER = "mock";
  process.env.AI_STT_ORDER = "mock";
  resetGatewayForTests();
}

describe("a danger sign during a total provider outage", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    breakEveryProvider();
  });
  afterAll(restoreProviders);

  it("still reads the reviewed instruction, in French", async () => {
    const out = await runInteraction({ user: null, text: "Mon bébé ne respire pas bien et il ne peut plus téter", wantsAudio: false });
    expect(out.module).toBe("health");
    expect(out.answer.risk.level).toBe("critical");
    expect(out.responseText.startsWith(EMERGENCY_MESSAGES.fr)).toBe(true);
    expect(out.responseText).toContain("Pendant le trajet");
  });

  it("still escalates and opens a case a human can pick up", async () => {
    const db = await getDb();
    const out = await runInteraction({ user: null, text: "Mon bébé ne respire pas bien et il ne peut plus téter", wantsAudio: false });
    expect(out.answer.escalation.required).toBe(true);
    expect(out.caseId, "an outage must not swallow the alert").toBeTruthy();
    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, out.caseId!));
    expect(c.severity).toBe("critical");
    expect(c.module).toBe("health");
  });

  it("reads the instruction in the citizen's language, chosen without a model", async () => {
    const sw = await runInteraction({ user: null, text: "Mtoto wangu ana degedege na hawezi kunywa", wantsAudio: false });
    expect(sw.language).toBe("sw");
    expect(sw.responseText.startsWith(EMERGENCY_MESSAGES.sw)).toBe(true);

    const lua = await runInteraction({ user: null, text: "Muana wanyi udi ne kutshinguluka ne kavua mua kunua", wantsAudio: false });
    expect(lua.language).toBe("lua");
    expect(lua.responseText.startsWith(EMERGENCY_MESSAGES.lua)).toBe(true);
  });

  it("honours a stated language preference over the guess", async () => {
    const db = await getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ isAnonymous: true, role: "citizen", languagePreference: "kg", province: "Kongo-Central" })
      .returning();
    const out = await runInteraction({
      user: { userId: user.id, role: "citizen", language: "kg", province: "Kongo-Central" },
      text: "Mon bébé ne respire pas bien et il ne peut plus téter",
      wantsAudio: false,
    });
    expect(out.language).toBe("kg");
    expect(out.responseText.startsWith(EMERGENCY_MESSAGES.kg)).toBe(true);
  });

  it("records the outage on the interaction rather than hiding a degraded answer", async () => {
    const db = await getDb();
    const out = await runInteraction({ user: null, text: "Mtoto wangu ana degedege na hawezi kunywa", wantsAudio: false });
    const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, out.interactionId));
    // The citizen is told what to do; the record still says the pipeline failed
    // and why, so this never reads as a normal turn in the dashboards.
    expect(row.status).toBe("failed");
    expect(row.errorMessage ?? "").not.toHaveLength(0);
    expect(out.answer.risk.flags).toContain("repli_hors_ligne");
  });

  it("does not invent an emergency for an ordinary message", async () => {
    const out = await runInteraction({ user: null, text: "Bonjour, comment allez-vous ?", wantsAudio: false });
    expect(out.status).toBe("failed");
    expect(out.module).toBe("general");
    expect(out.answer.escalation.required).toBe(false);
    expect(out.caseId).toBeNull();
    expect(out.responseText).toContain("momentanément indisponible");
  });

  it("does not invent an emergency for an ordinary agriculture question", async () => {
    const out = await runInteraction({ user: null, text: "Quel engrais pour mon champ d'arachide ?", wantsAudio: false });
    expect(out.answer.escalation.required).toBe(false);
    expect(out.caseId).toBeNull();
  });
});

describe("with providers restored", () => {
  beforeAll(async () => {
    restoreProviders();
    resetDbForTests();
    await getDb();
  });

  it("goes back through the full pipeline", async () => {
    const out = await runInteraction({ user: null, text: "Mon bébé ne respire pas bien et il ne peut plus téter", wantsAudio: false });
    expect(out.status).toBe("completed");
    expect(out.answer.risk.flags).not.toContain("repli_hors_ligne");
  });
});
