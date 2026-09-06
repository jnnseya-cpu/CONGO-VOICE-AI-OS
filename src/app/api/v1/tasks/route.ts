import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@/lib/core/api";
import { forbidden, notFound } from "@/lib/core/errors";
import { moduleScopeFor } from "@/lib/core/rbac";
import { schema } from "@/lib/db/client";
import { TASK_TYPES, createTask } from "@/lib/ai/agents/workflow";

/** The worker's work list: `?mine=1`, `?queue=…`, `?caseId=…`, `?status=…`. */
export const GET = handle({ permission: "case:read" }, async ({ req, db, user }) => {
  const { limit, offset } = paging(req);
  const q = req.nextUrl.searchParams;
  const status = q.get("status");
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        q.get("mine") === "1" ? eq(schema.tasks.ownerUserId, user.userId) : undefined,
        q.get("queue") ? eq(schema.tasks.queue, q.get("queue") as string) : undefined,
        q.get("caseId") ? eq(schema.tasks.caseId, q.get("caseId") as string) : undefined,
        status ? eq(schema.tasks.status, status) : inArray(schema.tasks.status, ["open", "acknowledged"]),
      ),
    )
    .orderBy(desc(schema.tasks.priority), desc(schema.tasks.createdAt))
    .limit(limit)
    .offset(offset);
  return { tasks: rows, counts: { open: rows.filter((t) => t.status === "open").length, acknowledged: rows.filter((t) => t.status === "acknowledged").length } };
});

const Create = z.object({
  caseId: z.string().uuid(),
  type: z.enum(TASK_TYPES),
  ownerUserId: z.string().uuid().optional(),
  queue: z.string().max(160).optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handle({ permission: "case:write" }, async ({ db, user, json }) => {
  const body = await json(Create);
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, body.caseId));
  if (!c) throw notFound();
  const scope = moduleScopeFor(user.role);
  if (scope && !scope.includes(c.module)) throw forbidden();
  const task = await createTask(c.id, {
    type: body.type,
    ownerUserId: body.ownerUserId ?? null,
    queue: body.queue ?? c.queue,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    priority: body.priority,
    evidence: body.evidence,
  });
  return { task };
});
