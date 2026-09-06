import { z } from "zod";
import { handle } from "@server/core/api";
import { assessEducation } from "@server/ai/agents/education";
import { profileOrDefault, weeksToExam } from "@server/ai/education/profile";
import { examObjectives } from "@server/ai/education/curriculum";
import { plannedRevisions, reviewLadder } from "@server/ai/education/spaced-repetition";

const Body = z.object({ request: z.string().max(2000).optional(), province: z.string().max(120).optional() });

/**
 * Exam revision plan (FR-ED-06): weeks-to-exam from the confirmed profile, a weekly plan,
 * the spaced-repetition ladder, and the revision nudges already scheduled.
 */
export const POST = handle({ auth: true, limit: "ai" }, async ({ user, json }) => {
  const body = await json(Body);
  const profile = await profileOrDefault(user.userId);
  const assessment = await assessEducation(body.request ?? "Je prépare mon examen, aide-moi à organiser mes révisions.", {
    userId: user.userId,
    province: body.province ?? user.province ?? null,
    language: profile.explainLanguage,
    mode: "exam_prep",
  });
  return {
    plan: assessment.revisionPlan,
    weeksToExam: weeksToExam(profile),
    examTarget: profile.examTarget,
    profileConfirmed: profile.confirmed,
    confirmationQuestions: assessment.confirmationQuestions,
    priorityObjectives: profile.examTarget === "none" ? [] : examObjectives(profile.examTarget).slice(0, 12),
    revisionLadderDays: reviewLadder(5),
    scheduledNudges: await plannedRevisions(user.userId),
    spoken: assessment.explanation,
  };
});
