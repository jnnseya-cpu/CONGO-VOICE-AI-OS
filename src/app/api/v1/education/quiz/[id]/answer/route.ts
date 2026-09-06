import { z } from "zod";
import { handle } from "@/lib/core/api";
import { badRequest, notFound } from "@/lib/core/errors";
import { getQuizSession, masteryFromScore, saveQuizSession, scoreAnswer, scoreQuiz } from "@/lib/ai/education/quiz";
import { recordEvidence } from "@/lib/ai/education/evidence";
import { qualityFromScore, scheduleRevision } from "@/lib/ai/education/spaced-repetition";
import { profileOrDefault } from "@/lib/ai/education/profile";

const Body = z.object({ questionId: z.string().min(1).max(60), answer: z.string().max(1000), assisted: z.boolean().optional() });

/**
 * Scores one spoken answer (FR-ED-04). Scoring is deterministic: normalisation, tolerance,
 * then rubric-linked feedback with the misconception named — never a bare "incorrect".
 * Each answer writes a learning-evidence event; a completed quiz schedules the next review.
 */
export const POST = handle<{ id: string }>({ auth: true }, async ({ user, params, json }) => {
  const body = await json(Body);
  const session = await getQuizSession(params.id, user.userId);
  if (!session) throw notFound("Quiz introuvable ou expiré");

  const question = session.questions.find((q) => q.id === body.questionId);
  if (!question) throw badRequest(`Question inconnue : ${body.questionId}`, { questions: session.questions.map((q) => q.id) });

  const attemptIndex = session.results.length;
  const scored = scoreAnswer(question, body.answer, attemptIndex);

  session.answers[question.id] = body.answer;
  session.results = [...session.results.filter((r) => r.questionId !== question.id), scored];

  const answeredAll = session.questions.every((q) => q.id in session.answers);
  let total: ReturnType<typeof scoreQuiz> | null = null;
  if (answeredAll) {
    total = scoreQuiz(session.questions, session.answers);
    session.score = total.score;
    session.masterySignal = total.masterySignal;
    session.completedAt = new Date().toISOString();
  }
  await saveQuizSession(session, user.userId);

  await recordEvidence({
    userId: user.userId,
    subject: session.subject,
    topic: session.topic,
    objective: session.objective,
    rubric: question.rubric,
    difficulty: question.difficulty,
    assistanceLevel: body.assisted ? "indice" : "aucune",
    response: body.answer.slice(0, 500),
    result: scored.correct ? "mastered" : scored.result === "partial" ? "partial" : "struggling",
    misconception: scored.misconception?.label ?? null,
    province: user.province ?? null,
  });

  let nextReview: { dueAt: string; intervalDays: number } | null = null;
  if (total) {
    const profile = await profileOrDefault(user.userId);
    const { outcome } = await scheduleRevision({
      userId: user.userId,
      subject: session.subject,
      topic: session.topic,
      objectiveCode: session.objectiveCode,
      quality: qualityFromScore(total.score, !!body.assisted),
      language: profile.explainLanguage,
    });
    nextReview = { dueAt: outcome.dueAt.toISOString(), intervalDays: outcome.intervalDays };
  }

  return {
    result: scored,
    answered: Object.keys(session.answers).length,
    total: session.questions.length,
    completed: answeredAll,
    score: session.score,
    masterySignal: session.masterySignal ?? (session.score !== null ? masteryFromScore(session.score) : null),
    summary: total?.summary ?? null,
    nextReview,
  };
});
