import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import { audit } from "@/lib/core/audit";
import { exportCsv } from "@/lib/ai/agents/reporting";

const TYPES = ["interactions", "cases", "health", "agriculture", "education", "audit", "usage"] as const;

/** CSV export (opens in Excel). `?days=30` */
export const GET = handle<{ type: string }>({ permission: "report:export" }, async ({ req, user, params, ip }) => {
  const type = params.type as (typeof TYPES)[number];
  if (!TYPES.includes(type)) throw badRequest("Type de rapport inconnu");
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const csv = await exportCsv(type, days);
  await audit({ action: "report.exported", actorUserId: user.userId, actorRole: user.role, after: { type, days }, ip });
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="congo-voice-ai-os-${type}-${days}j.csv"` },
  });
});
