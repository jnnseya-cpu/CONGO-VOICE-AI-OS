/**
 * Learning evidence (FR-ED-08).
 *
 * Every check produces an evidence event — what was attempted, at which difficulty, with how
 * much help, what the learner answered, the outcome and the misconception observed. Evidence
 * is an event about a moment, never a permanent label on a child: nothing here stores an
 * ability, a rank or a judgement, and a teacher can mark an item verified.
 */
import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

export type EvidenceResult = "mastered" | "struggling" | "repeat_request" | "partial";
export type AssistanceLevel = "aucune" | "indice" | "exemple_resolu" | "guidee";

export const EVIDENCE_DISCLAIMER =
  "Ces observations décrivent des moments d'apprentissage, pas le niveau d'un élève. Elles ne constituent jamais une étiquette permanente.";

export interface EvidenceInput {
  userId?: string | null;
  sessionId?: string | null;
  subject: string;
  topic: string;
  objective?: string | null;
  rubric?: string | null;
  difficulty?: string | null;
  assistanceLevel?: AssistanceLevel | null;
  response?: string | null;
  result: EvidenceResult;
  misconception?: string | null;
  modelVersion?: string | null;
  province?: string | null;
  territory?: string | null;
}

export async function recordEvidence(input: EvidenceInput) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.learningEvidence)
    .values({
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      subject: input.subject.slice(0, 80),
      topic: input.topic.slice(0, 160),
      objective: input.objective ?? null,
      rubric: input.rubric?.slice(0, 160) ?? null,
      difficulty: input.difficulty?.slice(0, 24) ?? null,
      assistanceLevel: input.assistanceLevel ?? null,
      response: input.response ?? null,
      result: input.result,
      misconception: input.misconception?.slice(0, 160) ?? null,
      modelVersion: input.modelVersion?.slice(0, 64) ?? null,
      province: input.province ?? null,
      territory: input.territory ?? null,
      teacherVerified: false,
    })
    .returning();
  return row;
}

export async function recordEvidenceBatch(inputs: EvidenceInput[]) {
  const out = [];
  for (const i of inputs) out.push(await recordEvidence(i));
  return out;
}

export interface LearnerHistoryQuery {
  userId: string;
  topic?: string | null;
  days?: number;
  limit?: number;
}

export async function learnerEvidence(q: LearnerHistoryQuery) {
  const db = await getDb();
  const conds = [eq(schema.learningEvidence.userId, q.userId)];
  if (q.topic) conds.push(eq(schema.learningEvidence.topic, q.topic));
  if (q.days) conds.push(gte(schema.learningEvidence.createdAt, new Date(Date.now() - q.days * 24 * 3600 * 1000)));
  return db
    .select()
    .from(schema.learningEvidence)
    .where(and(...conds))
    .orderBy(desc(schema.learningEvidence.createdAt))
    .limit(Math.min(200, Math.max(1, q.limit ?? 50)));
}

