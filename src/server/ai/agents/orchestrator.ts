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
import { getDb, schema } from "@server/db/client";
import type { LanguageCode, ModuleType, Role } from "@server/db/schema";
import { env } from "@server/core/env";
import { audit } from "@server/core/audit";
import { storeUpload } from "@server/core/storage";
import { aiGateway } from "../gateway";
import type { ImageInput } from "../types";
import type { FinalAnswer, GeneralAssessment } from "../schemas";
import { GeneralAssessment as GeneralSchema } from "../schemas";
import { GENERAL_AGENT_SYSTEM, messageEnvelope } from "../prompts";
import { analyseLanguage, localise, localiseWithGlossary } from "./language";
import { assessHealth, attachSafeguardingCase, type HealthTriageResult } from "./health";
import { assessAgriculture, type AgricultureAssessmentPlus } from "./agriculture";
import { assessEducation, type EducationAssessmentPlus } from "./education";
import { detectClusters } from "./clusters";
import { classifyCourtesy } from "./courtesy";
import { scoreRisk } from "./risk";
import { openCase, shouldAutoCreateCase } from "./workflow";
import { isDegradedMode } from "@server/core/metering";
import { getProfileContext, rememberLanguage } from "./personalisation";
import { emitEvent } from "@server/core/events";
import { recordSample, retrieveLearningContext } from "./learning";
import { BOUNDARY_RESPONSES, CLAIM_FALLBACK, checkOutboundClaims, dedupeSentences, detectBoundaryTopics, detectRoutingDangerSigns, EMERGENCY_INSTRUCTIONS, EMERGENCY_MESSAGES, FACILITY_UNKNOWN_NOTE, withDisclaimer } from "../safety";
import { detectLanguageOffline } from "../language/detect";
import { confidenceVector, planClarification, type ConfidenceVector } from "../language/confidence";
import { toSpokenText } from "../language/voice";
import { scriptText } from "../language/scripts";
import { languageMode, type LanguageStatus } from "../language/gates";
import { assessTranscript } from "@shared/transcription";

