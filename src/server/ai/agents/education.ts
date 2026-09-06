/**
 * Education Agent — StudYear Rural (FR-ED-01..10, EDU-001..005).
 *
 * The model teaches; the rules protect. Deterministic here:
 *   - the learner profile is read, never inferred from the voice (FR-ED-01);
 *   - child-safety screening runs before anything is taught, and a disclosure raises a
 *     safeguarding flag instead of a lesson (EDU-005);
 *   - homework is hint-first: no final answer to graded work before an attempt (EDU-004);
 *   - the micro-explanation is trimmed to 90 seconds of speech;
 *   - parent summaries never contain the child's own words;
 *   - learning evidence is an event about a moment, never a label on a child.
 */
import "server-only";
import type { LanguageCode } from "@server/db/schema";
import { aiGateway } from "../gateway";
import { EducationTeachingSession, EducationRevisionPlan, EducationParentSummary, type EducationAssessment } from "../schemas";
import { EDUCATION_AGENT_SYSTEM, EDUCATION_PARENT_SYSTEM, EDUCATION_PLAN_SYSTEM, messageEnvelope } from "../prompts";
import { knowledgePromptFragment, searchKnowledge, type KnowledgeHit } from "../knowledge";
import { screenLearnerMessage, scrubCommercial, isAgeAppropriate, type ChildSafetyResult } from "../education/child-safety";
import { findObjective, LEVEL_LABELS, EXAM_LABELS, type CurriculumObjective } from "../education/curriculum";
import { profileOrDefault, weeksToExam, CONFIRMATION_QUESTIONS, type LearnerProfile } from "../education/profile";
import { recordEvidence, learnerEvidence, summariseEvidence, classGaps, type EvidenceResult } from "../education/evidence";
import { scheduleRevision, qualityFromScore } from "../education/spaced-repetition";
import { ensureStories, STORIES, storyWordCount, type StorySeed } from "@server/db/reference/stories";

export type EducationMode = "explain" | "quiz" | "read" | "homework" | "exam_prep" | "parent" | "teacher";

/** Words per second of calm spoken French; 90 s of speech is about 225 words. */
export const SPEECH_WORDS_PER_SECOND = 2.5;
export const MAX_EXPLANATION_SECONDS = 90;

export interface EducationContext {
  province?: string | null;
  ageHint?: string | null;
  history?: string | null;
  /** Additive: supplied by the orchestrator when available. */
  userId?: string | null;
  language?: LanguageCode | null;
  territory?: string | null;
  mode?: EducationMode | null;
  date?: Date;
}

export interface HomeworkPolicy {
  isGradedWork: boolean;
  attemptDetected: boolean;
  answerWithheld: boolean;
  hints: string[];
  workedExample: string;
}

export interface EducationAssessmentPlus extends EducationAssessment {
  mode: EducationMode;
  objective: string;
  objectiveCode: string | null;
  level: string;
  levelLabel: string;
  ageBand: string;
  profileConfirmed: boolean;
  confirmationQuestions: string[];
  steps: Array<{ stage: string; content: string }>;
  masterySignal: string | null;
  score: number | null;
  localExample: string;
  guidedAttempt: { prompt: string; expectedAnswer: string; hint: string } | null;
  independentAttempt: { prompt: string; expectedAnswer: string } | null;
  misconceptions: Array<{ label: string; feedback: string }>;
  homework: HomeworkPolicy;
  recap: string;
  nextStep: string;
  speechSeconds: number;
  safeguarding: boolean;
  safety: { flags: string[]; categories: string[]; removed: string[] };
  parentSummary: { summary: string; strengths: string[]; toWorkOn: string[]; homeActivities: string[]; encouragement: string } | null;
  revisionPlan: { examTarget: string; weeksToExam: number | null; weeks: Array<{ week: number; focus: string[]; activities: string[]; checkpoint: string }>; dailyRoutine: string[]; advice: string } | null;
  teacherView: Awaited<ReturnType<typeof classGaps>> | null;
  story: { title: string; language: string; level: string; words: number; readingSeconds: number; focus: string; comprehensionQuestions: string[]; body: string } | null;
  evidenceRecorded: boolean;
  citations: string[];
  userId: string | null;
}

