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
import type { FinalAnswer, HealthAssessment, AgricultureAssessment, EducationAssessment, GeneralAssessment } from "../schemas";
import { GeneralAssessment as GeneralSchema } from "../schemas";
import { GENERAL_AGENT_SYSTEM, messageEnvelope } from "../prompts";
import { analyseLanguage, localise } from "./language";
import { assessHealth } from "./health";
import { assessAgriculture } from "./agriculture";
import { assessEducation } from "./education";
import { scoreRisk } from "./risk";
import { openCase } from "./workflow";
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

    // 3. Language analysis + module classification.
    const learning = await retrieveLearningContext(transcript || "", input.user?.language ?? null);
    const lang = await analyseLanguage(transcript || "(image seulement)", { preferredLanguage: input.user?.language, moduleHint: input.moduleHint, learning }, interactionId);
    const language: LanguageCode = lang.language;
    const languageConfidence = sttLanguage && sttLanguage === language && sttConfidence ? Math.max(lang.confidence, sttConfidence) : lang.confidence;
    const module: ModuleType = input.moduleHint && input.moduleHint !== "general" ? input.moduleHint : lang.module;
    await save({ language, languageConfidence, translationFr: lang.translationFr, intent: lang.intent, module });
    if (transcript) await recordSample({ interactionId, audioFileId, language, sourceText: transcript, translationFr: lang.translationFr, province, intent: lang.intent, module, confidence: languageConfidence });

    // 4. Personalisation context.
    const profile = await getProfileContext(userId);
    await rememberLanguage(userId, language, languageConfidence);

    // 5. Specialist agent.
    const textFr = lang.translationFr || transcript;
    const images: ImageInput[] = (input.images ?? []).map((i) => ({ data: i.data, mimeType: i.mimeType }));
    let health: (HealthAssessment & { safetyViolations: string[] }) | null = null;
    let agriculture: AgricultureAssessment | null = null;
    let education: EducationAssessment | null = null;
    let general: GeneralAssessment | null = null;
    if (module === "health") health = await assessHealth(textFr, { province, history: profile?.historyText }, interactionId);
    else if (module === "agriculture") agriculture = await assessAgriculture(textFr, { province, history: profile?.historyText }, images, interactionId);
    else if (module === "education") education = await assessEducation(textFr, { province, history: profile?.historyText }, interactionId);
    else {
      const r = await aiGateway().generateJson({ system: GENERAL_AGENT_SYSTEM, user: messageEnvelope(textFr, { province }), schema: GeneralSchema, schemaName: "general_assessment", maxTokens: 800 }, { interactionId });
      general = r.output;
    }

    // 6. Risk scoring (deterministic).
    const domainConfidence = health?.confidence ?? agriculture?.confidence ?? education?.confidence ?? general?.confidence ?? 0.5;
    const risk = scoreRisk({ module, health, agriculture, education, languageConfidence, domainConfidence, safetyViolations: health?.safetyViolations, lowConfidenceThreshold: env.ai.lowConfidenceThreshold });

    // 7. Compose the seven-part answer (French), then localise.
    const understanding = health?.understanding ?? agriculture?.understanding ?? education?.understanding ?? general?.understanding ?? textFr;
    let actionFr = health?.guidance ?? agriculture?.recommendation ?? education?.explanation ?? general?.answer ?? "";
    if (health && risk.level === "critical") actionFr = `${EMERGENCY_MESSAGES.fr} ${actionFr}`;
    if (education?.quiz?.length) actionFr += ` Petit exercice : ${education.quiz.map((q, i) => `${i + 1}) ${q.question}`).join(" ")}`;
    if (agriculture?.lowCostInterventions?.length) actionFr += ` Options à faible coût : ${agriculture.lowCostInterventions.join(", ")}.`;
    if (risk.lowConfidence) actionFr += " Je ne suis pas certain d'avoir bien compris : pouvez-vous préciser ?";
    if (health) actionFr += ` ${DISCLAIMERS.fr}`;
    const followUps = (health?.followUpQuestions ?? agriculture?.followUpQuestions ?? education?.followUpQuestions ?? []).slice(0, 3);
    const escalationTo = risk.escalationRequired ? ROLE_LABEL[module] : null;
    const summaryFr = `[${MODULE_LABEL[module]}] ${lang.intent.replace(/_/g, " ")} — risque ${risk.level}${risk.escalationRequired ? ", escaladé" : ""}. ${understanding.slice(0, 140)}`;
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
    });
    if (health) {
      await db.insert(schema.healthTriageRecords).values({ interactionId, symptoms: health.symptoms, ageGroup: health.ageGroup, pregnancyStatus: health.pregnancyStatus, emergencyFlags: health.emergencyFlags, topic: health.topic, recommendation: health.guidance, referralStatus: health.clinicReferral, province });
    } else if (agriculture) {
      await db.insert(schema.agricultureReports).values({ interactionId, cropType: agriculture.cropType, issueType: agriculture.issueType, evidenceFileIds: (input.images ?? []).map((i) => i.fileId), province, aiDiagnosis: agriculture.likelyDiagnosis, recommendation: agriculture.recommendation, confidence: agriculture.confidence, urgent: agriculture.urgent });
    } else if (education) {
      await db.insert(schema.educationSessions).values({ interactionId, learnerAgeGroup: education.learnerAgeGroup, subject: education.subject, topic: education.topic, difficultyLevel: education.difficultyLevel, explanation: education.explanation, quiz: education.quiz, progressSignal: education.learningDifficulty === "none" ? "on_track" : "needs_support", province });
    }

    // 9. Workflow: open and escalate a case when required.
    let caseId: string | null = null;
    if (risk.escalationRequired || risk.level === "high" || risk.level === "critical") {
      const c = await openCase({ module, userId, interactionId, title: `${understanding.slice(0, 120)}`, severity: risk.level, province, notes: summaryFr, escalate: risk.escalationRequired, escalationReason: risk.escalationReason });
      caseId = c.id;
      await save({ caseId });
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
    await save({ status: "completed", latencyMs });
    await audit({ action: "interaction.completed", actorUserId: userId, actorRole: input.user?.role, entityType: "interaction", entityId: interactionId, after: { module, language, risk: risk.level, escalated: risk.escalationRequired, caseId }, aiSummary: summaryFr });

    return {
      interactionId,
      status: "completed",
      module,
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
