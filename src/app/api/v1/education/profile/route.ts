import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { confirmLearnerProfile, CONFIRMATION_QUESTIONS, describeProfile, getLearnerProfile } from "@/lib/ai/education/profile";
import { LEVELS, LEVEL_LABELS, objectivesFor } from "@/lib/ai/education/curriculum";

const AGE_BANDS = ["6-8", "9-11", "12-14", "15-18", "adult"] as const;
const LEVEL_VALUES = LEVELS as unknown as [string, ...string[]];

/** The learner profile (FR-ED-01). Read your own profile and the confirmation questions. */
export const GET = handle({ auth: true }, async ({ user }) => {
  const profile = await getLearnerProfile(user.userId);
  return {
    profile,
    confirmed: !!profile,
    confirmationQuestions: profile ? [] : CONFIRMATION_QUESTIONS,
    description: profile ? describeProfile(profile) : null,
    levels: LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] })),
    ageBands: AGE_BANDS,
    objectives: profile ? objectivesFor(profile.level) : [],
    notice: "Ces informations sont confirmées par l'apprenant ou l'adulte qui l'accompagne ; elles ne sont jamais déduites de la voix.",
  };
});

const Body = z.object({
  ageBand: z.enum(AGE_BANDS).optional(),
  level: z.enum(LEVEL_VALUES).optional(),
  instructionLanguage: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  explainLanguage: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  schoolOrganisationId: z.string().uuid().nullable().optional(),
  examTarget: z.enum(["tenafep", "examen_etat", "none"]).optional(),
  examDate: z.string().datetime().nullable().optional(),
});

/** Explicit confirmation of the profile — the only place a learner profile is written. */
export const PUT = handle({ auth: true }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const before = await getLearnerProfile(user.userId);
  const profile = await confirmLearnerProfile(user.userId, {
    ageBand: body.ageBand,
    level: body.level as (typeof LEVELS)[number] | undefined,
    instructionLanguage: body.instructionLanguage,
    explainLanguage: body.explainLanguage,
    schoolOrganisationId: body.schoolOrganisationId,
    examTarget: body.examTarget,
    examDate: body.examDate,
  });
  await audit({ action: "education.profile_confirmed", actorUserId: user.userId, actorRole: user.role, entityType: "learner_profile", entityId: user.userId, before, after: profile, ip });
  return { profile, description: describeProfile(profile) };
});