/* ------------------------------------------------------------------------------------------
 * Mode and attempt detection (deterministic)
 * ---------------------------------------------------------------------------------------- */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const MODE_PATTERNS: Array<[EducationMode, RegExp]> = [
  ["teacher", /ma classe|mes eleves|mes élèves|en tant qu'enseignant|mes apprenants|niveau de la classe/i],
  ["parent", /mon enfant|ma fille|mon fils|je suis (le |la )?parent|comment l'aider|comment aider mon/i],
  ["exam_prep", /tenafep|exetat|examen d'etat|examen d'état|examen national|preparer l'examen|préparer l'examen|revision pour l'examen|révision pour l'examen|plan de revision|plan de révision/i],
  ["homework", /devoir|exercice a rendre|exercice à rendre|interrogation|controle de demain|contrôle de demain|mon devoir|travail note|travail noté/i],
  ["quiz", /interroge[- ]moi|pose[- ]moi des questions|teste[- ]moi|fais[- ]moi un quiz|quiz|petite evaluation|petite évaluation/i],
  ["read", /lis[- ]moi|raconte[- ]moi une histoire|une histoire a lire|une histoire à lire|conte|lecture a voix haute|lecture à voix haute/i],
];

export function detectMode(text: string, hint?: EducationMode | null): EducationMode {
  if (hint) return hint;
  for (const [mode, re] of MODE_PATTERNS) if (re.test(text)) return mode;
  return "explain";
}

const ATTEMPT_PATTERNS = /j'ai essaye|j'ai essayé|j'ai trouve|j'ai trouvé|ma reponse|ma réponse|je pense que c'est|j'ai fait|j'obtiens|je trouve|j'ai calcule|j'ai calculé|voici ce que j'ai|mon resultat|mon résultat/i;
const GRADED_PATTERNS = /devoir|interrogation|controle|contrôle|examen blanc|travail note|travail noté|a rendre|à rendre|note par le|noté par le/i;
const REPEAT_PATTERNS = /je ne comprends (toujours )?pas|explique (encore|autrement)|repete|répète|je n'ai pas compris|encore une fois/i;

export function detectAttempt(text: string): boolean {
  return ATTEMPT_PATTERNS.test(text);
}

export function isGradedWork(text: string): boolean {
  return GRADED_PATTERNS.test(text);
}

/** Trims a micro-explanation to what fits in 90 seconds of speech, at a sentence boundary. */
export function trimToSpeech(text: string, seconds = MAX_EXPLANATION_SECONDS): { text: string; seconds: number; trimmed: boolean } {
  const maxWords = Math.floor(seconds * SPEECH_WORDS_PER_SECOND);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return { text: text.trim(), seconds: Number((words.length / SPEECH_WORDS_PER_SECOND).toFixed(1)), trimmed: false };
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const n = s.trim().split(/\s+/).length;
    if (count + n > maxWords) break;
    kept.push(s.trim());
    count += n;
  }
  const out = kept.length ? kept.join(" ") : words.slice(0, maxWords).join(" ");
  const finalCount = out.split(/\s+/).length;
  return { text: out, seconds: Number((finalCount / SPEECH_WORDS_PER_SECOND).toFixed(1)), trimmed: true };
}

/** Removes any sentence that repeats a long run of the child's own words (FR-ED-06). */
export function stripVerbatim(summary: string, transcript: string, runLength = 6): string {
  const src = norm(transcript).split(/\s+/).filter(Boolean);
  if (src.length < runLength) return summary;
  const runs = new Set<string>();
  for (let i = 0; i + runLength <= src.length; i++) runs.add(src.slice(i, i + runLength).join(" "));
  return summary
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const n = norm(sentence);
      for (const r of runs) if (n.includes(r)) return false;
      return true;
    })
    .join(" ")
    .trim();
}

