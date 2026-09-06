/**
 * Contract test for the orchestrator patch.
 *
 * The orchestrator owns persistence of the agriculture and education records; this test
 * runs exactly the mapping the patch adds, so the extra fields returned by the two agents
 * are proven to fit their columns (types and lengths) before the patch is applied.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { assessAgriculture } from "@/lib/ai/agents/agriculture";
import { assessEducation } from "@/lib/ai/agents/education";
import { detectClusters } from "@/lib/ai/agents/clusters";
import { ensureAgricultureReference } from "@/lib/db/reference/agriculture";

describe("orchestrator contract · agriculture and education persistence", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    await ensureAgricultureReference();
  });

  it("stores every additive agriculture field on agriculture_reports", async () => {
    const db = await getDb();
    const [interaction] = await db.insert(schema.interactions).values({ module: "agriculture", channel: "text", status: "completed", province: "Kwilu" }).returning();
    const province = "Kwilu";
    const agriculture = await assessAgriculture(
      "Les feuilles de mon manioc jaunissent et se déforment, la maladie se propage à tout le champ",
      { province, userId: null, territory: "Bulungu" },
      [],
      interaction.id,
    );

    // ---- exactly the values the orchestrator patch writes ----
    await db.insert(schema.agricultureReports).values({
      interactionId: interaction.id,
      cropType: agriculture.cropType,
      issueType: agriculture.issueType,
      evidenceFileIds: [],
      province,
      aiDiagnosis: agriculture.likelyDiagnosis,
      recommendation: agriculture.recommendation,
      confidence: agriculture.confidence,
      urgent: agriculture.urgent,
      territory: agriculture.territory,
      season: agriculture.seasonCode,
      growthStage: agriculture.growthStage,
      affectedProportion: agriculture.affectedProportion,
      recentInputs: agriculture.recentInputs,
      candidates: agriculture.candidates.map((c) => ({ label: c.label, prob: c.probability, evidenceFor: c.evidenceFor, evidenceAgainst: c.evidenceAgainst })),
      topProb: agriculture.topProb,
      isNotifiable: agriculture.isNotifiable,
      evidenceQuality: {
        visionUsed: agriculture.evidenceQuality.visionUsed,
        attachments: agriculture.evidenceQuality.attachments,
        usable: agriculture.evidenceQuality.usable,
        videoOnly: agriculture.evidenceQuality.videoOnly,
        summary: agriculture.evidenceQuality.summary,
        recaptureGuidance: agriculture.evidenceQuality.recaptureGuidance,
        exifNotes: agriculture.evidenceQuality.exifNotes,
      },
      missingEvidence: agriculture.missingEvidence,
      actionsToAvoid: agriculture.actionsToAvoid,
      tieredActions: agriculture.tieredActions,
    });

    const [row] = await db.select().from(schema.agricultureReports).where(eq(schema.agricultureReports.interactionId, interaction.id));
    expect(row.candidates.length).toBeGreaterThan(0);
    expect(row.candidates[0].prob).toBeGreaterThan(0);
    expect(row.topProb).toBe(agriculture.topProb);
    expect(row.season).toBe(agriculture.seasonCode);
    expect(row.growthStage).toBe(agriculture.growthStage);
    expect(row.affectedProportion).toBe("tout_le_champ");
    expect(row.territory).toBe("Bulungu");
    expect(row.tieredActions.noCost.length).toBeGreaterThan(0);
    expect(row.missingEvidence.length).toBeGreaterThan(0);
    expect(row.actionsToAvoid.length).toBeGreaterThan(0);
    expect(row.evidenceQuality).toMatchObject({ visionUsed: false, attachments: 0 });
    // Column lengths (varchar) are respected.
    expect((row.season ?? "").length).toBeLessThanOrEqual(32);
    expect((row.growthStage ?? "").length).toBeLessThanOrEqual(48);
    expect((row.affectedProportion ?? "").length).toBeLessThanOrEqual(32);
    expect((row.territory ?? "").length).toBeLessThanOrEqual(120);
  });

  it("opens a cluster from the reports the orchestrator has just written", async () => {
    const db = await getDb();
    const [interaction] = await db.insert(schema.interactions).values({ module: "agriculture", channel: "text", status: "completed" }).returning();
    for (let i = 0; i < 4; i++) {
      await db.insert(schema.agricultureReports).values({
        interactionId: interaction.id,
        cropType: "manioc",
        issueType: "crop_disease",
        province: "Kwilu",
        territory: "Bulungu",
        candidates: [{ label: "Mosaïque africaine du manioc", prob: 0.58 }],
      });
    }
    const r = await detectClusters({ province: "Kwilu" });
    expect(r.created).toHaveLength(1);
    expect(r.created[0].status).toBe("unverified");
  });

  it("stores every additive education field on education_sessions", async () => {
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ isAnonymous: true, role: "citizen", languagePreference: "fr" }).returning();
    const [interaction] = await db.insert(schema.interactions).values({ module: "education", channel: "text", status: "completed", province: "Kinshasa" }).returning();
    const education = await assessEducation("Explique-moi les fractions", { province: "Kinshasa", userId: user.id, language: "fr" }, interaction.id);

    // ---- exactly the values the orchestrator patch writes ----
    await db.insert(schema.educationSessions).values({
      interactionId: interaction.id,
      learnerAgeGroup: education.learnerAgeGroup,
      subject: education.subject,
      topic: education.topic,
      difficultyLevel: education.difficultyLevel,
      explanation: education.explanation,
      quiz: education.quiz,
      progressSignal: education.learningDifficulty === "none" ? "on_track" : "needs_support",
      province: "Kinshasa",
      mode: education.mode,
      objective: education.objective,
      score: education.score,
      steps: education.steps,
      masterySignal: education.masterySignal,
      userId: user.id,
    });

    const [row] = await db.select().from(schema.educationSessions).where(eq(schema.educationSessions.interactionId, interaction.id));
    expect(row.mode).toBe("explain");
    expect(row.objective).toBeTruthy();
    expect(row.steps.length).toBe(10);
    expect(row.userId).toBe(user.id);
    expect(row.mode.length).toBeLessThanOrEqual(24);
    expect((row.masterySignal ?? "").length).toBeLessThanOrEqual(24);
  });
});
