import { beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests, getDb, schema } from "@/lib/db/client";
import { runInteraction } from "@/lib/ai/agents/orchestrator";
import { eq } from "drizzle-orm";

describe("citizen interaction pipeline (offline provider)", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("escalates a critical health message in Lingala and opens a case", async () => {
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ isAnonymous: true, role: "citizen", languagePreference: "ln", province: "Kinshasa" }).returning();
    const out = await runInteraction({ user: { userId: user.id, role: "citizen", language: "ln", province: "Kinshasa" }, text: "Mwana na ngai azali na convulsions mpe akoki kopema te", wantsAudio: false });
    expect(out.status).toBe("completed");
    expect(out.module).toBe("health");
    expect(out.language).toBe("ln");
    expect(out.answer.risk.level).toBe("critical");
    expect(out.answer.escalation.required).toBe(true);
    expect(out.caseId).toBeTruthy();
    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, out.caseId!));
    expect(c.status).toBe("escalated");
    const notifs = await db.select().from(schema.notifications);
    expect(notifs.some((n) => n.type === "escalation" || n.type === "emergency" || n.type === "alert")).toBe(true);
    const corpus = await db.select().from(schema.languageCorpus).where(eq(schema.languageCorpus.interactionId, out.interactionId));
    expect(corpus).toHaveLength(1);
  });

  it("answers an agriculture question without escalation and stores a report", async () => {
    const db = await getDb();
    const out = await runInteraction({ user: null, moduleHint: "agriculture", text: "Quel engrais utiliser pour mon champ d'arachide sur sol sableux ?", province: "Kasaï", wantsAudio: false });
    expect(out.status).toBe("completed");
    expect(out.module).toBe("agriculture");
    expect(out.answer.escalation.required).toBe(false);
    const reports = await db.select().from(schema.agricultureReports).where(eq(schema.agricultureReports.interactionId, out.interactionId));
    expect(reports).toHaveLength(1);
    expect(out.answer.summary).toContain("[agriculture]");
  });

  it("returns the seven-part answer for an education request", async () => {
    const out = await runInteraction({ user: null, text: "Je ne comprends pas les fractions", wantsAudio: false });
    expect(out.module).toBe("education");
    expect(out.answer).toMatchObject({ asking: expect.any(String), understanding: expect.any(String), risk: expect.any(Object), action: expect.any(String), escalation: expect.any(Object), confidence: expect.any(Object), summary: expect.any(String) });
    expect(out.answer.action).toContain("fraction");
  });

  it("fails gracefully on an empty voice note", async () => {
    const out = await runInteraction({ user: null, audio: { data: Buffer.alloc(10), mimeType: "audio/webm" }, wantsAudio: false });
    expect(out.status).toBe("failed");
    expect(out.responseText.length).toBeGreaterThan(10);
  });
});