const AGE_GROUP_MAP: Record<string, EducationAssessment["learnerAgeGroup"]> = {
  "6-8": "6-9",
  "9-11": "10-12",
  "12-14": "13-15",
  "15-18": "16-18",
  adult: "adult",
};

/* ------------------------------------------------------------------------------------------
 * Main entry point
 * ---------------------------------------------------------------------------------------- */

export async function assessEducation(textFr: string, ctx: EducationContext, interactionId?: string): Promise<EducationAssessmentPlus> {
  const language: LanguageCode = ctx.language ?? "fr";
  const userId = ctx.userId ?? null;
  const profile = await profileOrDefault(userId);
  const mode = detectMode(textFr, ctx.mode ?? null);

  // 1. Child safety comes before teaching (EDU-005).
  const screen = screenLearnerMessage(textFr, language);
  if (!screen.ok && screen.scriptedResponse) {
    return safeguardedAnswer(textFr, screen, profile, mode, userId);
  }

  // 2. Curriculum anchor and approved knowledge.
  const curriculum = findObjective(textFr, profile.level, null);
  const hits = await searchKnowledge("education", `${textFr} ${curriculum?.topic ?? ""}`, 4);

  const graded = isGradedWork(textFr);
  const attempted = detectAttempt(textFr);

  // 3. One teaching call.
  const r = await aiGateway().generateJson(
    {
      system: EDUCATION_AGENT_SYSTEM,
      user: `${knowledgePromptFragment(hits)}\n${messageEnvelope(textFr, {
        mode,
        niveau: profile.level,
        classe: LEVEL_LABELS[profile.level],
        tranche_age: profile.ageBand,
        profil_confirme: profile.confirmed ? "oui" : "non — ne rien supposer, poser la question",
        langue_explication: profile.explainLanguage,
        objectif_programme: curriculum ? `${curriculum.code} — ${curriculum.objective}` : null,
        examen: profile.examTarget !== "none" ? EXAM_LABELS[profile.examTarget] : null,
        travail_note: graded ? "oui" : "non",
        tentative_faite: attempted ? "oui" : "non",
        province: ctx.province,
        historique: ctx.history,
      })}`,
      schema: EducationTeachingSession,
      schemaName: "education_teaching_session",
      maxTokens: 2600,
    },
    { interactionId },
  );
  const m = r.output;

  // 4. Output filters: no commercial persuasion, age-appropriate wording.
  const cleaned = scrubCommercial(m.explanation);
  const ageCheck = isAgeAppropriate(`${m.explanation} ${m.localExample}`, profile.ageBand);
  const removed = [...cleaned.removed, ...ageCheck.reasons];
  const trimmedExplanation = trimToSpeech(cleaned.text);

  // 5. Homework policy: hint first, never the final answer before an attempt (EDU-004).
  const homework: HomeworkPolicy = {
    isGradedWork: graded,
    attemptDetected: attempted,
    answerWithheld: (mode === "homework" || graded) && !attempted,
    hints: m.hints.length ? m.hints : ["Relis l'énoncé et dis à voix haute ce que l'on te demande.", "Note ce que tu connais déjà et ce que tu cherches.", "Fais un schéma ou un dessin de la situation."],
    workedExample: scrubCommercial(m.workedExample).text,
  };

  let explanation: string;
  if (homework.answerWithheld) {
    explanation = [
      "Je ne vais pas te donner la réponse de ton devoir avant que tu aies essayé : c'est en cherchant que tu apprends, et ton enseignant doit voir ton propre travail.",
      `Voici des indices, du plus léger au plus fort : ${homework.hints.map((h, i) => `${i + 1}) ${h}`).join(" ")}`,
      homework.workedExample ? `Et voici un exemple résolu sur un exercice semblable, pas sur le tien : ${homework.workedExample}` : "",
      "Fais un essai maintenant et dis-moi ce que tu trouves : je te dirai ce qui est juste et ce qu'il faut corriger.",
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    explanation = [trimmedExplanation.text, m.localExample ? `Exemple : ${m.localExample}` : "", m.guidedAttempt?.prompt ? `À toi d'essayer : ${m.guidedAttempt.prompt}` : ""].filter(Boolean).join(" ");
  }

  // 6. Mode-specific work.
  let parentSummary: EducationAssessmentPlus["parentSummary"] = null;
  let revisionPlan: EducationAssessmentPlus["revisionPlan"] = null;
  let teacherView: EducationAssessmentPlus["teacherView"] = null;
  let story: EducationAssessmentPlus["story"] = null;

  if (mode === "read") {
    story = await pickStory(profile.explainLanguage, textFr);
    if (story) {
      explanation = `Voici une histoire à lire à voix haute : « ${story.title} ». ${story.body} Quand tu as fini, réponds à ces questions : ${story.comprehensionQuestions.join(" ")}`;
    }
  }

  if (mode === "parent") {
    parentSummary = await buildParentSummary(textFr, userId, interactionId);
    if (parentSummary) explanation = `${parentSummary.summary} ${parentSummary.encouragement}`;
  }
  if (mode === "exam_prep") {
    revisionPlan = await buildRevisionPlan(textFr, profile, ctx.date ?? new Date(), interactionId);
    if (revisionPlan) {
      explanation = `${explanation} ${renderPlan(revisionPlan)}`;
      if (userId) await scheduleRevisionNudges(userId, revisionPlan, m.topic || curriculum?.topic || "révision", m.subject, curriculum, language);
    }
  }
  if (mode === "teacher") {
    teacherView = await classGaps({ province: ctx.province ?? null, territory: ctx.territory ?? null, days: 30 });
    if (teacherView.gaps.length) {
      explanation = `${explanation} Points faibles observés dans la zone : ${teacherView.gaps.slice(0, 3).map((g) => `${g.topic} (${Math.round(g.masteredRate * 100)} % de réussite, ${g.learners} apprenants)`).join(" ; ")}. ${teacherView.disclaimer}`;
    }
  }

  // 7. Learning evidence: only when there is an actual attempt or a repeat request.
  const repeatRequest = REPEAT_PATTERNS.test(textFr);
  let evidenceRecorded = false;
  const evidenceResult: EvidenceResult | null = attempted ? (m.learningDifficulty && m.learningDifficulty !== "none" ? "partial" : "mastered") : repeatRequest ? "repeat_request" : null;
  if (userId && evidenceResult) {
    await recordEvidence({
      userId,
      subject: m.subject,
      topic: m.topic || curriculum?.topic || "séance",
      objective: m.objective || curriculum?.objective || null,
      rubric: m.guidedAttempt?.expectedAnswer ? `Réussir : ${m.objective}` : null,
      difficulty: m.difficultyLevel,
      assistanceLevel: homework.answerWithheld ? "indice" : "guidee",
      response: attempted ? textFr.slice(0, 500) : null,
      result: evidenceResult,
      misconception: m.misconceptions[0]?.label ?? null,
      modelVersion: r.model,
      province: ctx.province ?? null,
      territory: ctx.territory ?? null,
    });
    evidenceRecorded = true;
  }

  const citations = ensureCitations(m.citations, hits);
  const finalExplanation = scrubCommercial(explanation).text;
  const speech = trimToSpeech(finalExplanation, mode === "explain" ? MAX_EXPLANATION_SECONDS : 180);

  return {
    // legacy EducationAssessment surface
    understanding: m.understanding,
    learnerAgeGroup: profile.confirmed ? AGE_GROUP_MAP[profile.ageBand] ?? "unknown" : "unknown",
    subject: m.subject,
    topic: m.topic,
    difficultyLevel: m.difficultyLevel,
    explanation: finalExplanation,
    quiz: homework.answerWithheld ? [] : m.checkQuestions.slice(0, 3),
    studyAction: scrubCommercial(m.studyAction).text,
    learningDifficulty: m.learningDifficulty,
    followUpQuestions: profile.confirmed ? [] : CONFIRMATION_QUESTIONS.slice(0, 2),
    confidence: Number(Math.min(m.confidence, profile.confirmed ? 1 : 0.6).toFixed(2)),
    // additive fields
    mode,
    objective: m.objective || curriculum?.objective || `Comprendre ${m.topic}`,
    objectiveCode: curriculum?.code ?? null,
    level: profile.level,
    levelLabel: LEVEL_LABELS[profile.level],
    ageBand: profile.ageBand,
    profileConfirmed: profile.confirmed,
    confirmationQuestions: profile.confirmed ? [] : CONFIRMATION_QUESTIONS,
    steps: m.steps.map((s) => ({ stage: s.stage, content: s.content })),
    masterySignal: null,
    score: null,
    localExample: m.localExample,
    guidedAttempt: homework.answerWithheld ? null : m.guidedAttempt,
    independentAttempt: homework.answerWithheld ? null : m.independentAttempt,
    misconceptions: m.misconceptions,
    homework,
    recap: m.recap,
    nextStep: m.nextStep,
    speechSeconds: speech.seconds,
    safeguarding: false,
    safety: { flags: screen.flags, categories: screen.safeguardingCategories, removed },
    parentSummary,
    revisionPlan,
    teacherView,
    story,
    evidenceRecorded,
    citations,
    userId,
  };
}