export interface InteractionInput {
  user: { userId: string; role: Role; language: LanguageCode; province?: string | null } | null;
  /**
   * The request's trace identifier, stored on the interaction.
   *
   * The column existed and nothing wrote it, so a citizen saying "it failed this
   * afternoon" could not be connected to the request that failed. The API wrapper
   * adopts Cloud Run's own trace header where present, so this is the same string
   * Cloud Logging indexes.
   */
  traceId?: string | null;
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
  responseText: string; // localised, as written
  /** The same answer prepared for speech: short sentences, numbers as words (FR-LG-06). */
  spokenText: string;
  followUpQuestions: string[];
  /** Why a confirmation was asked, if one was (FR-LG-01, FR-LG-02). */
  clarificationReasons: string[];
  /** Separate confidence readings rather than one opaque score (FR-LG-09). */
  confidenceDimensions: ConfidenceVector;
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
  /**
   * Where the turn's time actually goes.
   *
   * A citizen's turn was measured at thirty-eight seconds and nobody could say
   * which part of it was thirty of them — the only number recorded was the
   * total. Guessing at that is how the wrong thing gets optimised, so each
   * stage is timed and written to the interaction's modelRoute. It costs a
   * subtraction per stage and it turns the next latency question into a query
   * instead of an argument.
   */
  const stages: Record<string, number> = {};
  const timed = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const at = Date.now();
    try {
      return await work();
    } finally {
      stages[name] = (stages[name] ?? 0) + (Date.now() - at);
    }
  };
  const db = await getDb();
  const userId = input.user?.userId ?? null;
  const province = input.province ?? input.user?.province ?? null;
  const channel = input.audio ? "voice" : input.images?.length ? "image" : "text";

  // 1. Autosave the raw request before any processing.
  let audioFileId: string | null = null;
  let storageFailure: string | null = null;
  if (input.audio) {
    // Archiving the recording must not decide whether the citizen gets an answer.
    //
    // This ran outside the pipeline's own error handling, so a storage driver
    // that could not load turned every spoken question into a 500 and left a
    // parent describing a child's symptoms looking at "Erreur interne". The
    // recording is evidence; the answer is the service. Losing the first is bad
    // and recorded. Losing the second is the platform failing at its purpose.
    try {
      const stored = await storeUpload(input.audio.data, input.audio.mimeType, "voice");
      const [f] = await db
        .insert(schema.files)
        .values({ userId, kind: "audio", storageKey: stored.key, mimeType: input.audio.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256 })
        .returning();
      audioFileId = f.id;
    } catch (err) {
      // Never silently: an unsaved recording is a gap in the record, so it is
      // logged, audited and carried onto the interaction row below.
      storageFailure = err instanceof Error ? err.message : String(err);
      console.error("[orchestrator] the voice recording could not be stored:", err);
    }
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
      traceId: input.traceId ?? null,
      status: "processing",
    })
    .returning();
  const interactionId = row.id;
  // ACU cap / degraded policy: non-emergency AI falls back to scripted (offline rules) mode; safeguards never switch off.
  const tenantId = userId ? ((await db.select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.id, userId)))[0]?.tenantId ?? null) : null;
  const scripted = await isDegradedMode(tenantId).catch(() => false);
  const meta: { interactionId: string; scripted: boolean } = { interactionId, scripted };
  const save = (patch: Partial<typeof schema.interactions.$inferInsert>) =>
    db.update(schema.interactions).set({ ...patch, updatedAt: new Date() }).where(eq(schema.interactions.id, interactionId));

  if (storageFailure) {
    await audit({
      action: "file.store_failed",
      actorUserId: userId,
      entityType: "interaction",
      entityId: interactionId,
      systemEvent: "storage_error",
      after: { kind: "audio", message: storageFailure.slice(0, 200) },
    }).catch(() => undefined);
    await save({ errorMessage: `recording_not_stored: ${storageFailure}`.slice(0, 500) }).catch(() => undefined);
  }

  /**
   * The citizen's own words, readable from the failure handler.
   *
   * The transcript itself is scoped to the try, and the deterministic emergency
   * fallback below needs it: without it, a pipeline that fell over after speech
   * recognition had already succeeded would have nothing to check for danger
   * signs and would answer "try again later".
   */
  let transcriptForFallback = (input.text ?? "").trim();

  try {
    // 2. Speech to text.
    let transcript = (input.text ?? "").trim();
    let sttLanguage: LanguageCode | null = null;
    let sttConfidence: number | null = null;
    /** True when the transcript looped and its detail cannot be trusted. */
    let transcriptDegraded = false;
    if (input.audio) {
      // Bound once so the timing closure below keeps the narrowing.
      const recording = input.audio;
      /**
       * Speech recognition failing is not the turn failing.
       *
       * Every provider being unreachable, a quota exhausted, a container format
       * the provider will not take — all of these threw out of here and fell into
       * the catch at the bottom, which answered "Le service est momentanément
       * indisponible, réessayez dans quelques instants". For a voice note that is
       * also the end of the road: there is no typed text, so the deterministic
       * danger-sign fallback has nothing to read and cannot fire either.
       *
       * An empty transcript already has a good answer a few lines below — it
       * tells the citizen what to do and offers writing instead — so a failure
       * here is turned into that, and the recording itself is kept on the
       * interaction so nothing the person said is lost.
       */
      const stt = await timed("stt", () =>
        aiGateway()
        .transcribe({ audio: recording.data, mimeType: recording.mimeType, languageHint: input.user?.language ?? null }, { interactionId })
        .catch(async (err: unknown) => {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`[orchestrator] speech recognition failed (${recording.mimeType}):`, reason);
          await save({ errorMessage: `stt_failed: ${reason}`.slice(0, 500) }).catch(() => undefined);
          await audit({
            action: "interaction.stt_failed",
            actorUserId: userId,
            entityType: "interaction",
            entityId: interactionId,
            systemEvent: "stt_failure",
            after: { mimeType: recording.mimeType, reason: reason.slice(0, 200) },
          });
          return { text: "", language: null, confidence: null };
        }));
      /**
       * A transcript the model invented is not a message.
       *
       * Whisper answers unusable audio with subtitle-shaped text rather than
       * silence. "Sous-titrage ST' 501" reached a citizen as their own words,
       * was classified, opened a case, alerted a community health worker and
       * came back asking them to confirm they had said "ST' 501". Treating it
       * as nothing heard sends them to the "say it again, or write it" path a
       * few lines below, which is what the audio actually warranted.
       *
       * The raw text is still saved: a transcript this platform threw away is
       * something a reviewer needs to be able to see.
       */
      const assessment = assessTranscript(stt.text);
      /**
       * One line per voice turn, saying what actually came back.
       *
       * "Nous n'avons pas pu comprendre votre message vocal" is produced by
       * three different situations — the provider refused, the words were the
       * model's own invention and were discarded, or nothing was heard — and
       * from the outside they are identical. A citizen should not be told the
       * difference; whoever is running the platform cannot fix it without
       * knowing it. The recording's size is here because an empty or
       * near-silent upload is the one cause that is not in the server at all,
       * and nothing else distinguishes it.
       */
      console.log(
        `[stt] ${recording.mimeType} ${recording.data.length}B via ${"providerKey" in stt ? stt.providerKey : "unknown"} → ` +
          `${stt.text.length} chars, verdict=${assessment.verdict}` +
          (assessment.artefacts.length ? `, artefacts=${assessment.artefacts.join("|")}` : "") +
          (assessment.repetition > 0 ? `, repetition=${assessment.repetition.toFixed(2)}` : "") +
          (stt.confidence !== null && stt.confidence !== undefined ? `, confidence=${stt.confidence}` : ""),
      );
      if (assessment.verdict === "artefact") {
        await audit({
          action: "interaction.transcript_discarded",
          actorUserId: userId,
          entityType: "interaction",
          entityId: interactionId,
          systemEvent: "transcript_artefact",
          after: { raw: stt.text.slice(0, 200), artefacts: assessment.artefacts, repetition: assessment.repetition },
        });
      }
      const heard = assessment.verdict === "artefact" ? "" : assessment.cleaned.trim();
      if (heard) {
        transcript = transcript ? `${heard}\n${transcript}` : heard;
        sttLanguage = stt.language ?? null;
        // A looping transcript contains the sentence once and then noise. It is
        // worth answering, but never worth being confident about, and the
        // clarifying questions must not read its numbers back.
        sttConfidence = assessment.verdict === "repetitive" ? Math.min(stt.confidence ?? 0.3, 0.3) : (stt.confidence ?? null);
        transcriptDegraded = assessment.verdict === "repetitive";
        transcriptForFallback = transcript;
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
      console.warn(
        `[stt] nothing usable to answer: audio=${input.audio ? "yes" : "no"}, images=${input.images?.length ?? 0}, typed=${(input.text ?? "").trim().length} chars`,
      );
      await save({ status: "failed", errorMessage: "empty_transcript", latencyMs: Date.now() - started });
      await audit({ action: "interaction.failed", actorUserId: userId, entityType: "interaction", entityId: interactionId, systemEvent: "empty_transcript" });
      return failedOutput(interactionId, language, msg[language], started);
    }

    // 3. Language analysis + service classification.
    const learning = await retrieveLearningContext(transcript || "", input.user?.language ?? null);
    const lang = await timed("language", () => analyseLanguage(transcript || "(image seulement)", { preferredLanguage: input.user?.language, moduleHint: input.moduleHint, learning }, interactionId));
    const language: LanguageCode = lang.language;
    const languageConfidence = sttLanguage && sttLanguage === language && sttConfidence ? Math.max(lang.confidence, sttConfidence) : lang.confidence;
    const requestedService: ModuleType = input.moduleHint && input.moduleHint !== "general" ? input.moduleHint : lang.module;
    /**
     * A danger sign chooses the module, not the model (FR-HE-03, NFR-A-01).
     *
     * The deterministic triage engine only runs on a message already routed to
     * health, so until now every red-flag rule sat behind the Language Agent's
     * opinion of what the message was about. "Mon bébé ne respire pas bien et il
     * ne peut plus téter" came back risk=low with the generic menu, because the
     * router said "general" and the rules never saw it. Offline there is no
     * router at all, so that was the ordinary case for the most critical message
     * the platform can receive.
     *
     * The phrases that trigger this are deliberately narrow — see
     * ROUTING_DANGER_PHRASES — because the failure mode on the other side is an
     * emergency case opened for a food crisis or a yellowing field.
     */
    const routingDangerSigns = detectRoutingDangerSigns(transcript);
    const service: ModuleType = routingDangerSigns.length > 0 ? "health" : requestedService;
    if (service !== requestedService) {
      // Recorded so the rate at which the router is overruled is visible: a
      // rising number is the model getting worse at something safety-critical.
      await emitEvent({
        type: "ai.routing.overridden",
        aggregateType: "interaction",
        aggregateId: interactionId,
        module: service,
        classification: "internal",
        actor: { type: "ai" },
        payload: { rule: "FR-HE-03", from: requestedService, to: service, phrases: routingDangerSigns.slice(0, 8) },
      });
    }

    // FR-LG-09: three separate readings, not one number. A confident translation
    // of a badly-heard sentence must not pass as a confident turn.
    const confidence: ConfidenceVector = confidenceVector({
      transcription: sttConfidence,
      language: languageConfidence,
      translation: lang.translationFr?.trim() ? languageConfidence : Math.min(languageConfidence, 0.4),
    });
    // FR-LG-03: the message as it was actually spoken, language by language.
    const transcriptTags: Array<[string, string]> = (lang.spans ?? []).map((span) => [span.text, span.language] as [string, string]);
    await save({
      language,
      languageConfidence,
      translationFr: lang.translationFr,
      intent: lang.intent,
      module: service,
      transcriptTags,
      confidenceDimensions: {
        transcription: confidence.transcription ?? -1,
        language: confidence.language,
        translation: confidence.translation,
        overall: confidence.overall,
      },
    });
    if (transcript) await recordSample({ interactionId, audioFileId, language, sourceText: transcript, translationFr: lang.translationFr, province, intent: lang.intent, module: service, confidence: languageConfidence });

    /**
     * AI-18. A language answers freely only once its measured quality passes
     * the gates of §6.5. With no measurement the answer comes from the rules
     * provider: scripts and menus rather than fluent nonsense.
     */
    const languageStatus: LanguageStatus = env.ai.enforceLanguageGates
      ? await languageMode(language, service).catch(() => ({ language, module: service, mode: "scripted" as const, measuredAt: null, failedGates: ["évaluation indisponible"], reason: "never_measured" as const }))
      : { language, module: service, mode: "full", measuredAt: null, failedGates: [], reason: "passing" };
    const scriptedNow = scripted || languageStatus.mode === "scripted";
    meta.scripted = scriptedNow;

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
      health = await timed("module", () =>
        assessHealth(
          textFr,
          { province, history: profile?.historyText, language, languageConfidence, transcriptionConfidence: sttConfidence },
          interactionId,
        ),
      );
    else if (service === "agriculture") agriculture = await timed("module", () => assessAgriculture(textFr, { province, history: profile?.historyText, userId }, images, interactionId));
    else if (service === "education") education = await timed("module", () => assessEducation(textFr, { province, history: profile?.historyText, userId, language }, interactionId));
    else {
      const r = await aiGateway().generateJson({ system: GENERAL_AGENT_SYSTEM, user: messageEnvelope(textFr, { province }), schema: GeneralSchema, schemaName: "general_assessment", maxTokens: 800 }, meta);
      general = r.output;
    }

    // 6. Risk scoring (deterministic).
    const domainConfidence = health?.confidence ?? agriculture?.confidence ?? education?.confidence ?? general?.confidence ?? 0.5;
    const courtesy = classifyCourtesy(transcript);

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
      // Decided on what the citizen actually said, before translation and
      // before any model's reading of it.
      courtesy: courtesy.courtesy,
    });

    // 7. Compose the seven-part answer (French), then localise.
    const understanding = health?.understanding ?? agriculture?.understanding ?? education?.understanding ?? general?.understanding ?? textFr;
    let actionFr = health?.guidance ?? agriculture?.recommendation ?? education?.explanation ?? general?.answer ?? "";
    if (health && risk.level === "critical") actionFr = `${EMERGENCY_MESSAGES.fr} ${actionFr}`;
    if (education?.quiz?.length) actionFr += ` Petit exercice : ${education.quiz.map((q, i) => `${i + 1}) ${q.question}`).join(" ")}`;
    if (agriculture?.lowCostInterventions?.length) actionFr += ` Options à faible coût : ${agriculture.lowCostInterventions.join(", ")}.`;
    /**
     * FR-LG-01 and FR-LG-02: ask about the specific thing in doubt rather than
     * saying "I am not sure" and continuing anyway. An emergency is never
     * delayed for a question — the deterministic rules have already fired and
     * the instruction goes out first.
     */
    const emergency = risk.level === "critical";
    const clarification = emergency ? { questions: [], routeToHuman: false, reasons: [] } : planClarification(lang, 0, { detailIsTrustworthy: !transcriptDegraded });
    if (!emergency && clarification.questions.length > 0) {
      actionFr += ` ${clarification.questions[0]}`;
    } else if (!emergency && risk.lowConfidence && risk.confidenceBand !== "caution") {
      /**
       * The `!emergency` guard is the point of this branch, not an optimisation.
       *
       * Without it a live turn ended: "...allez au centre de santé le plus proche
       * maintenant, sans attendre. [...] Je ne suis pas certain d'avoir bien
       * compris : pouvez-vous préciser ?" — the platform telling a caregiver to
       * leave immediately and then, in the same breath, that it may have
       * misunderstood. Whichever half they believe, one of them cost them time.
       * The danger-sign rules that produced the instruction are deterministic and
       * do not depend on the confidence score, so there is nothing to hedge.
       *
       * The `caution` exclusion removes a second doubling seen in the same
       * test run: the caution band below appends its own "I am not sure I
       * understood" and offers a person, so both fired and the citizen heard
       * the platform doubt itself twice in consecutive sentences. The caution
       * wording is the better of the two — it offers a human — so it wins.
       */
      actionFr += " Je ne suis pas certain d'avoir bien compris : pouvez-vous préciser ?";
    }
    if (health) actionFr = withDisclaimer(actionFr, "fr");
    actionFr = dedupeSentences(actionFr);

    /**
     * AI-15. The prescription filter already runs inside the health agent. This
     * catches the other half: sentences that are not prescriptions but are
     * still promises — a cure, a certainty, a yield, a price. They are what a
     * citizen repeats to a neighbour, so the platform says less instead.
     *
     * An emergency is exempt: its wording is an approved constant, not
     * generated, and nothing may stand between a danger sign and the
     * instruction.
     */
    /**
     * AI-19. Some questions are answered by declining. A state-funded voice
     * telling a rural household who to vote for, which church is true, or what
     * to do about a court summons is a different and far more dangerous product
     * than the one being funded. Health still comes first: a danger sign inside
     * the same message is handled before the boundary applies.
     */
    const boundaries = emergency ? [] : detectBoundaryTopics(textFr);
    if (boundaries.length > 0) {
      actionFr = BOUNDARY_RESPONSES[boundaries[0]].fr;
      risk.flags.push(...boundaries.map((b) => `hors_perimetre:${b}`));
    }

    const claims = emergency
      ? { ok: true, violations: [] as string[], sentences: [] as string[] }
      : checkOutboundClaims(actionFr, { module: service, citations: health?.citations ?? agriculture?.citations ?? education?.citations ?? [] });
    if (!claims.ok) {
      actionFr = CLAIM_FALLBACK.fr;
      risk.flags.push(...claims.violations.map((v) => `claim:${v}`));
      risk.escalationRequired = true;
      risk.humanReviewRequired = true;
      risk.escalationReason = risk.escalationReason ?? "Affirmation non étayée retirée de la réponse";
      await audit({
        action: "ai.claim_blocked",
        actorUserId: userId,
        entityType: "interaction",
        entityId: interactionId,
        after: { module: service, violations: claims.violations, sentences: claims.sentences.slice(0, 3) },
        systemEvent: "claim_guard",
      });
    } else if (!emergency && boundaries.length === 0 && risk.confidenceBand === "scripted") {
      /**
       * AI-03. Below the second band the platform has not understood well
       * enough to answer. A hedged wrong answer is still a wrong answer someone
       * may act on, so it says only what is safe to say and asks a person.
       */
      actionFr = `${scriptText("no_understanding", "fr")} ${scriptText("human_handover", "fr")}`;
      risk.escalationRequired = true;
      risk.humanReviewRequired = true;
      risk.escalationReason = risk.escalationReason ?? "Compréhension insuffisante : réponse scriptée et revue humaine";
    } else if (!emergency && boundaries.length === 0 && risk.confidenceBand === "caution") {
      actionFr = `${actionFr} Je ne suis pas certain d'avoir bien compris. Voulez-vous parler à une personne ?`;
      actionFr = dedupeSentences(actionFr);
    }
    const followUps = [
      ...clarification.questions.slice(1),
      ...(health?.followUpQuestions ?? agriculture?.followUpQuestions ?? education?.followUpQuestions ?? []),
    ].slice(0, 3);
    const escalationTo = risk.escalationRequired ? ROLE_LABEL[service] : null;
    const summaryFr = `[${MODULE_LABEL[service]}] ${lang.intent.replace(/_/g, " ")} — risque ${risk.level}${risk.escalationRequired ? ", escaladé" : ""}. ${understanding.slice(0, 140)}`;
    const answer: FinalAnswer = {
      asking: textFr,
      understanding,
      risk: { level: risk.level, score: risk.score, flags: risk.flags, uncertaintyDriven: risk.uncertaintyDriven },
      action: actionFr.trim(),
      escalation: { required: risk.escalationRequired, to: escalationTo, reason: risk.escalationReason },
      confidence: { score: risk.confidence, low: risk.lowConfidence },
      summary: summaryFr,
    };
    const [actionRendered, understandingLocal, followUpsLocal] = await timed("localise", () => Promise.all([
      localiseWithGlossary(answer.action, language, { interactionId, learning, module: service }),
      localise(answer.understanding, language, interactionId, learning, service),
      Promise.all(followUps.map((q) => localise(q, language, interactionId, learning, service))),
    ]));
    const actionLocal = actionRendered.text;
    // A term the renderer dropped is worth seeing: it is how a glossary quietly
    // stops being enforced (FR-LG-05).
    if (actionRendered.glossary.missing.length > 0 || actionRendered.glossary.corrected.length > 0) {
      await audit({
        action: "ai.glossary_applied",
        actorUserId: userId,
        entityType: "interaction",
        entityId: interactionId,
        after: {
          language,
          corrected: actionRendered.glossary.corrected,
          missing: actionRendered.glossary.missing,
          versions: actionRendered.glossary.versions,
        },
        systemEvent: "glossary",
      });
    }
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
      confidenceDimensions: {
        transcription: confidence.transcription ?? -1,
        language: confidence.language,
        translation: confidence.translation,
        overall: confidence.overall,
        ...(health?.confidenceDimensions ?? {}),
      },
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
    /**
     * FR-LG-06: what gets spoken is not what gets displayed. Sentences are cut
     * to fifteen words and numbers are said as words, because a digit read as a
     * digit over a bad line is the part the listener loses.
     */
    const spokenText = toSpokenText(actionLocal, language);
    /**
     * The answer is not lost because the recording of it could not be saved.
     *
     * Saving the spoken answer is on the path of every turn, including a typed
     * one, so anything that throws here used to fail the whole interaction and
     * the citizen was told "Le service est momentanément indisponible". That is
     * exactly what happened in production: the image carried
     * @google-cloud/storage without the packages it needs, the dynamic import
     * threw "Cannot find module 'gcp-metadata'", and every question in all three
     * modules failed while the home page and both probes stayed green.
     *
     * The text answer is the answer. Audio is how it is also delivered, and
     * losing it degrades the turn rather than ending it — which matters most for
     * someone who cannot read, because they still get the spoken answer their
     * browser can read aloud from the text. The failure is recorded so that a
     * silent platform is not mistaken for a working one.
     */
    /**
     * The spoken answer is produced when the page asks for it.
     *
     * Synthesis and the upload that follows used to run here, inside the turn,
     * between the citizen's question and their answer. On a turn already
     * measured at thirty-eight seconds those were several of them spent making
     * audio nobody had yet pressed play on, with a person watching a spinner
     * the whole time.
     *
     * Pointing at the route instead costs nothing here and nothing there: the
     * page requests it the moment the answer arrives, so the audio still
     * follows by about the interval it always did, while the words stop waiting
     * behind it. The file row is still written, the first time anybody listens,
     * so what was said to a citizen is recorded exactly as before.
     *
     * See src/app/api/v1/interactions/[id]/audio/route.ts, which also handles
     * the provider being unreachable — in which case the page speaks the answer
     * with the browser's own voice rather than going silent.
     */
    if (input.wantsAudio !== false) audioUrl = `/api/v1/interactions/${interactionId}/audio`;

    const latencyMs = Date.now() - started;
    await save({
      status: "completed",
      latencyMs,
      modelRoute: {
        ...(scriptedNow ? { mode: "scripted" } : {}),
        ...(scripted ? { degraded: "acu_cap" } : {}),
        languageMode: languageStatus.mode,
        languageGate: languageStatus.reason,
        ...(env.ai.enforceLanguageGates ? {} : { languageGatesEnforced: "false" }),
        // Milliseconds per stage, so a slow turn can be attributed rather than
        // guessed at. Audio is absent on purpose: it is no longer in the turn.
        ...Object.fromEntries(Object.entries(stages).map(([k, v]) => [`ms_${k}`, String(v)])),
      },
    });
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
      spokenText,
      followUpQuestions: followUpsLocal,
      clarificationReasons: clarification.reasons,
      confidenceDimensions: confidence,
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

    /**
     * NFR-A-01: a danger sign is answered even when nothing else works.
     *
     * With every provider unreachable, this used to return "Le service est
     * momentanément indisponible, réessayez dans quelques instants" to a
     * caregiver who had just written that their baby was not breathing and could
     * no longer feed. No script, no case, nobody alerted — the message was
     * stored and the caller was asked to come back later. The IVR path already
     * short-circuits on danger keywords before any model call; the web path,
     * which is the one most people use, did not.
     *
     * Nothing here needs a provider. The danger phrases are constants, the
     * language reading is a marker count, the instruction is reviewed text in
     * five languages, and the case is a database row. A provider outage is
     * precisely when this matters: it is also when a network is bad enough that
     * someone may not get a second chance to ask.
     */
    const dangerSigns = detectRoutingDangerSigns(transcriptForFallback);
    const language: LanguageCode =
      input.user?.language ?? (transcriptForFallback ? detectLanguageOffline(transcriptForFallback).language : "fr");

    if (dangerSigns.length > 0) {
      const scripted = `${EMERGENCY_INSTRUCTIONS[language]} ${FACILITY_UNKNOWN_NOTE[language]}`.trim();
      let fallbackCaseId: string | null = null;
      try {
        const c = await openCase({
          module: "health",
          userId,
          interactionId,
          title: "Signe de danger signalé pendant une panne des services d'IA",
          severity: "critical",
          province: input.province ?? input.user?.province ?? null,
          notes:
            "Ouvert par la voie de repli déterministe : les fournisseurs d'IA étaient indisponibles. " +
            `Signes détectés : ${dangerSigns.slice(0, 8).join(", ")}. Le message d'origine est conservé sur l'interaction.`,
          escalate: true,
          escalationReason: "Signe de danger détecté hors ligne (NFR-A-01)",
        });
        fallbackCaseId = c.id;
        await save({ caseId: c.id });
      } catch (caseErr) {
        // The instruction still goes out. A caregiver being told to leave now
        // does not depend on the case row, and losing both would be worse.
        console.error("[orchestrator] fallback case could not be opened", caseErr);
      }
      await audit({
        action: "interaction.emergency_fallback",
        actorUserId: userId,
        entityType: "interaction",
        entityId: interactionId,
        systemEvent: "provider_outage",
        after: { phrases: dangerSigns.slice(0, 8), language, caseId: fallbackCaseId },
      });
      const answer: FinalAnswer = {
        asking: transcriptForFallback.slice(0, 500),
        understanding: "Signe de danger détecté sans l'aide d'un modèle : les services d'IA étaient indisponibles.",
        risk: { level: "critical", score: 1, flags: ["signe_de_danger", "repli_hors_ligne", ...dangerSigns.slice(0, 5)], uncertaintyDriven: false },
        action: scripted,
        escalation: { required: true, to: ROLE_LABEL.health, reason: "Signe de danger détecté hors ligne (NFR-A-01)" },
        confidence: { score: 0, low: true },
        summary: `[santé] signe de danger — repli hors ligne, escaladé${fallbackCaseId ? "" : " (dossier non créé)"}`,
      };
      return {
        interactionId,
        // The turn did what it existed to do, so it is not reported as a failure
        // to the citizen; the interaction row keeps status=failed and the reason.
        status: "completed",
        module: "health",
        language,
        languageConfidence: 0,
        transcript: transcriptForFallback,
        intent: "health_danger_sign_offline",
        answer,
        answerLocalised: answer,
        responseText: scripted,
        spokenText: toSpokenText(scripted, language),
        followUpQuestions: [],
        clarificationReasons: [],
        confidenceDimensions: { transcription: null, language: 0, translation: 0, overall: 0 },
        caseId: fallbackCaseId,
        audioUrl: null,
        audioAvailable: false,
        latencyMs: Date.now() - started,
      };
    }

    return failedOutput(interactionId, language, "Le service est momentanément indisponible. Votre message a été enregistré ; réessayez dans quelques instants.", started);
  }
}

function failedOutput(interactionId: string, language: LanguageCode, message: string, started: number): InteractionOutput {
  const empty: FinalAnswer = {
    asking: "",
    understanding: "",
    risk: { level: "low", score: 0, flags: [], uncertaintyDriven: false },
    action: message,
    escalation: { required: false, to: null, reason: null },
    confidence: { score: 0, low: true },
    summary: "échec de traitement",
  };
  return {
    interactionId,
    status: "failed",
    module: "general",
    language,
    languageConfidence: 0,
    transcript: "",
    intent: null,
    answer: empty,
    answerLocalised: empty,
    responseText: message,
    spokenText: toSpokenText(message, language),
    followUpQuestions: [],
    clarificationReasons: [],
    confidenceDimensions: { transcription: null, language: 0, translation: 0, overall: 0 },
    caseId: null,
    audioUrl: null,
    audioAvailable: false,
    latencyMs: Date.now() - started,
    message,
  };
}
