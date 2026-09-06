import { z } from "zod";
import { handle } from "@server/core/api";
import { createQuizSession, generateQuiz, publicQuestions } from "@server/ai/education/quiz";
import { profileOrDefault } from "@server/ai/education/profile";
import { LEVELS } from "@server/ai/education/curriculum";

const Body = z.object({
  topic: z.string().min(2).max(160),
  subject: z.string().max(60).optional(),
  level: z.enum(LEVELS as unknown as [string, ...string[]]).optional(),
  objective: z.string().max(300).optional(),
});

/**
 * Generates a five-question oral quiz (FR-ED-04) and opens a session.
 * The expected answers never leave the server: only the prompts are returned.
 */
export const POST = handle({ auth: true, limit: "ai" }, async ({ user, json }) => {
  const body = await json(Body);
  const profile = await profileOrDefault(user.userId);
  const quiz = await generateQuiz({
    topic: body.topic,
    subject: body.subject ?? null,
    level: (body.level as (typeof LEVELS)[number] | undefined) ?? profile.level,
    objective: body.objective ?? null,
  });
  const session = await createQuizSession(user.userId, quiz);
  return {
    quizId: session.quizId,
    subject: session.subject,
    topic: session.topic,
    objective: session.objective,
    objectiveCode: session.objectiveCode,
    citations: session.citations,
    questions: publicQuestions(session.questions),
    count: session.questions.length,
  };
});
