/**
 * Health Agent — deterministic triage.
 *
 * Pipeline for one turn:
 *   safeguarding screen → entity extraction → protocol selection → answer mapping
 *   → protocol engine (the ONLY place severity is decided) → knowledge retrieval and citation
 *   enforcement → explanation → emergency script and facility lookup → output contract.
 *
 * The language model is used for exactly two things: turning free speech into protocol
 * answers, and explaining an outcome that has already been decided. Every answer it proposes
 * is overwritten by the deterministic keyword pass wherever the two disagree, so danger-sign
 * recall is identical with or without a model (FR-HE-03, AI-02).
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode } from "@server/db/schema";
import { emitEvent } from "@server/core/events";
import { aiGateway } from "../gateway";
import {
  HealthAssessment,
  HealthEntityExtraction,
  HealthExplanation,
  HealthProtocolAnswers,
  HealthTriageContract,
  SafeguardingFlag,
} from "../schemas";
import {
  HEALTH_ENTITY_SYSTEM,
  HEALTH_EXPLANATION_SYSTEM,
  HEALTH_PROTOCOL_ANSWERS_SYSTEM,
  SAFEGUARDING_SYSTEM,
  healthExplanationUser,
  messageEnvelope,
  protocolAnswersUser,
  type PromptQuestion,
} from "../prompts";
import {
  withDisclaimer,
  EMERGENCY_INSTRUCTIONS,
  FACILITY_UNKNOWN_NOTE,
  SAFEGUARDING_EMERGENCY_CATEGORIES,
  SAFEGUARDING_NOTIFICATION_BODY,
  SAFEGUARDING_NOTIFICATION_TITLE,
  SAFEGUARDING_RESPONSES,
  detectSafeguarding,
  sanitiseHealthGuidance,
  type SafeguardingCategory,
} from "../safety";
import { knowledgePromptFragment, searchKnowledge, approvedDocIds, type KnowledgeHit } from "../knowledge";
import {
  MAX_CLARIFICATIONS,
  deterministicAnswers,
  extractEntities,
  mergeAnswers,
  protocolCitation,
  runProtocol,
  selectProtocolId,
  type AnswerMap,
  type CareDestinationType,
  type HealthEntities,
  type HealthProtocol,
  type ProtocolRunResult,
  type RiskBand,
  type SeverityLevel,
  type TimeToAction,
} from "../protocols";
import { getProtocol } from "../protocols/definitions";
import { ensureProtocolsRegistered, loadApprovedProtocol } from "../protocols/registry";

export interface HealthContext {
  province?: string | null;
  ageHint?: string | null;
  history?: string | null;
  /** Language the citizen is answering in; scripted safety text is emitted in this language. */
  language?: LanguageCode | null;
  territory?: string | null;
  healthZone?: string | null;
  /** Confidence carried over from speech-to-text and language identification. */
  transcriptionConfidence?: number | null;
  languageConfidence?: number | null;
  /** Answers already collected in earlier turns of the same session. */
  priorAnswers?: AnswerMap | null;
  /** Force a protocol (worker override or a continued session). */
  protocolId?: string | null;
}

export interface HealthFacility {
  id: string;
  name: string;
  type: string;
  province: string;
  territory: string | null;
  healthZone: string | null;
  phone: string | null;
}

export interface HealthTriageResult extends HealthAssessment {
  safetyViolations: string[];
  protocolId: string;
  protocolVersion: string;
  answers: AnswerMap;
  severityLevel: SeverityLevel;
  riskBand: RiskBand;
  triggeredRuleIds: string[];
  timeToAction: TimeToAction;
  careDestinationType: CareDestinationType;
  clarifications: string[];
  selfCareContentIds: string[];
  citations: string[];
  prohibitedClaimCheck: { passed: boolean; violations: string[] };
  humanReviewRequired: boolean;
  followUpAt: Date;
  confidenceDimensions: { transcription: number; language: number; intent: number; evidence: number; knowledgeCoverage: number };
  explanationSummary: string;
  safeguarding: boolean;
  safeguardingCategories: SafeguardingCategory[];
  /** Neutral wording for ordinary notifications when the case is a safeguarding one. */
  safeguardingNotice: { title: string; body: string } | null;
  /** Fixed emergency instructions in the citizen's language (severity 4 only). */
  emergencyScript: string | null;
  facility: HealthFacility | null;
  knowledgeHits: KnowledgeHit[];
  contract: HealthTriageContract;
}

const LEGACY_SEVERITY: Record<SeverityLevel, HealthAssessment["severity"]> = {
  0: "low",
  1: "low",
  2: "medium",
  3: "high",
  4: "critical",
};

