import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, schemaReport } from "@server/db/client";
import { DEPLOYMENT_CHECKS, readiness } from "@server/core/status";

/**
 * Can this container serve a request at all?
 *
 * This is what a platform probe must ask, and it is a narrower question than
 * the one `/api/v1/system/health` answers. Health reports whether the
 * *programme* is ready to see citizens: whether an escalation would reach a
 * person, whether the review board has its quorum, whether anybody clinically
 * accountable has signed the content. Every one of those is resolved by
 * operating the platform — the board is appointed in the admin console — so a
 * probe that refuses to start on them cannot ever be satisfied. The board needs
 * the service; the service waited for the board.
 *
 * So this endpoint asks only what a deployment can be held to: the database
 * answers, and the secrets without which no request could be served correctly
 * are present. Anything else belongs to health, where it stays visible.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);

    const failing = readiness().checks.filter((c) => DEPLOYMENT_CHECKS.includes(c.id) && !c.ok);
    if (failing.length > 0) {
      return NextResponse.json({ status: "not_ready", failing }, { status: 503 });
    }
    /**
     * What the bootstrap had to settle on the way up.
     *
     * Additive convergence — a column or an enum value the deployed database was
     * missing — is not a reason to refuse traffic, but an operator should not
     * have to open a log viewer to find out it happened. Anything the bootstrap
     * could not settle safely is named here too; the service still serves,
     * because a database one constraint short is not a database that cannot
     * answer, and hiding it would be worse than reporting it.
     */
    const schema = schemaReport();
    const converged =
      schema.columnsAdded.length > 0 || schema.statementsSkipped > 0 || schema.drift.some((d) => d.kind !== "extra_column")
        ? {
            statementsSkipped: schema.statementsSkipped,
            columnsAdded: schema.columnsAdded,
            unsettled: schema.drift.filter((d) => d.kind !== "extra_column"),
          }
        : undefined;
    return NextResponse.json({ status: "ready", time: new Date().toISOString(), ...(converged ? { schema: converged } : {}) });
  } catch (err) {
    // The message can carry a connection string, so it stays in the logs.
    console.error("[ready]", err);
    return NextResponse.json({ status: "not_ready", error: "database_unreachable" }, { status: 503 });
  }
}
