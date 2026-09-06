import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { forbidden, notFound } from "@server/core/errors";
import { moduleScopeFor } from "@server/core/rbac";
import { schema } from "@server/db/client";
import { acknowledgeTask, completeTask } from "@server/ai/agents/workflow";

export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, params }) => {
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, params.id));
  if (!task) throw notFound();
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, task.caseId));
  return { task, case: c ?? null };
});

const Patch = z.object({
  action: z.enum(["acknowledge", "complete", "cancel"]),
  note: z.string().max(4000).optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

/** Acknowledge, complete or cancel a task. Completion carries the evidence of the act. */
export const PATCH = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Patch);
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, params.id));
  if (!task) throw notFound();
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, task.caseId));
  const scope = moduleScopeFor(user.role);
  if (c && scope && !scope.includes(c.module)) throw forbidden();
  const actor = { userId: user.userId, role: user.role };
  if (body.action === "acknowledge") return { task: await acknowledgeTask(task.id, actor) };
  return { task: await completeTask(task.id, actor, { ...(body.evidence ?? {}), note: body.note }, body.action === "cancel" ? "cancelled" : "done") };
});
