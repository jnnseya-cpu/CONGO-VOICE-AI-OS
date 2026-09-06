/**
 * Oral quiz engine (FR-ED-04).
 *
 * Generation is a model call; scoring is not. A spoken answer is normalised (accents,
 * fillers, number words, fractions, decimal separators) and compared with tolerance, then
 * matched against the misconceptions declared with the question. Feedback is always tied to
 * the rubric criterion — the learner never hears a bare "incorrect".
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@server/db/client";
import { aiGateway } from "../gateway";
import { EducationQuizSet, type QuizQuestion } from "../schemas";
import { EDUCATION_QUIZ_SYSTEM, messageEnvelope } from "../prompts";
import { knowledgePromptFragment, searchKnowledge } from "../knowledge";
import { scrubCommercial } from "./child-safety";
import { findObjective, LEVEL_LABELS, type SchoolLevel } from "./curriculum";

/* ------------------------------------------------------------------------------------------
 * Normalisation
 * ---------------------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, mille: 1000,
};

const FILLERS = [
  "la reponse est", "reponse", "je pense que", "je crois que", "c est", "cest", "ca fait", "ca donne",
  "je dirais", "euh", "hmm", "alors", "donc", "monsieur", "madame", "s il vous plait", "merci",
];

const FRACTION_WORDS: Array<[RegExp, string]> = [
  [/\b(la )?moitie\b/, "1/2"],
  [/\bun demi\b|\bune demie\b|\bdemi\b/, "1/2"],
  [/\bun quart\b/, "1/4"],
  [/\btrois quarts?\b/, "3/4"],
  [/\bun tiers\b/, "1/3"],
  [/\bdeux tiers\b/, "2/3"],
  [/\bun huitieme\b/, "1/8"],
  [/\bun cinquieme\b/, "1/5"],
  [/\b(\d+)\s+sur\s+(\d+)\b/, "$1/$2"],
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/** Canonical form of a spoken answer. Deterministic and side-effect free. */
export function normaliseAnswer(raw: string): string {
  let s = stripAccents((raw ?? "").toLowerCase());
  s = s.replace(/[^\w\s/.,%-]/g, " ").replace(/_/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  for (const f of FILLERS) s = s.replace(new RegExp(`\\b${f}\\b`, "g"), " ");
  s = s.replace(/\s+/g, " ").trim();
  for (const [re, rep] of FRACTION_WORDS) s = s.replace(re, rep);
  // French number words → digits (simple additive forms only).
  s = s
    .split(" ")
    .map((w) => (w in NUMBER_WORDS ? String(NUMBER_WORDS[w]) : w))
    .join(" ");
  // Decimal comma → point when it sits between digits.
  s = s.replace(/(\d),(\d)/g, "$1.$2");
  s = s.replace(/\s*\/\s*/g, "/");
  s = s.replace(/(\d)\s*%/g, "$1%");
  // Drop punctuation-only leftovers ("euh...", trailing commas) without touching decimals.
  s = s
    .split(" ")
    .filter((w) => w.length > 0 && !/^[.,%-]+$/.test(w))
    .join(" ");
  return s.replace(/\s+/g, " ").trim();
}

/** Numeric value of an answer, understanding fractions and percentages. */
export function numericValue(normalised: string): number | null {
  const frac = normalised.match(/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (frac) {
    const d = Number(frac[2]);
    if (d !== 0) return Number(frac[1]) / d;
  }
  const pct = normalised.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) return Number(pct[1]) / 100;
  const num = normalised.match(/-?\d+(?:\.\d+)?/);
  return num ? Number(num[0]) : null;
}

/** Reduced fraction, so 2/4 and 1/2 compare equal. */
export function canonicalFraction(normalised: string): string | null {
  const m = normalised.match(/(-?\d+)\/(-?\d+)/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!b) return null;
  const g = gcd(a, b) || 1;
  return `${a / g}/${b / g}`;
}

export const NUMERIC_TOLERANCE = 0.01;

export function answersMatch(candidate: string, expected: string): boolean {
  const c = normaliseAnswer(candidate);
  const e = normaliseAnswer(expected);
  if (!c || !e) return false;
  if (c === e) return true;
  const cf = canonicalFraction(c);
  const ef = canonicalFraction(e);
  if (cf && ef && cf === ef) return true;
  const cv = numericValue(c);
  const ev = numericValue(e);
  if (cv !== null && ev !== null) {
    const tol = Math.max(NUMERIC_TOLERANCE, Math.abs(ev) * NUMERIC_TOLERANCE);
    if (Math.abs(cv - ev) <= tol) return true;
  }
  // Word answers: accept the expected phrase inside a longer spoken sentence.
  if (e.length >= 3 && (c.includes(` ${e} `) || c.startsWith(`${e} `) || c.endsWith(` ${e}`))) return true;
  return false;
}

/* ------------------------------------------------------------------------------------------
 * Scoring
 * ---------------------------------------------------------------------------------------- */

export type QuestionResult = "mastered" | "partial" | "struggling";

export interface ScoredAnswer {
  questionId: string;
  answer: string;
  normalised: string;
  correct: boolean;
  score: number;
  result: QuestionResult;
  rubric: string;
  matchedOn: string | null;
  misconception: { label: string; feedback: string } | null;
  /** Always explains, never a bare verdict. */
  feedback: string;
}

const PRAISE = ["Bravo, c'est exactement cela.", "Très bien, ta réponse est juste.", "Parfait, tu as bien appliqué la règle."];

export function scoreAnswer(question: QuizQuestion, rawAnswer: string, attemptIndex = 0): ScoredAnswer {
  const normalised = normaliseAnswer(rawAnswer);
  const candidates = [question.expectedAnswer, ...question.acceptableAnswers];
  const matched = candidates.find((c) => answersMatch(rawAnswer, c)) ?? null;

  if (matched) {
    return {
      questionId: question.id,
      answer: rawAnswer,
      normalised,
      correct: true,
      score: 1,
      result: "mastered",
      rubric: question.rubric,
      matchedOn: matched,
      misconception: null,
      feedback: `${PRAISE[attemptIndex % PRAISE.length]} Critère atteint : ${question.rubric}`,
    };
  }

  const misconception = question.misconceptions.find((m) => answersMatch(rawAnswer, m.trigger) || (normalised.length > 0 && normaliseAnswer(m.trigger).includes(normalised))) ?? null;

  // Partial credit: the answer carries the right idea but not the right form.
  const expectedNorm = normaliseAnswer(question.expectedAnswer);
  const overlap = expectedNorm.split(" ").filter((w) => w.length >= 3 && normalised.includes(w)).length;
  const partial = !misconception && normalised.length > 0 && overlap > 0;

  const feedback = misconception
    ? `Ce n'est pas encore juste, et c'est une erreur très fréquente : ${misconception.label}. ${misconception.feedback} Le critère à atteindre : ${question.rubric}`
    : partial
      ? `Tu es sur la bonne piste, il manque une étape. Le critère à atteindre : ${question.rubric}. Indice : ${question.hint} La réponse attendue était : ${question.expectedAnswer}.`
      : `Pas encore, et ce n'est pas grave : on reprend ensemble. Le critère à atteindre : ${question.rubric}. Indice : ${question.hint} La réponse attendue était : ${question.expectedAnswer}.`;

  return {
    questionId: question.id,
    answer: rawAnswer,
    normalised,
    correct: false,
    score: partial ? 0.5 : 0,
    result: partial ? "partial" : "struggling",
    rubric: question.rubric,
    matchedOn: null,
    misconception: misconception ? { label: misconception.label, feedback: misconception.feedback } : null,
    feedback,
  };
}

export type MasterySignal = "maitrise" | "en_cours" | "a_reprendre";

export interface QuizScore {
  score: number;
  correct: number;
  total: number;
  masterySignal: MasterySignal;
  results: ScoredAnswer[];
  summary: string;
}

export function masteryFromScore(score: number): MasterySignal {
  return score >= 0.8 ? "maitrise" : score >= 0.5 ? "en_cours" : "a_reprendre";
}

export function scoreQuiz(questions: QuizQuestion[], answers: Record<string, string>): QuizScore {
  const results = questions.map((q, i) => scoreAnswer(q, answers[q.id] ?? "", i));
  const total = results.length || 1;
  const raw = results.reduce((s, r) => s + r.score, 0) / total;
  const score = Number(raw.toFixed(2));
  const masterySignal = masteryFromScore(score);
  const correct = results.filter((r) => r.correct).length;
  const summary =
    masterySignal === "maitrise"
      ? `${correct} bonne(s) réponse(s) sur ${results.length} : la notion est acquise, on peut passer à la suite.`
      : masterySignal === "en_cours"
        ? `${correct} bonne(s) réponse(s) sur ${results.length} : c'est en cours, une courte révision et ce sera acquis.`
        : `${correct} bonne(s) réponse(s) sur ${results.length} : on reprend la notion depuis le début, calmement.`;
  return { score, correct, total: results.length, masterySignal, results, summary };
}

/* ------------------------------------------------------------------------------------------
 * Generation
 * ---------------------------------------------------------------------------------------- */

export interface GenerateQuizInput {
  topic: string;
  subject?: string | null;
  level?: SchoolLevel | null;
  objective?: string | null;
  interactionId?: string;
}

export interface GeneratedQuiz {
  subject: string;
  topic: string;
  objective: string;
  objectiveCode: string | null;
  questions: QuizQuestion[];
  citations: string[];
}

export async function generateQuiz(input: GenerateQuizInput): Promise<GeneratedQuiz> {
  const curriculum = findObjective(input.topic, input.level ?? null, null);
  const hits = await searchKnowledge("education", `${input.topic} ${input.subject ?? ""}`, 3);
  const r = await aiGateway().generateJson(
    {
      system: EDUCATION_QUIZ_SYSTEM,
      user: `${knowledgePromptFragment(hits)}\n${messageEnvelope(`Prépare cinq questions orales sur : ${input.topic}`, {
        sujet: input.topic,
        matiere: input.subject,
        niveau: input.level ? LEVEL_LABELS[input.level] : null,
        objectif: input.objective ?? curriculum?.objective ?? null,
      })}`,
      schema: EducationQuizSet,
      schemaName: "education_quiz_set",
      maxTokens: 2200,
    },
    { interactionId: input.interactionId },
  );

  const questions = r.output.questions.map((q, i) => ({
    ...q,
    id: q.id?.trim() || `q${i + 1}`,
    prompt: scrubCommercial(q.prompt).text,
    hint: scrubCommercial(q.hint).text,
  }));

  return {
    subject: r.output.subject,
    topic: r.output.topic || input.topic,
    objective: r.output.objective || curriculum?.objective || `Vérifier la maîtrise de ${input.topic}`,
    objectiveCode: curriculum?.code ?? null,
    questions,
    citations: hits.map((h) => h.docId),
  };
}

/* ------------------------------------------------------------------------------------------
 * Quiz sessions
 *
 * A quiz taken outside the interaction pipeline has no interaction row to hang from
 * (education_sessions.interaction_id is NOT NULL), so the running session is kept in the
 * generic per-user draft store, keyed `quiz:<id>`, and the durable learning signal is
 * written to learning_evidence when the learner answers.
 * ---------------------------------------------------------------------------------------- */

export interface QuizSessionState extends Record<string, unknown> {
  quizId: string;
  subject: string;
  topic: string;
  objective: string;
  objectiveCode: string | null;
  citations: string[];
  questions: QuizQuestion[];
  answers: Record<string, string>;
  results: ScoredAnswer[];
  createdAt: string;
  completedAt: string | null;
  score: number | null;
  masterySignal: MasterySignal | null;
}

const QUIZ_PREFIX = "quiz:";

export async function createQuizSession(userId: string | null, quiz: GeneratedQuiz): Promise<QuizSessionState> {
  const db = await getDb();
  const quizId = randomUUID();
  const state: QuizSessionState = {
    quizId,
    subject: quiz.subject,
    topic: quiz.topic,
    objective: quiz.objective,
    objectiveCode: quiz.objectiveCode,
    citations: quiz.citations,
    questions: quiz.questions,
    answers: {},
    results: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
    score: null,
    masterySignal: null,
  };
  await db.insert(schema.autosaveDrafts).values({ userId, clientKey: `${QUIZ_PREFIX}${quizId}`, module: "education", payload: state });
  return state;
}

export async function getQuizSession(quizId: string, userId: string | null): Promise<QuizSessionState | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.autosaveDrafts)
    .where(and(eq(schema.autosaveDrafts.clientKey, `${QUIZ_PREFIX}${quizId}`), userId ? eq(schema.autosaveDrafts.userId, userId) : undefined))
    .orderBy(desc(schema.autosaveDrafts.updatedAt))
    .limit(1);
  return (rows[0]?.payload as QuizSessionState | undefined) ?? null;
}

export async function saveQuizSession(state: QuizSessionState, userId: string | null): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.autosaveDrafts)
    .where(and(eq(schema.autosaveDrafts.clientKey, `${QUIZ_PREFIX}${state.quizId}`), userId ? eq(schema.autosaveDrafts.userId, userId) : undefined))
    .limit(1);
  if (rows[0]) {
    await db
      .update(schema.autosaveDrafts)
      .set({ payload: state, version: rows[0].version + 1, updatedAt: new Date() })
      .where(eq(schema.autosaveDrafts.id, rows[0].id));
  } else {
    await db.insert(schema.autosaveDrafts).values({ userId, clientKey: `${QUIZ_PREFIX}${state.quizId}`, module: "education", payload: state });
  }
}

/** Questions as they are read to the learner: no expected answer leaks. */
export function publicQuestions(questions: QuizQuestion[]) {
  return questions.map((q) => ({ id: q.id, prompt: q.prompt, answerType: q.answerType, difficulty: q.difficulty, rubric: q.rubric, hint: q.hint }));
}
