/**
 * Learner profile (FR-ED-01).
 *
 * The age band, school level, languages and exam target are CONFIRMED by the learner or the
 * accompanying adult — they are never inferred from a voice sample. Until a profile row
 * exists, the agent teaches at a safe default and asks the confirmation questions; nothing
 * is written from a guess.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode } from "@server/db/schema";
import { levelFromAgeBand, LEVEL_LABELS, ageBandFromLevel, type AgeBand, type SchoolLevel } from "./curriculum";

export type ExamTarget = "tenafep" | "examen_etat" | "none";

export type LearnerProfileRow = typeof schema.learnerProfiles.$inferSelect;

export interface LearnerProfile {
  userId: string;
  ageBand: AgeBand;
  level: SchoolLevel;
  instructionLanguage: LanguageCode;
  explainLanguage: LanguageCode;
  schoolOrganisationId: string | null;
  examTarget: ExamTarget;
  examDate: string | null;
  confirmed: boolean;
  updatedAt: string | null;
}

export const DEFAULT_PROFILE: Omit<LearnerProfile, "userId"> = {
  ageBand: "9-11",
  level: "primaire_4",
  instructionLanguage: "fr",
  explainLanguage: "fr",
  schoolOrganisationId: null,
  examTarget: "none",
  examDate: null,
  confirmed: false,
  updatedAt: null,
};

/** Questions asked when the profile has not been confirmed. Never inferred from the voice. */
export const CONFIRMATION_QUESTIONS = [
  "Pour bien adapter les explications : en quelle classe es-tu (par exemple 4e primaire ou 2e secondaire) ?",
  "Quel âge as-tu ?",
  "Dans quelle langue préfères-tu que je t'explique : français, lingala, kikongo, swahili ou tshiluba ?",
];

const AGE_BANDS: AgeBand[] = ["6-8", "9-11", "12-14", "15-18", "adult"];

function toAgeBand(v: string | null): AgeBand | null {
  return v && (AGE_BANDS as string[]).includes(v) ? (v as AgeBand) : null;
}

function toLevel(v: string | null): SchoolLevel | null {
  return v && v in LEVEL_LABELS ? (v as SchoolLevel) : null;
}

function toExam(v: string | null): ExamTarget {
  return v === "tenafep" || v === "examen_etat" ? v : "none";
}

export function toProfile(row: LearnerProfileRow): LearnerProfile {
  const level = toLevel(row.level);
  const ageBand = toAgeBand(row.ageBand) ?? (level ? ageBandFromLevel(level) : DEFAULT_PROFILE.ageBand);
  return {
    userId: row.userId,
    ageBand,
    level: level ?? levelFromAgeBand(ageBand),
    instructionLanguage: row.instructionLanguage,
    explainLanguage: row.explainLanguage,
    schoolOrganisationId: row.schoolOrganisationId,
    examTarget: toExam(row.examTarget),
    examDate: row.examDate ? new Date(row.examDate).toISOString() : null,
    confirmed: true,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function getLearnerProfile(userId: string | null | undefined): Promise<LearnerProfile | null> {
  if (!userId) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.learnerProfiles).where(eq(schema.learnerProfiles.userId, userId));
  return row ? toProfile(row) : null;
}

/** The profile used for teaching: the confirmed one, or a safe default marked unconfirmed. */
export async function profileOrDefault(userId: string | null | undefined): Promise<LearnerProfile> {
  const p = await getLearnerProfile(userId);
  return p ?? { userId: userId ?? "", ...DEFAULT_PROFILE };
}

export interface ProfilePatch {
  ageBand?: AgeBand;
  level?: SchoolLevel;
  instructionLanguage?: LanguageCode;
  explainLanguage?: LanguageCode;
  schoolOrganisationId?: string | null;
  examTarget?: ExamTarget;
  examDate?: string | null;
}

/**
 * Writes a CONFIRMED profile. Called only from the explicit profile endpoint — an agent
 * never calls this from what it believes it heard.
 */
export async function confirmLearnerProfile(userId: string, patch: ProfilePatch): Promise<LearnerProfile> {
  const db = await getDb();
  const existing = await getLearnerProfile(userId);
  const level = patch.level ?? existing?.level ?? (patch.ageBand ? levelFromAgeBand(patch.ageBand) : DEFAULT_PROFILE.level);
  const ageBand = patch.ageBand ?? existing?.ageBand ?? ageBandFromLevel(level);
  const values = {
    userId,
    ageBand,
    level,
    instructionLanguage: patch.instructionLanguage ?? existing?.instructionLanguage ?? "fr",
    explainLanguage: patch.explainLanguage ?? existing?.explainLanguage ?? patch.instructionLanguage ?? "fr",
    schoolOrganisationId: patch.schoolOrganisationId !== undefined ? patch.schoolOrganisationId : (existing?.schoolOrganisationId ?? null),
    examTarget: patch.examTarget ?? existing?.examTarget ?? "none",
    examDate: patch.examDate !== undefined ? (patch.examDate ? new Date(patch.examDate) : null) : existing?.examDate ? new Date(existing.examDate) : null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(schema.learnerProfiles)
    .values(values)
    .onConflictDoUpdate({ target: schema.learnerProfiles.userId, set: { ...values } })
    .returning();
  return toProfile(row);
}

/** Weeks between now and the exam date; null when no date is set. */
export function weeksToExam(profile: Pick<LearnerProfile, "examDate">, now: Date = new Date()): number | null {
  if (!profile.examDate) return null;
  const diff = new Date(profile.examDate).getTime() - now.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.ceil(diff / (7 * 24 * 3600 * 1000)));
}

export function describeProfile(p: LearnerProfile): string {
  return `${LEVEL_LABELS[p.level]}, tranche d'âge ${p.ageBand}${p.examTarget !== "none" ? `, prépare ${p.examTarget === "tenafep" ? "le TENAFEP" : "l'Examen d'État"}` : ""}${p.confirmed ? "" : " (profil non confirmé)"}`;
}
