/**
 * Health triage end to end with the offline provider (AI_LLM_ORDER=mock):
 * red-flag recall in the five languages, safeguarding routing, citation enforcement,
 * and the HEA-001 output contract.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { assessHealth, nearestFacility, capWords } from "@/lib/ai/agents/health";
import { scoreRisk } from "@/lib/ai/agents/risk";
import { HealthTriageContract } from "@/lib/ai/schemas";
import { detectDangerSigns, detectSafeguarding, SAFEGUARDING_NOTIFICATION_BODY } from "@/lib/ai/safety";
import { selectProtocolId, extractEntities } from "@/lib/ai/protocols/extraction";
import { listProtocols, loadApprovedProtocol, setProtocolStatus } from "@/lib/ai/protocols/registry";
import { approvedDocIds, listKnowledgeDocuments, searchKnowledge } from "@/lib/ai/knowledge";

describe("health triage (offline provider)", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await db.insert(schema.serviceDirectory).values([
      { type: "cs", name: "Centre de santé de Kimbanseke", province: "Kinshasa", territory: "Kimbanseke", healthZone: "Kimbanseke", phone: "+243810000001" },
      { type: "hgr", name: "Hôpital Général de Référence de Kinshasa", province: "Kinshasa", territory: "Gombe", healthZone: "Gombe", phone: "+243810000002" },
    ]);
  });

  /* ------------------------------------------------------------------------------------
   * Red-flag recall with no language model available beyond the offline rules engine.
   * ---------------------------------------------------------------------------------- */
  const redFlagCases: Array<[string, string, string]> = [
    ["français — convulsions chez un enfant fébrile", "Mon enfant de 3 ans a de la fièvre depuis 2 jours et il a des convulsions", "child_fever_u5"],
    ["lingala — l'enfant ne respire plus normalement", "Mwana na ngai akoki kopema te", "general_symptom_intake"],
    ["swahili — homa na degedege", "Mtoto wangu ana homa na degedege", "child_fever_u5"],
    ["kikongo — menga mingi", "Mwana kele na menga mingi", "general_symptom_intake"],
    ["tshiluba — kutshinguluka", "Muana udi ne kutshinguluka", "general_symptom_intake"],
    ["français — nourrisson qui ne tète plus", "Mon nouveau-né ne tète plus depuis hier", "newborn_danger_signs"],
    ["français — saignement pendant la grossesse", "Je suis enceinte de 7 mois et je saigne beaucoup", "pregnancy_danger_signs"],
    ["français — morsure de serpent", "Mon frère a été mordu par un serpent au champ", "injury_bleeding"],
    ["français — déshydratation sévère", "Ma fille a la diarrhée, elle est très molle et ses yeux sont enfoncés", "diarrhoea_dehydration"],
  ];

  it.each(redFlagCases)("%s → urgence immédiate", async (_label, message, expectedProtocol) => {
    const out = await assessHealth(message, { province: "Kinshasa", language: "fr" }, randomUUID());
    expect(out.protocolId).toBe(expectedProtocol);
    expect(out.severityLevel).toBe(4);
    expect(out.riskBand).toBe("emergency");
    expect(out.timeToAction).toBe("immediate");
    expect(out.careDestinationType).toBe("emergency_referral");
    expect(out.triggeredRuleIds.length).toBeGreaterThan(0);
    expect(out.humanReviewRequired).toBe(true);
    expect(out.emergencyScript).toBeTruthy();
    expect(out.clarifications).toHaveLength(0);
    // Legacy surface stays consistent for the orchestrator.
    expect(out.severity).toBe("critical");
    expect(out.clinicReferral).toBe("immediately");
  });

  it("keeps danger-sign detection purely deterministic", () => {
    expect(detectDangerSigns("Mtoto wangu ana degedege")).toContain("convulsions");
    expect(detectDangerSigns("akoki kopema te")).toContain("breathing_difficulty");
    expect(detectDangerSigns("il y a beaucoup de sang")).toContain("heavy_bleeding");
    expect(detectDangerSigns("Bonjour, comment ça va ?")).toEqual([]);
  });

  /* ------------------------------------------------------------------------------------
   * Protocol routing
   * ---------------------------------------------------------------------------------- */
  const routingCases: Array<[string, string]> = [
    ["Mon bébé de 9 mois n'a pas reçu le vaccin contre la rougeole", "vaccination_schedule"],
    ["Le bracelet MUAC de mon enfant est à 112 mm", "malnutrition_screening"],
    ["Je tousse depuis trois semaines et je maigris", "cough_breathing"],
    ["J'ai de la fièvre depuis quatre jours", "adult_fever"],
    ["Je me suis brûlé la main avec de l'eau chaude", "injury_bleeding"],
    ["J'ai mal à la tête depuis deux jours", "general_symptom_intake"],
  ];

  it.each(routingCases)("route « %s » vers %s", (message, protocolId) => {
    expect(selectProtocolId(message, extractEntities(message))).toBe(protocolId);
  });

  /* ------------------------------------------------------------------------------------
   * Output contract (HEA-001..005)
   * ---------------------------------------------------------------------------------- */
  it("returns a valid output contract with citations and confidence dimensions", async () => {
    const out = await assessHealth("Mon enfant de 2 ans a de la fièvre depuis 2 jours", { province: "Kinshasa", language: "fr" }, randomUUID());
    expect(HealthTriageContract.safeParse(out.contract).success).toBe(true);
    expect(out.protocolId).toBe("child_fever_u5");
    expect(out.protocolVersion).toBe("1.0.0");
    expect(out.citations[0]).toBe("child_fever_u5@1.0.0");
    expect(out.citations.some((c) => c.startsWith("KB-HE-"))).toBe(true);
    expect(Object.keys(out.confidenceDimensions).sort()).toEqual(["evidence", "intent", "knowledgeCoverage", "language", "transcription"]);
    expect(out.followUpAt.getTime()).toBeGreaterThan(Date.now());
    expect(out.prohibitedClaimCheck.passed).toBe(true);
    expect(out.severityLevel).toBeGreaterThanOrEqual(2);
  });

  it("asks at most two clarifications and reports insufficient information", async () => {
    const out = await assessHealth("J'ai mal quelque part", { language: "fr" }, randomUUID());
    expect(out.clarifications.length).toBeLessThanOrEqual(2);
    expect(out.riskBand).toBe("insufficient_information");
    expect(out.followUpQuestions.length).toBeLessThanOrEqual(2);
  });

  it("keeps health summaries at 60 words or fewer", async () => {
    const out = await assessHealth("Mon enfant a la diarrhée depuis trois jours et vomit", { language: "fr" }, randomUUID());
    expect(out.explanationSummary.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(61);
    expect(capWords("un deux trois quatre", 2)).toBe("un deux…");
  });

  it("never produces a dosing or diagnosis statement", async () => {
    const out = await assessHealth("Mon enfant a la fièvre, quel médicament donner ?", { language: "fr" }, randomUUID());
    expect(out.guidance).not.toMatch(/\d+\s*(mg|ml|comprim)/i);
    expect(out.safetyViolations).toEqual([]);
  });

  /* ------------------------------------------------------------------------------------
   * Emergency script and facility directory (FR-HE-12, HEA-004)
   * ---------------------------------------------------------------------------------- */
  it("names the nearest known facility in an emergency", async () => {
    const out = await assessHealth("Mon enfant a des convulsions", { province: "Kinshasa", healthZone: "Kimbanseke", language: "fr" }, randomUUID());
    expect(out.facility?.name).toBe("Centre de santé de Kimbanseke");
    expect(out.emergencyScript).toContain("Centre de santé de Kimbanseke");
  });

  it("states the limitation when no facility is known for the area", async () => {
    const out = await assessHealth("Mon enfant a des convulsions", { province: "Sankuru", language: "fr" }, randomUUID());
    expect(out.facility).toBeNull();
    expect(out.emergencyScript).toContain("Je ne connais pas encore la structure de santé la plus proche");
  });

  it("gives the emergency script in the citizen's language", async () => {
    const out = await assessHealth("Mtoto wangu ana degedege", { province: "Kinshasa", language: "sw" }, randomUUID());
    expect(out.emergencyScript).toContain("Nenda sasa kituo cha afya");
  });

  it("returns null from the directory when the province is unknown", async () => {
    expect(await nearestFacility({ province: null })).toBeNull();
    expect(await nearestFacility({ province: "Ituri" })).toBeNull();
  });

  /* ------------------------------------------------------------------------------------
   * Safeguarding (PRD 5.6)
   * ---------------------------------------------------------------------------------- */
  it("routes a disclosure to the restricted pathway without leaking details", async () => {
    const interactionId = randomUUID();
    const db = await getDb();
    const out = await assessHealth("Mon mari me frappe et j'ai peur à la maison", { province: "Kinshasa", language: "fr" }, interactionId);
    expect(out.safeguarding).toBe(true);
    expect(out.safeguardingCategories).toContain("violence_physique");
    expect(out.humanReviewRequired).toBe(true);
    // Immediate danger: the clinical severity is raised to an emergency.
    expect(out.severityLevel).toBe(4);
    // Ordinary notification material carries no detail whatsoever.
    expect(out.understanding).toBe(SAFEGUARDING_NOTIFICATION_BODY);
    expect(out.explanationSummary).toBe(SAFEGUARDING_NOTIFICATION_BODY);
    expect(out.understanding).not.toMatch(/frappe|mari|peur/i);
    expect(out.safeguardingNotice?.title).toBe("Dossier protégé à examiner");
    // The disclosure is never promised secrecy.
    expect(out.guidance).toContain("Je ne peux pas garder cela pour moi seul");
    const records = await db.select().from(schema.safeguardingRecords).where(eq(schema.safeguardingRecords.interactionId, interactionId));
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe("violence_physique");
    expect(records[0].status).toBe("open");
  });

  it("detects disclosures in the five languages", () => {
    expect(detectSafeguarding("nataka kujiua").categories).toContain("auto_agression");
    expect(detectSafeguarding("bo ke bula mono").categories).toContain("violence_physique");
    expect(detectSafeguarding("badi bangumisha").categories).toContain("violence_physique");
    expect(detectSafeguarding("babeti ngai").categories).toContain("violence_physique");
    expect(detectSafeguarding("Mon champ de manioc est malade").detected).toBe(false);
  });

  it("treats a self-harm disclosure as an emergency", async () => {
    const out = await assessHealth("Je veux mourir, je ne supporte plus rien", { language: "fr" }, randomUUID());
    expect(out.safeguarding).toBe(true);
    expect(out.safeguardingCategories).toContain("auto_agression");
    expect(out.severityLevel).toBe(4);
    expect(out.triggeredRuleIds).toContain("RF-SAFEGUARDING-IMMEDIATE-DANGER");
  });

  /* ------------------------------------------------------------------------------------
   * Protocol registry
   * ---------------------------------------------------------------------------------- */
  it("lists and retires protocol versions through the registry", async () => {
    const listed = await listProtocols();
    expect(listed.map((p) => p.protocolId)).toContain("child_fever_u5");
    const summary = listed.find((p) => p.protocolId === "child_fever_u5")!;
    expect(summary.questionCount).toBeGreaterThan(3);
    expect(summary.ruleIds.length).toBeGreaterThan(0);
    expect(summary.citations).toContain("KB-HE-FEVER-01");

    await setProtocolStatus("adult_fever", "1.0.0", "retired");
    expect(await loadApprovedProtocol("adult_fever")).toBeNull();
    await setProtocolStatus("adult_fever", "1.0.0", "approved");
    expect((await loadApprovedProtocol("adult_fever"))?.id).toBe("adult_fever");
    expect(await loadApprovedProtocol("inconnu")).toBeNull();
  });

  it("exposes the approved knowledge base with citable identifiers", async () => {
    const documents = await listKnowledgeDocuments("health");
    expect(documents.length).toBeGreaterThanOrEqual(12);
    expect(documents.every((d) => d.status === "approved")).toBe(true);
    expect(documents.every((d) => d.approvedBy === "En attente du Comité de Revue Clinique")).toBe(true);
    expect(documents.map((d) => d.docId)).toEqual(expect.arrayContaining(["KB-HE-FEVER-01", "KB-HE-DIARR-01", "KB-HE-VACC-01", "KB-HE-MEDS-01"]));

    const hits = await searchKnowledge("health", "préparation SRO réhydratation diarrhée", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.docId)).toContain("KB-HE-DIARR-01");
    expect(await approvedDocIds(["KB-HE-FEVER-01", "KB-INEXISTANT-99"])).toEqual(new Set(["KB-HE-FEVER-01"]));
  });

  it("records every protocol version on first use", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.protocolVersions);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const row of rows) {
      expect(row.status).toBe("approved");
      expect(row.approvedBy).toBe("pending CRB");
      expect(row.module).toBe("health");
    }
  });
});