/* ------------------------------------------------------------------------------------------
 * Safeguarding path
 * ---------------------------------------------------------------------------------------- */

function safeguardedAnswer(textFr: string, screen: ChildSafetyResult, profile: LearnerProfile, mode: EducationMode, userId: string | null): EducationAssessmentPlus {
  const response = screen.scriptedResponse ?? "";
  return {
    understanding: screen.safeguarding
      ? "Un élément de protection de l'enfance a été signalé : la séance d'apprentissage est mise de côté."
      : "La demande porte sur un sujet qui ne relève pas de l'aide scolaire.",
    learnerAgeGroup: profile.confirmed ? AGE_GROUP_MAP[profile.ageBand] ?? "unknown" : "unknown",
    subject: "other",
    topic: screen.safeguarding ? "protection de l'enfance" : "sujet non scolaire",
    difficultyLevel: "beginner",
    explanation: response,
    quiz: [],
    studyAction: "Parles-en à un adulte de confiance dès que possible.",
    learningDifficulty: "none",
    followUpQuestions: [],
    confidence: 0.9,
    mode,
    objective: "Mettre l'apprenant en sécurité avant toute autre chose",
    objectiveCode: null,
    level: profile.level,
    levelLabel: LEVEL_LABELS[profile.level],
    ageBand: profile.ageBand,
    profileConfirmed: profile.confirmed,
    confirmationQuestions: [],
    steps: [],
    masterySignal: null,
    score: null,
    localExample: "",
    guidedAttempt: null,
    independentAttempt: null,
    misconceptions: [],
    homework: { isGradedWork: false, attemptDetected: false, answerWithheld: false, hints: [], workedExample: "" },
    recap: "",
    nextStep: "",
    speechSeconds: Number((response.split(/\s+/).length / SPEECH_WORDS_PER_SECOND).toFixed(1)),
    safeguarding: screen.safeguarding,
    safety: { flags: screen.flags, categories: screen.safeguardingCategories, removed: [] },
    parentSummary: null,
    revisionPlan: null,
    teacherView: null,
    story: null,
    evidenceRecorded: false,
    citations: [],
    userId,
  };
}

