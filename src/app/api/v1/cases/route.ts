import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@/lib/core/api";
import { moduleScopeFor } from "@/lib/core/rbac";
import { schema } from "@/lib/db/client";
import { openCase } from "@/lib/ai/agents/workflow";
import type { CaseStatus, ModuleType } from "@/lib/db/schema";

export const GET = handle({ permission: "case:read" }, async ({ req, db, user }) => {
  const { limit, offset } = paging(req);
  const q = req.nextUrl.searchParams;
  const status = q.get("status") as CaseStatus | null;
  const moduleFilter = q.get("module") as ModuleType | null;
  const scope = moduleScopeFor(user.role);
  const rows = await db
    .select()
    .from(schema.cases)
    .where(
      and(
        scope ? inArray(schema.cases.module, scope) : undefined,
        moduleFilter ? eq(schema.cases.module, moduleFilter) : undefined,
        status ? eq(schema.cases.status, status) : status === null && q.get("all") !== "1" ? inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]) : undefined,
        q.get("mine") === "1" ? eq(schema.cases.assignedTo, user.userId) : undefined,
      ),
    )
    .orderBy(desc(schema.cases.createdAt))
    .limit(limit)
    .offset(offset);
  return { cases: rows };
});

const Create = z.object({
  module: z.enum(["health", "agriculture", "education", "general"]),
  title: z.string().min(3).max(240),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  province: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  interactionId: z.string().uuid().optional(),
  escalate: z.boolean().default(false),
});

/** Manual case creation by officers (e.g. from a phone call or a field visit). */
export const POST = handle({ permission: "case:write" }, async ({ db, user, json }) => {
  const body = await json(Create);
  let interactionId = body.interactionId;
  if (!interactionId) {
    const [i] = await db.insert(schema.interactions).values({ userId: user.userId, userRole: user.role, module: body.module, channel: "text", originalInput: body.notes ?? body.title, status: "completed", summary: `Cas créé manuellement : ${body.title}` }).returning();
    interactionId = i.id;
  }
  const c = await openCase({ module: body.module, userId: user.userId, interactionId, title: body.title, severity: body.severity, province: body.province ?? user.province ?? null, notes: body.notes, escalate: body.escalate, escalationReason: body.escalate ? "Escalade manuelle par un agent" : null });
  return { case: c };
});