/* ========================================================================================
 * Citation enforcement (AI-04 / AI-13) — run last: it empties the knowledge base.
 * ====================================================================================== */
describe("citation enforcement", () => {
  it("blocks an uncited health recommendation in the risk agent", () => {
    const cited = scoreRisk({ module: "health", languageConfidence: 0.9, domainConfidence: 0.8, severityLevel: 1, riskBand: "routine", citations: ["child_fever_u5@1.0.0", "KB-HE-FEVER-01"] });
    expect(cited.citationsOk).toBe(true);
    expect(cited.blocked).toBe(false);

    const uncited = scoreRisk({ module: "health", languageConfidence: 0.9, domainConfidence: 0.8, severityLevel: 1, riskBand: "routine", citations: [] });
    expect(uncited.citationsOk).toBe(false);
    expect(uncited.blocked).toBe(true);
    expect(uncited.flags).toContain("citation_manquante");
    expect(uncited.humanReviewRequired).toBe(true);
    expect(uncited.severityLevel).toBe(2);

    const agri = scoreRisk({ module: "agriculture", languageConfidence: 0.9, domainConfidence: 0.8, citations: [] });
    expect(agri.blocked).toBe(true);
  });

  it("only raises the protocol severity, never lowers it", () => {
    // A protocol emergency stays an emergency even when every other signal is calm.
    const high = scoreRisk({ module: "health", languageConfidence: 1, domainConfidence: 1, severityLevel: 4, riskBand: "emergency", citations: ["p@1"] });
    expect(high.severityLevel).toBe(4);
    expect(high.level).toBe("critical");
    expect(high.escalationRequired).toBe(true);

    // A safeguarding disclosure raises a level-1 protocol outcome.
    const raised = scoreRisk({ module: "health", languageConfidence: 1, domainConfidence: 1, severityLevel: 1, riskBand: "routine", citations: ["p@1"], safeguarding: true });
    expect(raised.severityLevel).toBe(3);
    expect(raised.level).toBe("high");
    expect(raised.flags).toContain("sauvegarde");
  });

  it("keeps the legacy agriculture and education behaviour intact", () => {
    const agri = scoreRisk({
      module: "agriculture",
      agriculture: { understanding: "", cropType: "manioc", issueType: "crop_disease", likelyDiagnosis: "", urgent: true, severity: "high", recommendation: "", lowCostInterventions: [], followUpQuestions: [], confidence: 0.8 },
      languageConfidence: 0.9,
      domainConfidence: 0.8,
    });
    expect(agri.level).toBe("high");
    expect(agri.escalationRequired).toBe(true);
    expect(agri.severityLevel).toBeNull();
    expect(agri.citationsOk).toBe(true);

    const edu = scoreRisk({
      module: "education",
      education: { understanding: "", learnerAgeGroup: "10-12", subject: "maths", topic: "fractions", difficultyLevel: "beginner", explanation: "", quiz: [], studyAction: "", learningDifficulty: "none", followUpQuestions: [], confidence: 0.8 },
      languageConfidence: 0.9,
      domainConfidence: 0.8,
    });
    expect(edu.level).toBe("low");
    expect(edu.escalationRequired).toBe(false);
  });

  it("falls back to a scripted answer and emits ai.contract.violation when no source can be cited", async () => {
    const db = await getDb();
    await db.delete(schema.kbChunks);
    await db.delete(schema.kbDocuments);
    const interactionId = randomUUID();
    const out = await assessHealth("Mon enfant de 2 ans a de la fièvre depuis 2 jours", { province: "Kinshasa", language: "fr" }, interactionId);
    expect(out.citations).toEqual(["child_fever_u5@1.0.0"]);
    expect(out.guidance).toContain("Je ne peux pas vous donner de conseil fiable");
    expect(out.humanReviewRequired).toBe(true);
    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.aggregateId, interactionId));
    const violation = events.find((e) => e.eventType === "ai.contract.violation");
    expect(violation).toBeTruthy();
    expect((violation!.payload as Record<string, unknown>).reason).toBe("health_recommendation_without_citation");
    expect((violation!.payload as Record<string, unknown>).rule).toBe("AI-04");
  });
});