/* ------------------------------------------------------------------------------------------
 * Parent, exam and citation helpers
 * ---------------------------------------------------------------------------------------- */

async function buildParentSummary(textFr: string, userId: string | null, interactionId?: string) {
  const evidence = userId ? await learnerEvidence({ userId, days: 60, limit: 60 }) : [];
  const digest = summariseEvidence(evidence);
  const r = await aiGateway().generateJson(
    {
      system: EDUCATION_PARENT_SYSTEM,
      user: messageEnvelope("Prépare le point d'étape pour le parent.", {
        matieres_travaillees: digest.topics.map((t) => `${t.topic} (${t.mastered}/${t.attempts} réussites)`).join(", ") || null,
        points_forts: digest.strengths.join(", ") || null,
        a_travailler: digest.toWorkOn.join(", ") || null,
        demande_du_parent: textFr.slice(0, 300),
      }),
      schema: EducationParentSummary,
      schemaName: "education_parent_summary",
      maxTokens: 900,
    },
    { interactionId },
  );
  const out = r.output;
  return {
    summary: scrubCommercial(stripVerbatim(out.summary, textFr)).text,
    strengths: out.strengths,
    toWorkOn: out.toWorkOn,
    homeActivities: out.homeActivities.map((a) => scrubCommercial(a).text),
    encouragement: out.encouragement,
  };
}

