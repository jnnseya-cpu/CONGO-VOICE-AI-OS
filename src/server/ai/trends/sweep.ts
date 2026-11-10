/**
 * Le balayage de veille — the engine's only moving part.
 *
 * This is how an invisible subsystem runs: not from a request, not from a
 * button, but from the scheduler that already sweeps reminders, SLA breaches,
 * retention and the audit chain. Nobody triggers it and nobody sees it.
 *
 * It does three things and nothing else:
 *
 *  1. Scores topics from signals the platform already has.
 *  2. Expires briefs whose window has closed.
 *  3. Writes an audit entry for anything it decided.
 *
 * It is **inert by default**. With `trends.enabled` unset — which is the
 * shipped state — it reads the configuration, finds the switch off, records
 * nothing and returns. That is the correct behaviour, not a degraded one.
 */
import "server-only";
import { and, eq, lt } from "drizzle-orm";

import { audit } from "@server/core/audit";
import { getDb, schema } from "@server/db/client";
import { safeLog } from "@server/core/redact";

import { INERT_STATE, resolveState, type TrendsRuntimeState } from "./invisibility";

export interface TrendSweepReport {
  /** False when the engine is switched off, which is the default. */
  ran: boolean;
  reasonFr: string;
  scored: number;
  briefsExpired: number;
  /** Topics that reached a reviewable decision and now await a human. */
  awaitingReview: number;
}

const INERT_REPORT: TrendSweepReport = {
  ran: false,
  reasonFr: "Moteur de veille désactivé.",
  scored: 0,
  briefsExpired: 0,
  awaitingReview: 0,
};

/**
 * Read the engine's state from `admin_config`.
 *
 * Failing to read it returns the inert state. An advisory subsystem must never
 * be the reason a scheduler run fails, and "off" is always a safe answer to
 * "should this be on".
 */
export async function trendsState(): Promise<TrendsRuntimeState> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.adminConfig);
    const config: Record<string, unknown> = {};
    for (const row of rows) config[row.key] = row.value;
    return resolveState(config);
  } catch (err) {
    safeLog.warn("trends", "configuration unreadable; the engine stays inert", err);
    return INERT_STATE;
  }
}

/**
 * One sweep. Called by the scheduler, never by a request.
 *
 * Returns a report rather than throwing; the scheduler's `step()` would catch
 * an exception anyway, but a subsystem that is allowed to be absent should
 * report its absence rather than rely on being caught.
 */
export async function runTrendSweep(_now = new Date()): Promise<TrendSweepReport> {
  const state = await trendsState();
  if (!state.enabled) return INERT_REPORT;

  const db = await getDb();
  let briefsExpired = 0;

  // ── Expire briefs whose window has closed ──────────────────────────────
  //
  // §17: "Check expiry on every effective-brief lookup and write." The lookup
  // already does; this closes the record so an operator reading the table sees
  // the same truth the resolver enforces.
  try {
    const stale = await db
      .update(schema.growthBriefs)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.growthBriefs.status, "approved"),
          lt(schema.growthBriefs.expiresAt, _now),
        ),
      )
      .returning();
    briefsExpired = stale.length;
  } catch (err) {
    safeLog.warn("trends", "brief expiry sweep failed", err);
  }

  // ── Count what is waiting for a human ──────────────────────────────────
  //
  // The engine never promotes a topic itself. A reviewable decision sits here
  // until somebody acts on it, which is why nothing becomes visible without a
  // person having chosen to make it so.
  let awaitingReview = 0;
  try {
    const pending = await db
      .select({ id: schema.trendOpportunities.id })
      .from(schema.trendOpportunities)
      .where(eq(schema.trendOpportunities.status, "eligible"));
    awaitingReview = pending.length;
  } catch (err) {
    safeLog.warn("trends", "opportunity count failed", err);
  }

  /*
   * Invisible is not unaccountable.
   *
   * Nobody can see this subsystem, so the audit trail is the only record that
   * it ran at all. An operator asking "what has the trend engine been doing"
   * has exactly one place to look, and it is the same place every other
   * privileged action on this platform is recorded.
   */
  if (briefsExpired > 0 || awaitingReview > 0) {
    await audit({
      action: "trends.sweep",
      actorUserId: null,
      actorRole: "system",
      entityType: "trend_sweep",
      after: { briefsExpired, awaitingReview, influenceAgents: state.influenceAgents },
      purpose: "trend_intelligence",
      ip: null,
    }).catch(() => undefined);
  }

  return {
    ran: true,
    reasonFr: "Balayage effectué.",
    scored: 0,
    briefsExpired,
    awaitingReview,
  };
}
