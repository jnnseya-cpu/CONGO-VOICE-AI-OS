import { z } from "zod";
import { handle } from "@/lib/core/api";
import { assessEducation, type EducationMode } from "@/lib/ai/agents/education";
import { objectivesFor } from "@/lib/ai/education/curriculum";
import { profileOrDefault } from "@/lib/ai/education/profile";

const MODES = ["explain", "quiz", "read", "homework", "exam_prep", "parent", "teacher"] as const;

const Body = z.object({
  question: z.string().min(2).max(4000),
  mode: z.enum(MODES).optional(),
  province: z.string().max(120).optional(),
  territory: z.string().max(120).optional(),
});

/**
 * One teach → check → adapt lesson (FR-ED-02, FR-ED-03), outside the voice pipeline.
 * Homework stays hint-first (EDU-004) and a disclosure raises the safeguarding flag (EDU-005).
 */
export const POST = handle({ permission: "interaction:create", limit: "ai" }, async ({ user, json }) => {
  const body = await json(Body);
  const profile = await profileOrDefault(user.userId);
  const assessment = await assessEducation(body.question, {
    userId: user.userId,
    province: body.province ?? user.province ?? null,
    territory: body.territory ?? null,
    language: profile.explainLanguage,
    mode: (body.mode as EducationMode | undefined) ?? null,
  });
  return {
    lesson: assessment,
    profile: { level: profile.level, ageBand: profile.ageBand, confirmed: profile.confirmed },
    curriculum: objectivesFor(profile.level).slice(0, 8),
  };
});