async function buildRevisionPlan(textFr: string, profile: LearnerProfile, now: Date, interactionId?: string) {
  const weeks = weeksToExam(profile, now);
  const r = await aiGateway().generateJson(
    {
      system: EDUCATION_PLAN_SYSTEM,
      user: messageEnvelope(textFr, {
        examen: profile.examTarget,
        semaines_avant_examen: weeks !== null ? String(weeks) : "6",
        niveau: profile.level,
        classe: LEVEL_LABELS[profile.level],
      }),
      schema: EducationRevisionPlan,
      schemaName: "education_revision_plan",
      maxTokens: 1800,
    },
    { interactionId },
  );
  return { examTarget: r.output.examTarget, weeksToExam: weeks, weeks: r.output.weeks, dailyRoutine: r.output.dailyRoutine, advice: r.output.advice };
}

function renderPlan(plan: NonNullable<EducationAssessmentPlus["revisionPlan"]>): string {
  const head = plan.weeksToExam !== null ? `Il te reste environ ${plan.weeksToExam} semaine(s) avant l'examen.` : "Voici un plan de révision sur les prochaines semaines.";
  const first = plan.weeks[0];
  return `${head} ${first ? `Semaine 1 : ${first.focus.join(", ")}. ${first.activities.join(" ")} Point de contrôle : ${first.checkpoint}` : ""} ${plan.advice}`.replace(/\s+/g, " ").trim();
}

async function scheduleRevisionNudges(
  userId: string,
  plan: NonNullable<EducationAssessmentPlus["revisionPlan"]>,
  topic: string,
  subject: string,
  curriculum: CurriculumObjective | null,
  language: LanguageCode,
) {
  try {
    await scheduleRevision({
      userId,
      subject,
      topic,
      objectiveCode: curriculum?.code ?? null,
      quality: qualityFromScore(0.6, true),
      language,
    });
  } catch (err) {
    console.error("[education] revision scheduling failed", err);
  }
}

/** Picks a story from the read-aloud library, in the learner's language when possible. */
async function pickStory(language: LanguageCode, request: string): Promise<EducationAssessmentPlus["story"]> {
  await ensureStories();
  const wanted = norm(request);
  const inLanguage = STORIES.filter((s) => s.language === language);
  const pool = inLanguage.length ? inLanguage : STORIES.filter((s) => s.language === "fr");
  const chosen: StorySeed | undefined = pool.find((s) => norm(s.title).split(" ").some((w) => w.length >= 5 && wanted.includes(w))) ?? pool[0];
  if (!chosen) return null;
  const words = storyWordCount(chosen.body);
  return {
    title: chosen.title,
    language: chosen.language,
    level: chosen.level,
    words,
    readingSeconds: Math.round(words / 2),
    focus: chosen.focus,
    comprehensionQuestions: chosen.comprehensionQuestions,
    body: chosen.body,
  };
}

function ensureCitations(modelCitations: string[], hits: KnowledgeHit[]): string[] {
  const available = new Set(hits.map((h) => h.docId));
  const kept = modelCitations.map((c) => c.replace(/[[\]]/g, "").trim()).filter((c) => available.has(c));
  if (kept.length) return Array.from(new Set(kept));
  return hits.length ? [hits[0].docId] : [];
}