const LEGACY_REFERRAL: Record<SeverityLevel, HealthAssessment["clinicReferral"]> = {
  0: "none",
  1: "none",
  2: "within_days",
  3: "today",
  4: "immediately",
};

const PROTOCOL_TOPIC: Record<string, HealthAssessment["topic"]> = {
  child_fever_u5: "fever_malaria",
  adult_fever: "fever_malaria",
  cough_breathing: "respiratory",
  diarrhoea_dehydration: "diarrhoea",
  pregnancy_danger_signs: "maternal_health",
  newborn_danger_signs: "child_illness",
  injury_bleeding: "injury_emergency",
  malnutrition_screening: "nutrition",
  vaccination_schedule: "vaccination",
  general_symptom_intake: "other",
};

/** Scripted fallback used whenever a recommendation cannot be grounded in a source (AI-13). */
const UNCITED_FALLBACK_FR =
  "Je ne peux pas vous donner de conseil fiable sur ce point avec ce que je sais. Rendez-vous au centre de santé le plus proche pour un avis adapté, et partez tout de suite si un signe de danger apparaît : convulsions, difficulté à respirer, saignement abondant, perte de connaissance, impossibilité de boire.";

/** Health summaries never exceed 60 words (FR-HE-16). */
export function capWords(text: string, max = 60): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}…`;
}

function promptQuestions(protocol: HealthProtocol, language: LanguageCode): PromptQuestion[] {
  return Object.values(protocol.questions).map((q) => ({
    id: q.id,
    ask: q.ask[language] ?? q.ask.fr,
    type: q.type,
    options: q.options?.map((o) => o.value),
  }));
}

/** Nearest known facility for the citizen's area; null when the directory has nothing (HEA-004). */
export async function nearestFacility(ctx: { province?: string | null; territory?: string | null; healthZone?: string | null }): Promise<HealthFacility | null> {
  if (!ctx.province) return null;
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.serviceDirectory)
      .where(and(eq(schema.serviceDirectory.province, ctx.province), eq(schema.serviceDirectory.active, true)));
    const health = rows.filter((r) => r.type === "cs" || r.type === "hgr");
    if (!health.length) return null;
    const score = (r: (typeof health)[number]) =>
      (r.healthZone && ctx.healthZone && r.healthZone === ctx.healthZone ? 4 : 0) +
      (r.territory && ctx.territory && r.territory === ctx.territory ? 2 : 0) +
      (r.type === "cs" ? 1 : 0);
    const best = [...health].sort((a, b) => score(b) - score(a))[0];
    return { id: best.id, name: best.name, type: best.type, province: best.province, territory: best.territory, healthZone: best.healthZone, phone: best.phone };
  } catch (err) {
    console.error("[health] facility lookup failed", err);
    return null;
  }
}

async function modelEntities(textFr: string, ctx: HealthContext, interactionId?: string) {
  try {
    const r = await aiGateway().generateJson(
      {
        system: HEALTH_ENTITY_SYSTEM,
        user: messageEnvelope(textFr, { province: ctx.province, historique: ctx.history, age: ctx.ageHint }),
        schema: HealthEntityExtraction,
        schemaName: "health_entities",
        maxTokens: 900,
      },
      { interactionId },
    );
    return r.output;
  } catch (err) {
    console.warn("[health] entity extraction unavailable, using deterministic pass", err instanceof Error ? err.message : err);
    return null;
  }
}

async function modelAnswers(protocol: HealthProtocol, textFr: string, ctx: HealthContext, language: LanguageCode, interactionId?: string): Promise<AnswerMap> {
  try {
    const r = await aiGateway().generateJson(
      {
        system: HEALTH_PROTOCOL_ANSWERS_SYSTEM,
        user: protocolAnswersUser(protocol.id, promptQuestions(protocol, language), textFr, { province: ctx.province, historique: ctx.history }),
        schema: HealthProtocolAnswers,
        schemaName: "health_protocol_answers",
        maxTokens: 1200,
      },
      { interactionId },
    );
    const out: AnswerMap = {};
    for (const a of r.output.answers) {
      const question = protocol.questions[a.questionId];
      if (!question) continue; // never accept an answer to a question that does not exist
      if (question.options?.length) {
        const allowed = new Set(question.options.map((o) => o.value));
        if (Array.isArray(a.value)) {
          const kept = a.value.map(String).filter((v) => allowed.has(v));
          if (kept.length) out[a.questionId] = kept;
          continue;
        }
        if (!allowed.has(String(a.value))) continue;
      }
      out[a.questionId] = a.value;
    }
    return out;
  } catch (err) {
    console.warn("[health] answer mapping unavailable, using deterministic pass", err instanceof Error ? err.message : err);
    return {};
  }
}

async function modelSafeguarding(textFr: string, interactionId?: string) {
  try {
    const r = await aiGateway().generateJson(
      { system: SAFEGUARDING_SYSTEM, user: messageEnvelope(textFr, {}), schema: SafeguardingFlag, schemaName: "safeguarding_flag", maxTokens: 400 },
      { interactionId },
    );
    return r.output;
  } catch {
    return null;
  }
}

/** Restricted record: the detail never leaves this table (PRD 5.6). */
async function recordSafeguarding(input: { interactionId?: string; categories: SafeguardingCategory[]; isChild: boolean; note: string }) {
  try {
    const db = await getDb();
    await db.insert(schema.safeguardingRecords).values({
      interactionId: input.interactionId ?? null,
      category: input.categories[0] ?? "non_precisee",
      isChild: input.isChild,
      ownerRole: "chw",
      status: "open",
      restrictedNotes: input.note.slice(0, 4000),
    });
  } catch (err) {
    console.error("[health] safeguarding record failed", err);
  }
}

/** Links a safeguarding record to the case the orchestrator opened for the same interaction. */
export async function attachSafeguardingCase(interactionId: string, caseId: string): Promise<void> {
  try {
    const db = await getDb();
    await db
      .update(schema.safeguardingRecords)
      .set({ caseId })
      .where(eq(schema.safeguardingRecords.interactionId, interactionId));
  } catch (err) {
    console.error("[health] safeguarding case link failed", err);
  }
}

export async function assessHealth(textFr: string, ctx: HealthContext, interactionId?: string): Promise<HealthTriageResult> {
  const language: LanguageCode = ctx.language ?? "fr";
  await ensureProtocolsRegistered();

  // 1. Safeguarding screen — keywords in five languages plus the model flag.
  const keywordSafeguarding = detectSafeguarding(textFr);
  const modelFlag = await modelSafeguarding(textFr, interactionId);
  const safeguardingCategories: SafeguardingCategory[] = [...keywordSafeguarding.categories];
  if (modelFlag?.disclosure && modelFlag.category !== "aucune" && !safeguardingCategories.includes(modelFlag.category)) {
    safeguardingCategories.push(modelFlag.category);
  }
  const safeguarding = safeguardingCategories.length > 0 || Boolean(modelFlag?.disclosure);
  const safeguardingEmergency =
    safeguardingCategories.some((c) => SAFEGUARDING_EMERGENCY_CATEGORIES.includes(c)) || Boolean(modelFlag?.immediateDanger);

  // 2. Entities and protocol selection.
  const entities: HealthEntities = extractEntities(textFr);
  const model = await modelEntities(textFr, ctx, interactionId);
  const deterministicProtocolId = selectProtocolId(textFr, entities);
  const protocolId =
    ctx.protocolId && getProtocol(ctx.protocolId)
      ? ctx.protocolId
      : deterministicProtocolId !== "general_symptom_intake"
        ? deterministicProtocolId
        : (model?.suggestedProtocolId ?? deterministicProtocolId);
  const protocol = (await loadApprovedProtocol(protocolId)) ?? getProtocol("general_symptom_intake")!;

  // 3. Answers: the model proposes, the deterministic pass disposes.
  const modelMap = await modelAnswers(protocol, textFr, ctx, language, interactionId);
  const deterministic = deterministicAnswers(protocol, textFr, entities);
  const answers = mergeAnswers(deterministic, { ...(ctx.priorAnswers ?? {}), ...modelMap });

  // 4. The engine, and nothing else, decides severity.
  const run: ProtocolRunResult = runProtocol(protocol, answers);
  let severityLevel = run.severityLevel;
  let triggeredRuleIds = [...run.triggeredRuleIds];
  if (safeguardingEmergency && severityLevel < 4) {
    severityLevel = 4;
    triggeredRuleIds = [...triggeredRuleIds, "RF-SAFEGUARDING-IMMEDIATE-DANGER"];
  }
  const escalated = severityLevel !== run.severityLevel;
  const riskBand: RiskBand = escalated ? "emergency" : run.riskBand;
  const timeToAction: TimeToAction = escalated ? "immediate" : run.timeToAction;
  const careDestinationType: CareDestinationType = escalated ? "emergency_referral" : run.careDestinationType;
  const outcome = protocol.outcomes[`severity_${severityLevel}` as keyof typeof protocol.outcomes];

  // 5. Knowledge retrieval, boosted towards the documents the protocol is built on.
  const knowledgeQuery = [textFr, ...entities.symptoms, protocol.title].join(" ");
  const knowledgeHits = await searchKnowledge("health", knowledgeQuery, 4, { boostDocIds: protocol.citations }).catch((err) => {
    console.error("[health] knowledge retrieval failed", err);
    return [] as KnowledgeHit[];
  });

  // 6. Explanation (the decision is already frozen).
  const clarifications = run.pendingQuestions.slice(0, MAX_CLARIFICATIONS).map((q) => q.ask[language] ?? q.ask.fr);
  const outcomeFr = outcome.text.fr;
  let explanationFr = outcomeFr;
  let explanationSummary = capWords(`${protocol.title} — niveau ${severityLevel}. ${outcomeFr}`);
  let modelCitations: string[] = [];
  let intentConfidence = model?.confidence ?? 0.5;
  try {
    const r = await aiGateway().generateJson(
      {
        system: HEALTH_EXPLANATION_SYSTEM,
        user: healthExplanationUser({
          textFr,
          protocolId: protocol.id,
          protocolVersion: protocol.version,
          severityLevel,
          timeToAction,
          careDestinationType,
          outcomeTextFr: outcomeFr,
          triggeredRuleIds,
          knowledgeFragment: knowledgePromptFragment(knowledgeHits),
          context: { province: ctx.province },
        }),
        schema: HealthExplanation,
        schemaName: "health_explanation",
        maxTokens: 900,
      },
      { interactionId },
    );
    explanationFr = r.output.explanation.trim() || outcomeFr;
    explanationSummary = capWords(r.output.summary || explanationFr);
    modelCitations = r.output.citations;
    intentConfidence = Math.max(intentConfidence, r.output.confidence);
  } catch (err) {
    console.warn("[health] explanation unavailable, using protocol text", err instanceof Error ? err.message : err);
  }

  // 7. Citation enforcement (AI-04 / AI-13): a recommendation without a source is not sent.
  const retrievedDocIds = knowledgeHits.map((h) => h.docId);
  const claimed = Array.from(new Set([...modelCitations, ...retrievedDocIds, ...protocol.citations]));
  const verified = await approvedDocIds(claimed).catch(() => new Set<string>());
  const documentCitations = claimed.filter((c) => verified.has(c));
  const citations = [protocolCitation(protocol), ...documentCitations];
  const uncited = documentCitations.length === 0;
  if (uncited) {
    explanationFr = UNCITED_FALLBACK_FR;
    explanationSummary = capWords(`Réponse de repli : aucune source approuvée disponible pour ${protocol.id}. Orientation vers le centre de santé.`);
    await emitEvent({
      type: "ai.contract.violation",
      aggregateType: "interaction",
      aggregateId: interactionId,
      module: "health",
      classification: "internal",
      actor: { type: "ai" },
      payload: {
        rule: "AI-04",
        reason: "health_recommendation_without_citation",
        protocolId: protocol.id,
        protocolVersion: protocol.version,
        severityLevel,
        claimedCitations: claimed,
      },
    });
  }

  // 8. Prohibited-claim check on everything the citizen will hear.
  const safety = sanitiseHealthGuidance(explanationFr);
  let guidanceFr = safety.sanitised || outcomeFr;
  if (safety.violations.length) {
    await emitEvent({
      type: "ai.contract.violation",
      aggregateType: "interaction",
      aggregateId: interactionId,
      module: "health",
      classification: "internal",
      actor: { type: "ai" },
      payload: { rule: "AI-04", reason: "prohibited_claim", violations: safety.violations, protocolId: protocol.id },
    });
  }

  // 9. Emergency script and facility (FR-HE-12, HEA-004).
  const facility = severityLevel === 4 ? await nearestFacility(ctx) : null;
  let emergencyScript: string | null = null;
  if (severityLevel === 4) {
    const destination = facility
      ? `Structure la plus proche connue : ${facility.name}${facility.healthZone ? ` (zone de santé de ${facility.healthZone})` : ""}${facility.phone ? `, téléphone ${facility.phone}` : ""}.`
      : FACILITY_UNKNOWN_NOTE[language];
    emergencyScript = `${EMERGENCY_INSTRUCTIONS[language]} ${destination}`.trim();
    guidanceFr = `${EMERGENCY_INSTRUCTIONS.fr} ${facility ? destination : FACILITY_UNKNOWN_NOTE.fr} ${guidanceFr}`.trim();
  }

  // 10. Safeguarding: restricted record, scripted reply, no detail in ordinary channels.
  let understanding = model?.understanding ?? `La personne signale : ${textFr.slice(0, 160)}`;
  if (safeguarding) {
    await recordSafeguarding({
      interactionId,
      categories: safeguardingCategories,
      isChild: Boolean(modelFlag?.concernsChild) || entities.subject === "child_under_5" || entities.subject === "newborn",
      note: textFr,
    });
    guidanceFr = `${SAFEGUARDING_RESPONSES.fr} ${guidanceFr}`.trim();
    // Nothing identifying or descriptive may travel through ordinary case notes or notifications.
    understanding = SAFEGUARDING_NOTIFICATION_BODY;
    explanationSummary = SAFEGUARDING_NOTIFICATION_BODY;
  }
  guidanceFr = withDisclaimer(guidanceFr, "fr");

  // 11. Confidence vector and human review.
  const totalQuestions = Object.keys(protocol.questions).length;
  const answeredCount = Object.keys(run.answers).filter((k) => protocol.questions[k]).length;
  const confidenceDimensions = {
    transcription: round2(ctx.transcriptionConfidence ?? 1),
    language: round2(ctx.languageConfidence ?? (language === "fr" ? 0.9 : 0.7)),
    intent: round2(intentConfidence),
    evidence: round2(totalQuestions ? Math.min(1, answeredCount / Math.max(1, totalQuestions - 1)) : 0),
    knowledgeCoverage: round2(Math.min(1, knowledgeHits.length / 3)),
  };
  const lowestConfidence = Math.min(...Object.values(confidenceDimensions));
  const humanReviewRequired =
    severityLevel >= 3 || safeguarding || uncited || safety.violations.length > 0 || (severityLevel >= 2 && lowestConfidence < 0.4);

  const followUpAt = new Date(Date.now() + run.followUpHours * 3600 * 1000);
  const contract: HealthTriageContract = {
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    severityLevel,
    riskBand,
    triggeredRuleIds,
    recommendedTimeToAction: timeToAction,
    careDestinationType,
    clarifications,
    selfCareContentIds: run.selfCareContentIds,
    citations,
    prohibitedClaimCheck: { passed: safety.violations.length === 0, violations: safety.violations },
    humanReviewRequired,
    followUpDueAt: followUpAt.toISOString(),
    confidenceDimensions,
    explanationSummary,
    safeguarding,
  };
  const parsed = HealthTriageContract.safeParse(contract);
  if (!parsed.success) {
    await emitEvent({
      type: "ai.contract.violation",
      aggregateType: "interaction",
      aggregateId: interactionId,
      module: "health",
      classification: "internal",
      actor: { type: "system" },
      payload: { rule: "HEA-001", reason: "output_contract_invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
    });
  }

  const legacyAgeGroup: HealthAssessment["ageGroup"] =
    entities.subject === "newborn" ? "infant" : entities.ageGroup === "unknown" ? "unknown" : entities.ageGroup;

  return {
    // Legacy HealthAssessment surface, derived from the deterministic outcome.
    understanding,
    symptoms: (model?.symptoms?.length ? model.symptoms : entities.symptoms).slice(0, 8),
    ageGroup: legacyAgeGroup,
    pregnancyStatus: entities.pregnant === true || model?.pregnancyStatus === "pregnant" ? "pregnant" : "unknown",
    topic: PROTOCOL_TOPIC[protocol.id] ?? "other",
    emergencyFlags: run.redFlags.map((f) => f.label),
    severity: LEGACY_SEVERITY[severityLevel],
    guidance: guidanceFr,
    clinicReferral: LEGACY_REFERRAL[severityLevel],
    followUpQuestions: clarifications,
    confidence: round2(lowestConfidence),
    // Protocol engine surface.
    safetyViolations: safety.violations,
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    answers: run.answers,
    severityLevel,
    riskBand,
    triggeredRuleIds,
    timeToAction,
    careDestinationType,
    clarifications,
    selfCareContentIds: run.selfCareContentIds,
    citations,
    prohibitedClaimCheck: contract.prohibitedClaimCheck,
    humanReviewRequired,
    followUpAt,
    confidenceDimensions,
    explanationSummary,
    safeguarding,
    safeguardingCategories,
    safeguardingNotice: safeguarding ? { title: SAFEGUARDING_NOTIFICATION_TITLE, body: SAFEGUARDING_NOTIFICATION_BODY } : null,
    emergencyScript,
    facility,
    knowledgeHits,
    contract,
  };
}

function round2(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}
