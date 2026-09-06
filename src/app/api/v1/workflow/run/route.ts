import { NextResponse, type NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/core/auth";
import { hasPermission } from "@/lib/core/rbac";
import { runScheduler } from "@/lib/core/scheduler";
import { audit } from "@/lib/core/audit";
import { clientIp } from "@/lib/core/api";

/**
 * Scheduled maintenance entry point (Cloud Scheduler / cron / `npm run workflow:run`).
 *
 * Fires due reminders, sends notifications deferred by quiet hours, sweeps SLA breaches and
 * blocked cases, produces scheduled reports, verifies yesterday's audit chain, checks ACU
 * caps and flags overdue data requests.
 *
 * Authorised by the CRON_SECRET header or by a platform-admin session.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const session = sessionFromRequest(req);
  const authorised = (secret && req.headers.get("x-cron-secret") === secret) || (session && hasPermission(session.role, "admin:config"));
  if (!authorised) return NextResponse.json({ error: { code: "unauthorized", message: "Non autorisé" } }, { status: 401 });

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
