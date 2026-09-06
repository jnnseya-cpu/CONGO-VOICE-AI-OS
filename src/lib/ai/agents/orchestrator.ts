/**
 * Orchestrator — the central layer that runs one citizen interaction end to end:
 *   autosave → speech-to-text → language analysis → personalisation → specialist agent
 *   → risk scoring → localisation → workflow/escalation → text-to-speech → audit.
 *
 * Every step writes its result to the interaction row as it completes (autosave), so an
 * abandoned or failed interaction still leaves a full trace.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { LanguageCode, ModuleType, Role } from "@/lib/db/schema";
import { env } from "@/lib/core/env";
import { audit } from "@/lib/core/audit";
import { storeUpload } from "@/lib/core/storage";
import { aiGateway } from "../gateway";
import type { ImageInput } from "../types";
import type { FinalAnswer, GeneralAssessment } from "../schemas";
import { GeneralAssessment as GeneralSchema } from "../schemas";
import { GENERAL_AGENT_SYSTEM, messageEnvelope } from "../prompts";
import { analyseLanguage, localise } from "./language";
import { assessHealth, attachSafeguardingCase, type HealthTriageResult } from "./health";
import { assessAgriculture, type AgricultureAssessmentPlus } from "./agriculture";
import { assessEducation, type EducationAssessmentPlus } from "./education";
import { detectClusters } from "./clusters";
import { scoreRisk } from "./risk";
import { openCase, shouldAutoCreateCase } from "./workflow";
import { isDegradedMode } from "@/lib/core/metering";
import { getProfileContext, rememberLanguage } from "./personalisation";
import { recordSample, retrieveLearningContext } from "./learning";
import { DISCLAIMERS, EMERGENCY_MESSAGES } from "../safety";

export interface InteractionInput {
  user: { userId: string; role: Role; language: LanguageCode; province?: string | null } | null;
  moduleHint?: ModuleType | null;
  text?: string | null;
  audio?: { data: Buffer; mimeType: string } | null;
  images?: Array<{ data: Buffer; mimeType: string; fileId: string }>;
  province?: string | null;
  clientKey?: string | null;
  wantsAudio?: boolean;
}

export interface InteractionOutput {
  interactionId: string;
  status: "completed" | "failed";
  module: ModuleType;
  language: LanguageCode;
  languageConfidence: number;
  transcript: string;
  intent: string | null;
  answer: FinalAnswer;
  answerLocalised: FinalAnswer;
  responseText: string; // localised, ready to be spoken
  followUpQuestions: string[];
  caseId: string | null;
  audioUrl: string | null;
  audioAvailable: boolean;
  latencyMs: number;
  message?: string;
}

const MODULE_LABEL: Record<ModuleType, string> = { health: "santé", agriculture: "agriculture", education: "éducation", general: "accueil" };
const ROLE_LABEL: Record<ModuleType, string> = { health: "agent de santé communautaire", agriculture: "agent agricole du secteur", education: "enseignant référent", general: "administrateur" };

export async function runInteraction(input: InteractionInput): Promise<InteractionOutput> {
  const started = Date.now();
  const db = await getDb();
  const userId = input.user?.userId ?? null;
  const province = input.province ?? input.user?.province ?? null;
  const channel = input.audio ? "voice" : input.images?.length ? "image" : "text";

  // 1. Autosave the raw request before any processing.
  let audioFileId: string | null = null;
  if (input.audio) {
    const stored = await storeUpload(input.audio.data, input.audio.mimeType, "voice");
    const [f] = await db
      .insert(schema.files)
      .values({ userId, kind: "audio", storageKey: stored.key, mimeType: input.audio.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256 })
      .returning();
    audioFileId = f.id;
  }
  const [row] = await db
    .insert(schema.interactions)
    .values({
      userId,
      userRole: input.user?.role ?? "citizen",
      module: input.moduleHint ?? "general",
      channel,
      province,
      audioFileId,
      attachmentIds: (input.images ?? []).map((i) => i.fileId),
      originalInput: input.text ?? null,
      status: "processing",
    })
    .returning();
  const interactionId = row.id;
  // ACU cap / degraded policy: non-emergency AI falls back to scripted (offline rules) mode; safeguards never switch off.
  const tenantId = userId ? ((await db.select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.id, userId)))[0]?.tenantId ?? null) : null;
  const scripted = await isDegradedMode(tenantId).catch(() => false);
  const meta = { interactionId, scripted };
  const save = (patch: Partial<typeof schema.interactions.$inferInsert>) =>
    db.update(schema.interactions).set({ ...patch, updatedAt: new Date() }).where(eq(schema.interactions.id, interactionId));

  try {
    // 2. Speech to text.
    let transcript = (input.text ?? "").trim();
    let sttLanguage: LanguageCode | null = null;
    let sttConfidence: number | null = null;
    if (input.audio) {
      const stt = await aiGateway().transcribe({ audio: input.audio.data, mimeType: input.audio.mimeType, languageHint: input.user?.language ?? null }, { interactionId });
      if (stt.text.trim()) {
        transcript = transcript ? `${stt.text.trim()}\n${transcript}` : stt.text.trim();
        sttLanguage = stt.language ?? null;
        sttConfidence = stt.confidence ?? null;
      }
      await save({ transcript, status: "processing" });
    }
    if (!transcript && !(input.images?.length)) {
      const language = input.user?.language ?? "fr";
      const msg: Record<LanguageCode, string> = {
        fr: "Nous n'avons pas pu comprendre votre message vocal. Réessayez en parlant plus près du téléphone, ou écrivez votre question.",
        ln: "Tokokaki koyoka message na yo te. Meka lisusu pene ya telefone, to koma motuna na yo.",
        kg: "Beto lendaka ve kuwa nsangu na nge. Meka diaka pene-pene ya telefone, to sonika ngiufula na nge.",
        sw: "Hatukuweza kuelewa ujumbe wako wa sauti. Jaribu tena karibu na simu, au andika swali lako.",
        lua: "Katuvua mua kumvua mukenji webe. Teta kabidi pabuipi ne telefone, anyi funda lukonko luebe.",
      };
      await save({ status: "failed", errorMessage: "empty_transcript", latencyMs: Date.now() - started });
      await audit({ action: "interaction.failed", actorUserId: userId, entityType: "interaction", entityId: interactionId, systemEvent: "empty_transcript" });
      return failedOutput(interactionId, language, msg[language], started);
    }

    // 3. Language analysis + service classification.
    const learning = await retrieveLearningContext(transcript || "", input.user?.language ?? null);
    const lang = await analyseLanguage(transcript || "(image seulement)", { preferredLanguage: input.user?.language, moduleHint: input.moduleHint, learning }, interactionId);
    const language: LanguageCode = lang.language;
    const languageConfidence = sttLanguage && sttLanguage === language && sttConfidence ? Math.max(lang.confidence, sttConfidence) : lang.confidence;
    const service: ModuleType = input.moduleHint && input.moduleHint !== "general" ? input.moduleHint : lang.module;
    await save({ language, languageConfidence, translationFr: lang.translationFr, intent: lang.intent, module: service });
    if (transcript) await recordSample({ interactionId, audioFileId, language, sourceText: transcript, translationFr: lang.translationFr, province, intent: lang.intent, module: service, confidence: languageConfidence });

    // 4. Personalisation context.
    const profile = await getProfileContext(userId);
    await rememberLanguage(userId, language, languageConfidence);

    // 5. Specialist agent.
    const textFr = lang.translationFr || transcript;
    const images: ImageInput[] = (input.images ?? []).map((i) => ({ data: i.data, mimeType: i.mimeType }));
    let health: HealthTriageResult | null = null;
    let agriculture: AgricultureAssessmentPlus | null = null;
    let education: EducationAssessmentPlus | null = null;
    let general: GeneralAssessment | null = null;
    if (service === "health")
      health = await assessHealth(
        textFr,
        { province, history: profile?.historyText, language, languageConfidence, transcriptionConfidence: sttConfidence },
        interactionId,
      );
    else if (service === "agriculture") agriculture = await assessAgriculture(textFr, { province, history: profile?.historyText, userId }, images, interactionId);
    else if (service === "education") education = await assessEducation(textFr, { province, history: profile?.historyText, userId, language }, interactionId);
    else {
      const r = await aiGateway().generateJson({ system: GENERAL_AGENT_SYSTEM, user: messageEnvelope(textFr, { province }), schema: GeneralSchema, schemaName: "general_assessment", maxTokens: 800 }, meta);
      general = r.output;
    }

    // 6. Risk scoring (deterministic).
    const domainConfidence = health?.confidence ?? agriculture?.confidence ?? education?.confidence ?? general?.confidence ?? 0.5;
    const risk = scoreRisk({
      module: service,
      health,
      agriculture,
      education,
      languageConfidence,
      domainConfidence,
      safetyViolations: health?.safetyViolations,
      lowConfidenceThreshold: env.ai.lowConfidenceThreshold,
      severityLevel: health?.severityLevel ?? null,
      riskBand: health?.riskBand ?? null,
      citations: health?.citations,
      safeguarding: health?.safeguarding ?? education?.safeguarding,
      humanReviewRequired: health?.humanReviewRequired,
    });

    // 7. Compose the seven-part answer (French), then localise.
    const understanding = health?.understanding ?? agriculture?.understanding ?? education?.understanding ?? general?.understanding ?? textFr;
    let actionFr = health?.guidance ?? agriculture?.recommendation ?? education?.explanation ?? general?.answer ?? "";
    if (health && risk.level === "critical") actionFr = `${EMERGENCY_MESSAGES.fr} ${actionFr}`;
    if (education?.quiz?.length) actionFr += ` Petit exercice : ${education.quiz.map((q, i) => `${i + 1}) ${q.question}`).join(" ")}`;
    if (agriculture?.lowCostInterventions?.length) actionFr += ` Options à faible coût : ${agriculture.lowCostInterventions.join(", ")}.`;
    if (risk.lowConfidence) actionFr += " Je ne suis pas certain d'avoir bien compris : pouvez-vous préciser ?";
    if (health) actionFr += ` ${DISCLAIMERS.fr}`;
    const followUps = (health?.followUpQuestions ?? agriculture?.followUpQuestions ?? education?.followUpQuestions ?? []).slice(0, 3);
    const escalationTo = risk.escalationRequired ? ROLE_LABEL[service] : null;
    const summaryFr = `[${MODULE_LABEL[service]}] ${lang.intent.replace(/_/g, " ")} — risque ${risk.level}${risk.escalationRequired ? ", escaladé" : ""}. ${understanding.slice(0, 140)}`;
    const answer: FinalAnswer = {
      asking: textFr,
      understanding,
      risk: { level: risk.level, score: risk.score, flags: risk.flags },
      action: actionFr.trim(),
      escalation: { required: risk.escalationRequired, to: escalationTo, reason: risk.escalationReason },
      confidence: { score: risk.confidence, low: risk.lowConfidence },
      summary: summaryFr,
    };
    const [actionLocal, understandingLocal, followUpsLocal] = await Promise.all([
      localise(answer.action, language, interactionId, learning),
      localise(answer.understanding, language, interactionId, learning),
      Promise.all(followUps.map((q) => localise(q, language, interactionId, learning))),
    ]);
    const answerLocalised: FinalAnswer = { ...answer, action: actionLocal, understanding: understandingLocal };

    // 8. Persist structured results and domain records.
    await save({
      understanding,
      response: actionLocal,
      responseLanguage: language,
      structured: { answer, answerLocalised, health, agriculture, education, general, risk },
      followUpQuestions: followUpsLocal,
      confidence: risk.confidence,
      riskScore: risk.score,
      severity: risk.level,
      escalationRequired: risk.escalationRequired,
      summary: summaryFr,
      citations: health?.citations ?? agriculture?.citations ?? education?.citations ?? [],
      confidenceDimensions: health?.confidenceDimensions ?? {},
      protocolVersion: health ? `${health.protocolId}@${health.protocolVersion}` : null,
      safeguarding: (health?.safeguarding ?? false) || (education?.safeguarding ?? false),
    });
    if (health) {
      await db.insert(schema.healthTriageRecords).values({
        interactionId,
        symptoms: health.symptoms,
        ageGroup: health.ageGroup,
        pregnancyStatus: health.pregnancyStatus,
        emergencyFlags: health.emergencyFlags,
        topic: health.topic,
        recommendation: health.guidance,
        referralStatus: health.clinicReferral,
        province,
        protocolId: health.protocolId,
        protocolVersion: health.protocolVersion,
        answers: health.answers as Record<string, unknown>,
        severityLevel: health.severityLevel,
        riskBand: health.riskBand,
        triggeredRuleIds: health.triggeredRuleIds,
        timeToAction: health.timeToAction,
        careDestinationType: health.careDestinationType,
        referralFacilityId: health.facility?.id ?? null,
        followUpAt: health.followUpAt,
        safeguarding: health.safeguarding,
      });
    } else if (agriculture) {
      await db.insert(schema.agricultureReports).values({
        interactionId,
        cropType: agriculture.cropType,
        issueType: agriculture.issueType,
        evidenceFileIds: (input.images ?? []).map((i) => i.fileId),
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
      // Cluster watch (FR-AG-08): similar reports in one territory/province inside the rolling window
      // open an unverified cluster, emit agri.cluster.detected and alert the extension network.
      await detectClusters({ province }).catch((e) => console.error("[orchestrator] cluster detection", e));
    } else if (education) {
      await db.insert(schema.educationSessions).values({
        interactionId,
        learnerAgeGroup: education.learnerAgeGroup,
        subject: education.subject,
        topic: education.topic,
        difficultyLevel: education.difficultyLevel,
        explanation: education.explanation,
        quiz: education.quiz,
        progressSignal: education.learningDifficulty === "none" ? "on_track" : "needs_support",
        province,
        mode: education.mode,
        objective: education.objective,
        score: education.score,
        steps: education.steps,
        masterySignal: education.masterySignal,
        userId,
      });
      if (education.safeguarding) {
        // Restricted pathway for disclosures made by learners (EDU-005 / PRD 5.6).
        await db.insert(schema.safeguardingRecords).values({ interactionId, category: education.safety?.categories?.[0] ?? "disclosure", isChild: true, ownerRole: "teacher" });
      }
    }

    // 9. Workflow: open and escalate a case when required.
    let caseId: string | null = null;
    const autoCase = shouldAutoCreateCase({
      severity: risk.level,
      severityLevel: risk.severityLevel ?? health?.severityLevel ?? null,
      confidence: risk.confidence,
      isNotifiable: (agriculture as { isNotifiable?: boolean } | null)?.isNotifiable ?? false,
      humanRequested: /parler (à|a) (une personne|quelqu'un|un agent)|koloba na moto|kuzungumza na mtu/i.test(textFr),
      safeguarding: (health?.safeguarding ?? false) || (education?.safeguarding ?? false),
    });
    if (risk.escalationRequired || risk.level === "high" || risk.level === "critical" || autoCase.create) {
      // Safeguarding cases carry no detail in ordinary titles, notes or notifications (PRD 5.6).
      const c = await openCase({
        module: service,
        userId,
        interactionId,
        title: health?.safeguardingNotice?.title ?? `${understanding.slice(0, 120)}`,
        severity: risk.level,
        province,
        notes: health?.safeguardingNotice?.body ?? summaryFr,
        escalate: risk.escalationRequired,
        escalationReason: health?.safeguarding ? "Dossier protégé" : risk.escalationReason,
      });
      caseId = c.id;
      await save({ caseId });
      if (health) {
        await db
          .update(schema.cases)
          .set({
            severityLevel: risk.severityLevel ?? health.severityLevel,
            aiSeverityLevel: health.severityLevel,
            safeguarding: health.safeguarding,
            followUpDate: health.followUpAt,
          })
          .where(eq(schema.cases.id, caseId));
        await db.update(schema.healthTriageRecords).set({ caseId }).where(eq(schema.healthTriageRecords.interactionId, interactionId));
        if (health.safeguarding) await attachSafeguardingCase(interactionId, caseId);
      }
      if (education?.safeguarding) await attachSafeguardingCase(interactionId, caseId);
    }

    // 10. Text to speech (optional, falls back to on-device synthesis).
    let audioUrl: string | null = null;
    if (input.wantsAudio !== false) {
      const speech = await aiGateway().synthesize({ text: actionLocal, language }, { interactionId });
      if (speech) {
        const stored = await storeUpload(speech.audio, speech.mimeType, "tts");
        const [f] = await db.insert(schema.files).values({ userId, interactionId, kind: "audio", storageKey: stored.key, mimeType: speech.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256 }).returning();
        audioUrl = `/api/v1/files/${f.id}`;
      }
    }

    const latencyMs = Date.now() - started;
    await save({ status: "completed", latencyMs, modelRoute: scripted ? { mode: "scripted" } : {} });
    await audit({ action: "interaction.completed", actorUserId: userId, actorRole: input.user?.role, entityType: "interaction", entityId: interactionId, after: { module: service, language, risk: risk.level, escalated: risk.escalationRequired, caseId }, aiSummary: summaryFr });

    return {
      interactionId,
      status: "completed",
      module: service,
      language,
      languageConfidence: Number(languageConfidence.toFixed(2)),
      transcript,
      intent: lang.intent,
      answer,
      answerLocalised,
      responseText: actionLocal,
      followUpQuestions: followUpsLocal,
      caseId,
      audioUrl,
      audioAvailable: !!audioUrl,
      latencyMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[orchestrator]", err);
    await save({ status: "failed", errorMessage: message.slice(0, 500), latencyMs: Date.now() - started });
    await audit({ action: "interaction.failed", actorUserId: userId, entityType: "interaction", entityId: interactionId, systemEvent: "pipeline_error", after: { message: message.slice(0, 200) } });
    const language = input.user?.language ?? "fr";
    return failedOutput(interactionId, language, "Le service est momentanément indisponible. Votre message a été enregistré ; réessayez dans quelques instants.", started);
  }
}

function failedOutput(interactionId: string, language: LanguageCode, message: string, started: number): InteractionOutput {
  const empty: FinalAnswer = {
    asking: "",
    understanding: "",
    risk: { level: "low", score: 0, flags: [] },
    action: message,
    escalation: { required: false, to: null, reason: null },
    confidence: { score: 0, low: true },
    summary: "échec de traitement",
  };
  return { interactionId, status: "failed", module: "general", language, languageConfidence: 0, transcript: "", intent: null, answer: empty, answerLocalised: empty, responseText: message, followUpQuestions: [], caseId: null, audioUrl: null, audioAvailable: false, latencyMs: Date.now() - started, message };
}
