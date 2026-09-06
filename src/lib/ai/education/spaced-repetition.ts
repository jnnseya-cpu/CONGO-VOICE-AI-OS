/**
 * Spaced repetition (FR-ED-07).
 *
 * A deterministic SM-2 variant, tuned for oral revision with a low-end phone: short first
 * intervals, an ease factor that moves slowly, and a hard reset on a failed recall. The
 * schedule is written to the `schedules` table so the reminder pipeline sends the nudge.
 */
import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { LanguageCode } from "@/lib/db/schema";

export const DAY_MS = 24 * 3600 * 1000;

/** Fixed early intervals (days); afterwards the ease factor takes over. */
export const BASE_INTERVALS = [1, 3, 7] as const;
export const MIN_EASE = 1.3;
export const MAX_EASE = 2.6;
export const DEFAULT_EASE = 2.5;

export interface ReviewState {
  /** Number of consecutive successful recalls. */
  repetition: number;
  easeFactor: number;
  intervalDays: number;
}

export interface ReviewOutcome extends ReviewState {
  dueAt: Date;
  /** True when the item was reset because recall failed. */
  reset: boolean;
}

/** Quality of recall, 0 (no idea) to 5 (immediate and confident). */
export type RecallQuality = 0 | 1 | 2 | 3 | 4 | 5;

/** Maps a quiz score (0..1) and whether help was needed to an SM-2 quality. */
export function qualityFromScore(score: number, assisted = false): RecallQuality {
  const s = Math.max(0, Math.min(1, score));
  const base = s >= 0.95 ? 5 : s >= 0.8 ? 4 : s >= 0.6 ? 3 : s >= 0.35 ? 2 : s > 0 ? 1 : 0;
  const adjusted = assisted ? Math.max(0, base - 1) : base;
  return adjusted as RecallQuality;
}

/**
 * Next review. Failed recall (quality < 3) sends the item back to a one-day interval and
 * clears the repetition count; success walks the fixed ladder then multiplies by the ease.
 */
export function nextReview(state: Partial<ReviewState>, quality: RecallQuality, now: Date = new Date()): ReviewOutcome {
  const repetition = Math.max(0, Math.floor(state.repetition ?? 0));
  const prevInterval = Math.max(0, state.intervalDays ?? 0);
  let ease = state.easeFactor ?? DEFAULT_EASE;

  // SM-2 ease update, clamped.
  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ease = Math.min(MAX_EASE, Math.max(MIN_EASE, Number(ease.toFixed(3))));

  if (quality < 3) {
    return { repetition: 0, easeFactor: ease, intervalDays: 1, dueAt: new Date(now.getTime() + DAY_MS), reset: true };
  }

  const nextRep = repetition + 1;
  const intervalDays =
    nextRep <= BASE_INTERVALS.length ? BASE_INTERVALS[nextRep - 1] : Math.max(BASE_INTERVALS[BASE_INTERVALS.length - 1] + 1, Math.round((prevInterval || BASE_INTERVALS[BASE_INTERVALS.length - 1]) * ease));

  return { repetition: nextRep, easeFactor: ease, intervalDays, dueAt: new Date(now.getTime() + intervalDays * DAY_MS), reset: false };
}

/** The whole ladder for one topic, useful for planning and for tests. */
export function reviewLadder(steps = 5, ease = DEFAULT_EASE): number[] {
  const out: number[] = [];
  let state: ReviewState = { repetition: 0, easeFactor: ease, intervalDays: 0 };
  for (let i = 0; i < steps; i++) {
    const r = nextReview(state, 5);
    out.push(r.intervalDays);
    state = { repetition: r.repetition, easeFactor: r.easeFactor, intervalDays: r.intervalDays };
  }
  return out;
}

/* ------------------------------------------------------------------------------------------
 * Persistence: revision nudges live in the shared `schedules` table
 * ---------------------------------------------------------------------------------------- */

export interface RevisionSchedulePayload extends Record<string, unknown> {
  subject: string;
  topic: string;
  objectiveCode: string | null;
  repetition: number;
  easeFactor: number;
  intervalDays: number;
  message: string;
}

export interface ScheduleRevisionInput {
  userId: string;
  subject: string;
  topic: string;
  objectiveCode?: string | null;
  quality: RecallQuality;
  state?: Partial<ReviewState>;
  language?: LanguageCode;
  channel?: "in_app" | "sms" | "whatsapp" | "email";
  now?: Date;
}

/** Writes (or refreshes) the next revision nudge for one topic. */
export async function scheduleRevision(input: ScheduleRevisionInput) {
  const db = await getDb();
  const now = input.now ?? new Date();
  const previous = await lastRevisionState(input.userId, input.topic);
  const outcome = nextReview({ ...previous, ...input.state }, input.quality, now);
  const message = outcome.reset
    ? `Reprends « ${input.topic} » demain : une courte révision de 10 minutes suffit pour ancrer la notion.`
    : `Petite révision de « ${input.topic} » : ${outcome.intervalDays} jour(s) après ta dernière séance, c'est le bon moment pour t'en souvenir longtemps.`;

  // Cancel any pending nudge for the same topic so the learner is never reminded twice.
  const pending = await db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.userId, input.userId), eq(schema.schedules.kind, "revision"), eq(schema.schedules.status, "scheduled")));
  for (const p of pending) {
    const payload = p.payload as Partial<RevisionSchedulePayload>;
    if (payload?.topic === input.topic) {
      await db.update(schema.schedules).set({ status: "cancelled" }).where(eq(schema.schedules.id, p.id));
    }
  }

  const payload: RevisionSchedulePayload = {
    subject: input.subject,
    topic: input.topic,
    objectiveCode: input.objectiveCode ?? null,
    repetition: outcome.repetition,
    easeFactor: outcome.easeFactor,
    intervalDays: outcome.intervalDays,
    message,
  };
  const [row] = await db
    .insert(schema.schedules)
    .values({
      userId: input.userId,
      kind: "revision",
      channel: input.channel ?? "in_app",
      language: input.language ?? "fr",
      scheduledFor: outcome.dueAt,
      payload,
      status: "scheduled",
    })
    .returning();
  return { schedule: row, outcome };
}

/** Last recorded state for a topic, read back from the scheduled nudges. */
export async function lastRevisionState(userId: string, topic: string): Promise<Partial<ReviewState>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.userId, userId), eq(schema.schedules.kind, "revision")))
    .orderBy(asc(schema.schedules.createdAt));
  const mine = rows.filter((r) => (r.payload as Partial<RevisionSchedulePayload>)?.topic === topic);
  const last = mine[mine.length - 1];
  if (!last) return {};
  const p = last.payload as Partial<RevisionSchedulePayload>;
  return { repetition: Number(p.repetition ?? 0), easeFactor: Number(p.easeFactor ?? DEFAULT_EASE), intervalDays: Number(p.intervalDays ?? 0) };
}

/** Nudges that are due (or overdue) for a learner. */
export async function dueRevisions(userId: string, now: Date = new Date()) {
  const db = await getDb();
  return db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.userId, userId), eq(schema.schedules.kind, "revision"), eq(schema.schedules.status, "scheduled"), lte(schema.schedules.scheduledFor, now)))
    .orderBy(asc(schema.schedules.scheduledFor));
}

/** Everything planned ahead, for the learner's plan view. */
export async function plannedRevisions(userId: string, from: Date = new Date()) {
  const db = await getDb();
  return db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.userId, userId), eq(schema.schedules.kind, "revision"), eq(schema.schedules.status, "scheduled"), gte(schema.schedules.scheduledFor, from)))
    .orderBy(asc(schema.schedules.scheduledFor));
}
