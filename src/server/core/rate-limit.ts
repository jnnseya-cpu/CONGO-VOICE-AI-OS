/**
 * Rate limiting in two layers.
 *
 * The in-process sliding window is the cheap first line: it rejects a flood
 * hitting one instance without touching the database. On its own it was
 * misleading behind an autoscaler, where the real ceiling was the configured
 * limit multiplied by however many instances happened to be running, and where
 * a cold start handed an attacker a fresh allowance.
 *
 * The shared fixed window in PostgreSQL is the authority. One upsert per
 * request, counted per bucket, identical for every instance.
 */
import { sql } from "drizzle-orm";
import { schema, type Database } from "@server/db/client";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, max: number, windowSeconds: number, now = Date.now()): RateLimitResult {
  const windowMs = windowSeconds * 1000;
  const since = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > since);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return { allowed: false, remaining: 0, resetAt: hits[0] + windowMs };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) {
    // crude memory guard
    for (const [k, v] of buckets) if (v.every((t) => t <= since)) buckets.delete(k);
  }
  return { allowed: true, remaining: max - hits.length, resetAt: now + windowMs };
}

export function resetRateLimits() {
  buckets.clear();
}

/**
 * Counts this request against a window every instance shares. Returns the same
 * verdict whichever server answered. A database failure is not allowed to take
 * the platform down, so it falls back to the local verdict and says so.
 */
export async function checkSharedRateLimit(
  db: Database,
  key: string,
  max: number,
  windowSeconds: number,
  now = Date.now(),
): Promise<RateLimitResult & { shared: boolean }> {
  const local = checkRateLimit(key, max, windowSeconds, now);
  if (!local.allowed) return { ...local, shared: false };

  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const [row] = await db
      .insert(schema.rateLimitCounters)
      .values({ bucket: key.slice(0, 200), windowStart, hits: 1 })
      .onConflictDoUpdate({
        target: schema.rateLimitCounters.bucket,
        set: {
          hits: sql`case when ${schema.rateLimitCounters.windowStart} < ${windowStart} then 1 else ${schema.rateLimitCounters.hits} + 1 end`,
          windowStart: sql`case when ${schema.rateLimitCounters.windowStart} < ${windowStart} then ${windowStart} else ${schema.rateLimitCounters.windowStart} end`,
        },
      })
      .returning();
    const hits = row?.hits ?? 1;
    return { allowed: hits <= max, remaining: Math.max(0, max - hits), resetAt: windowStart.getTime() + windowMs, shared: true };
  } catch {
    return { ...local, shared: false };
  }
}

/** Drops counters whose window closed long ago. Called by the scheduler. */
export async function pruneRateLimitCounters(db: Database, olderThanMs = 3_600_000, now = Date.now()): Promise<number> {
  const cutoff = new Date(now - olderThanMs);
  const rows = await db
    .delete(schema.rateLimitCounters)
    .where(sql`${schema.rateLimitCounters.windowStart} < ${cutoff}`)
    .returning();
  return rows.length;
}
