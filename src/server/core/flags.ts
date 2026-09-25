/**
 * Feature flags and staged rollout (DO-04, AI-17).
 *
 * Two things a national platform cannot do: turn a module on everywhere at
 * once, and change how it answers without watching what happens. A module, a
 * language or a channel opens one province at a time, because the people who
 * answer the escalations are in that province. A prompt or model change reaches
 * a small share of traffic first, because the failures that matter — a danger
 * sign missed, a language that quietly degraded — do not appear in an offline
 * evaluation.
 *
 * Assignment is deterministic on a stable identifier. The same citizen always
 * falls the same side of the line, so a rollout is not a coin flipped on every
 * turn, and a person who reports a problem is describing the same experience
 * when someone goes to look.
 */
import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";

export interface FlagContext {
  /** Whatever stays stable for one citizen: a user id, or a session id. */
  subject?: string | null;
  module?: string | null;
  language?: string | null;
  channel?: string | null;
  province?: string | null;
}

export interface FlagDecision {
  on: boolean;
  reason: "off" | "unknown_flag" | "out_of_scope" | "outside_rollout" | "on";
  rolloutPercent: number;
}

const CACHE_MS = 30_000;
let cache: { at: number; flags: Map<string, typeof schema.featureFlags.$inferSelect> } | null = null;

async function load(): Promise<Map<string, typeof schema.featureFlags.$inferSelect>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.flags;
  const db = await getDb();
  const rows = await db.select().from(schema.featureFlags);
  const flags = new Map(rows.map((r) => [r.key, r]));
  cache = { at: Date.now(), flags };
  return flags;
}

export function resetFlagCache() {
  cache = null;
}

/** 0–99, stable for a given flag and subject. */
export function bucketOf(key: string, subject: string): number {
  const digest = createHash("sha256").update(`${key}:${subject}`).digest();
  return digest.readUInt32BE(0) % 100;
}

function inScope(list: string[], value: string | null | undefined): boolean {
  if (list.length === 0) return true; // an empty scope means everywhere
  return !!value && list.includes(value);
}

export async function evaluateFlag(key: string, ctx: FlagContext = {}): Promise<FlagDecision> {
  const flags = await load().catch(() => new Map());
  const flag = flags.get(key);
  if (!flag) return { on: false, reason: "unknown_flag", rolloutPercent: 0 };
  if (!flag.enabled) return { on: false, reason: "off", rolloutPercent: flag.rolloutPercent };

  if (
    !inScope(flag.modules, ctx.module) ||
    !inScope(flag.languages, ctx.language) ||
    !inScope(flag.channels, ctx.channel) ||
    !inScope(flag.provinces, ctx.province)
  ) {
    return { on: false, reason: "out_of_scope", rolloutPercent: flag.rolloutPercent };
  }

  if (flag.rolloutPercent >= 100) return { on: true, reason: "on", rolloutPercent: 100 };
  if (flag.rolloutPercent <= 0) return { on: false, reason: "outside_rollout", rolloutPercent: 0 };

  // No subject means nothing stable to hash: a partial rollout must not become
  // a coin flip, so the answer is no rather than "sometimes".
  if (!ctx.subject) return { on: false, reason: "outside_rollout", rolloutPercent: flag.rolloutPercent };

  const on = bucketOf(key, ctx.subject) < flag.rolloutPercent;
  return { on, reason: on ? "on" : "outside_rollout", rolloutPercent: flag.rolloutPercent };
}

export async function isEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
  return (await evaluateFlag(key, ctx)).on;
}

export interface CanaryState {
  key: string;
  rolloutPercent: number;
  startedAt: string;
  days: number;
  /** Whole days the change has been live at this share. */
  elapsedDays: number;
  /** True once it has held its window and may be widened by a person. */
  readyToWiden: boolean;
}

/**
 * Canaries that have served their window.
 *
 * Deliberately not automatic. Widening a rollout means deciding that nothing
 * bad happened, and nothing in this repository can see the case reviews and
 * the override rate that decision rests on.
 */
export async function canariesDue(now = new Date()): Promise<CanaryState[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.featureFlags).where(eq(schema.featureFlags.enabled, true));
  return rows
    .filter((r) => r.canaryStartedAt && r.rolloutPercent < 100)
    .map((r) => {
      const elapsedDays = Math.floor((now.getTime() - r.canaryStartedAt!.getTime()) / 86_400_000);
      return {
        key: r.key,
        rolloutPercent: r.rolloutPercent,
        startedAt: r.canaryStartedAt!.toISOString(),
        days: r.canaryDays,
        elapsedDays,
        readyToWiden: elapsedDays >= r.canaryDays,
      };
    })
    .filter((c) => c.readyToWiden);
}

/** The share a change starts at, per AI-17. */
export const CANARY_START_PERCENT = 5;
export const CANARY_HOLD_DAYS = 7;
