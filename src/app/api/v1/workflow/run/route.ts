import { NextResponse, type NextRequest } from "next/server";
import { detectBlockedCases } from "@/lib/ai/agents/workflow";
import { sessionFromRequest } from "@/lib/core/auth";
import { hasPermission } from "@/lib/core/rbac";

/**
 * Scheduled maintenance entry point (Cloud Scheduler / cron): reminders for overdue cases.
 * Authorised by CRON_SECRET header or by a platform admin session.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const session = sessionFromRequest(req);
  const authorised = (secret && req.headers.get("x-cron-secret") === secret) || (session && hasPermission(session.role, "admin:config"));
  if (!authorised) return NextResponse.json({ error: { code: "unauthorized", message: "Non autorisé" } }, { status: 401 });
  const blocked = await detectBlockedCases();
  return NextResponse.json({ remindersSent: blocked.length, caseIds: blocked.map((c) => c.id) });
}
