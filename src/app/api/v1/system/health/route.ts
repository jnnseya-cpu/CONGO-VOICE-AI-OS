import { NextResponse } from "next/server";
import { getDb } from "@server/db/client";
import { readiness } from "@server/core/status";
import { clinicalReadiness } from "@server/ai/review/gate";
import { sql } from "drizzle-orm";

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
    const checks = [...ready.checks, ...(await clinicalReadiness().catch(() => []))];
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
