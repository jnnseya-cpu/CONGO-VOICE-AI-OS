import { NextResponse, type NextRequest } from "next/server";
import { sessionFromRequest } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { runScheduler } from "@server/core/scheduler";
import { audit } from "@server/core/audit";
import { clientIp } from "@server/core/api";
import { authoriseScheduler } from "@server/core/service-identity";

/**
 * Scheduled maintenance entry point (Cloud Scheduler / cron / `npm run workflow:run`).
 *
 * Fires due reminders, sends notifications deferred by quiet hours, sweeps SLA breaches and
 * blocked cases, produces scheduled reports, verifies yesterday's audit chain, checks ACU
 * caps and flags overdue data requests.
 *
 * Authorised by the scheduler's own identity token, by the CRON_SECRET header,
 * or by a platform-admin session. The identity token is the case that matters:
 * Cloud Scheduler sends one and nothing else, so a route that understood only
 * the other two answered 401 every five minutes while reminders, SLA sweeps,
 * retention deletions and audit verification quietly never happened.
 */
export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  const byPerson = Boolean(session && hasPermission(session.role, "admin:config"));
  const byMachine = byPerson
    ? ({ ok: true, via: "secret" } as const)
    : await authoriseScheduler({
        authorization: req.headers.get("authorization"),
        cronSecretHeader: req.headers.get("x-cron-secret"),
      });

  if (!byPerson && !byMachine.ok) {
    // Say why in the logs. A refused scheduler is indistinguishable from a
    // scheduler with nothing to do unless the refusal is written down.
    console.error(`[scheduler] refused: ${byMachine.reason}`);
    return NextResponse.json({ error: { code: "unauthorized", message: "Non autorisé" } }, { status: 401 });
  }

  const report = await runScheduler();
  await audit({
    action: "scheduler.run",
    actorUserId: session?.userId ?? null,
    actorRole: session?.role ?? "system",
    entityType: "scheduler",
    entityId: report.startedAt.slice(0, 10),
    after: {
      reminders: report.reminders,
      slaBreaches: report.slaBreaches,
      blockedCases: report.blockedCases,
      reportsGenerated: report.reportsGenerated,
      auditChainOk: report.auditChain?.ok ?? null,
      errors: report.errors.length,
    },
    systemEvent: "cron",
    ip: clientIp(req),
  });
  return NextResponse.json({
    ...report,
    // Backwards compatible with the previous contract.
    remindersSent: report.blockedCases,
  });
}
