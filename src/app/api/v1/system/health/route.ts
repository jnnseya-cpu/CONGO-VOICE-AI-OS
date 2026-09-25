import { NextResponse } from "next/server";
import { getDb } from "@server/db/client";
import { readiness } from "@server/core/status";
import { clinicalReadiness } from "@server/ai/review/gate";
import { SCHEDULER_STALE_AFTER_MS, schedulerHealth } from "@server/core/scheduler";
import { sql } from "drizzle-orm";

/** When this process came up, so a fresh deployment is not reported as stale. */
const STARTED_AT = Date.now();

/** Liveness/readiness probe. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    // Reachable is not the same as able to do the job: an escalation that
    // reaches nobody looks identical to a healthy service from outside.
    const ready = readiness();
    // Whether anyone clinically accountable has signed the content is part of
    // being able to do the job, not a separate concern (AI-10).
    // A scheduler that stopped arriving takes reminders, SLA sweeps, retention
    // deletions and audit verification with it, and nothing else notices.
    const cron = await schedulerHealth(STARTED_AT).catch(() => null);
    const schedulerCheck = cron
      ? [{
          id: "scheduler_running",
          ok: cron.ok,
          detail: cron.lastRunAt
            ? `Dernière exécution il y a ${Math.round((cron.staleMs ?? 0) / 60000)} min (seuil ${SCHEDULER_STALE_AFTER_MS / 60000} min).`
            : "Aucune exécution enregistrée depuis le démarrage.",
        }]
      : [];

    const checks = [...ready.checks, ...schedulerCheck, ...(await clinicalReadiness().catch(() => []))];
    const failing = checks.filter((c) => !c.ok);
    if (failing.length > 0) {
      return NextResponse.json({ status: "degraded", time: new Date().toISOString(), failing }, { status: 503 });
    }
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (err) {
    // The message can carry a connection string, so it stays in the logs.
    console.error("[health]", err);
    const detail = process.env.NODE_ENV === "production" ? "database_unreachable" : err instanceof Error ? err.message : "db";
    return NextResponse.json({ status: "degraded", error: detail }, { status: 503 });
  }
}