/** Aggregated view of one learner's recent evidence: never a level, only what happened. */
export function summariseEvidence(rows: Array<typeof schema.learningEvidence.$inferSelect>) {
  const byTopic = new Map<string, { topic: string; subject: string; attempts: number; mastered: number; struggling: number; partial: number; misconceptions: string[] }>();
  for (const r of rows) {
    const e = byTopic.get(r.topic) ?? { topic: r.topic, subject: r.subject, attempts: 0, mastered: 0, struggling: 0, partial: 0, misconceptions: [] };
    e.attempts++;
    if (r.result === "mastered") e.mastered++;
    else if (r.result === "partial") e.partial++;
    else if (r.result === "struggling") e.struggling++;
    if (r.misconception && !e.misconceptions.includes(r.misconception)) e.misconceptions.push(r.misconception);
    byTopic.set(r.topic, e);
  }
  const topics = Array.from(byTopic.values()).sort((a, b) => b.attempts - a.attempts);
  return {
    topics,
    strengths: topics.filter((t) => t.attempts >= 2 && t.mastered / t.attempts >= 0.7).map((t) => t.topic),
    toWorkOn: topics.filter((t) => t.attempts >= 2 && t.mastered / t.attempts < 0.5).map((t) => t.topic),
    disclaimer: EVIDENCE_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------------------------------
 * Teacher mode: class-level gaps only, never a per-child ranking
 * ---------------------------------------------------------------------------------------- */

export interface ClassGapQuery {
  province?: string | null;
  territory?: string | null;
  subject?: string | null;
  days?: number;
  /** Aggregates smaller than this are suppressed so a single child cannot be identified. */
  minGroupSize?: number;
}

export interface ClassGap {
  subject: string;
  topic: string;
  attempts: number;
  learners: number;
  masteredRate: number;
  commonMisconceptions: string[];
}

export const CLASS_MIN_GROUP = 3;

export async function classGaps(q: ClassGapQuery = {}): Promise<{ gaps: ClassGap[]; suppressed: number; minGroupSize: number; disclaimer: string }> {
  const db = await getDb();
  const minGroup = Math.max(1, q.minGroupSize ?? CLASS_MIN_GROUP);
  const conds = [gte(schema.learningEvidence.createdAt, new Date(Date.now() - (q.days ?? 30) * 24 * 3600 * 1000))];
  if (q.province) conds.push(eq(schema.learningEvidence.province, q.province));
  if (q.territory) conds.push(eq(schema.learningEvidence.territory, q.territory));
  if (q.subject) conds.push(eq(schema.learningEvidence.subject, q.subject));

  const rows = await db
    .select()
    .from(schema.learningEvidence)
    .where(and(...conds))
    .orderBy(desc(schema.learningEvidence.createdAt))
    .limit(2000);

  const map = new Map<string, { subject: string; topic: string; attempts: number; mastered: number; learners: Set<string>; misconceptions: Map<string, number> }>();
  for (const r of rows) {
    const key = `${r.subject}|${r.topic}`;
    const e = map.get(key) ?? { subject: r.subject, topic: r.topic, attempts: 0, mastered: 0, learners: new Set<string>(), misconceptions: new Map<string, number>() };
    e.attempts++;
    if (r.result === "mastered") e.mastered++;
    if (r.userId) e.learners.add(r.userId);
    if (r.misconception) e.misconceptions.set(r.misconception, (e.misconceptions.get(r.misconception) ?? 0) + 1);
    map.set(key, e);
  }

  const all = Array.from(map.values());
  const visible = all.filter((e) => e.learners.size >= minGroup);
  const gaps: ClassGap[] = visible
    .map((e) => ({
      subject: e.subject,
      topic: e.topic,
      attempts: e.attempts,
      learners: e.learners.size,
      masteredRate: Number((e.mastered / e.attempts).toFixed(2)),
      commonMisconceptions: Array.from(e.misconceptions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([m]) => m),
    }))
    .sort((a, b) => a.masteredRate - b.masteredRate);

  return {
    gaps,
    suppressed: all.length - visible.length,
    minGroupSize: minGroup,
    disclaimer: `${EVIDENCE_DISCLAIMER} Les groupes de moins de ${minGroup} apprenants ne sont pas affichés.`,
  };
}

/** A teacher confirms that an observation matches what they see in class. */
export async function verifyEvidence(evidenceId: string, teacherUserId: string) {
  const db = await getDb();
  const [row] = await db
    .update(schema.learningEvidence)
    .set({ teacherVerified: true })
    .where(eq(schema.learningEvidence.id, evidenceId))
    .returning();
  if (row) {
    await db
      .update(schema.learningEvidence)
      .set({ modelVersion: row.modelVersion ?? null })
      .where(eq(schema.learningEvidence.id, evidenceId));
  }
  void teacherUserId;
  return row ?? null;
}

/** Count of evidence rows, used by the dashboards. */
export async function evidenceCount(userId?: string | null) {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.learningEvidence)
    .where(userId ? eq(schema.learningEvidence.userId, userId) : undefined);
  return Number(n);
}
