import { z } from "zod";
import { handle } from "@server/core/api";
import { assignCase, autoAssignCase, routeCase } from "@server/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

/** Who the routing rules would pick for this case, and why. */
export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, user, params }) => {
  const c = await loadCaseScoped(db, params.id, user.role);
  const candidate = await routeCase(c);
  return { case: { id: c.id, queue: c.queue, assignedTo: c.assignedTo, version: c.version }, suggestion: candidate };
});

const Body = z.object({
  assigneeId: z.string().uuid().optional(),
  auto: z.boolean().default(false),
  reason: z.string().max(1000).optional(),
  expectedVersion: z.number().int().optional(),
});

/**
 * Assign or reassign. Atomic (CAS-002): the write is a compare-and-swap on the case
 * version, so a second supervisor clicking at the same instant receives a 409.
 */
export const POST = handle<{ id: string }>({ permission: "case:assign" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const c = await loadCaseScoped(db, params.id, user.role);
  const actor = { userId: user.userId, role: user.role };
  if (body.auto || !body.assigneeId) {
    const after = await autoAssignCase(c.id, actor);
    return after ? { case: after, routed: true } : { case: c, routed: false, message: "Aucun agent disponible pour ce périmètre." };
  }
  const after = await assignCase(c.id, body.assigneeId, actor, { reason: body.reason, expectedVersion: body.expectedVersion, matchedOn: "manual" });
  return { case: after, routed: false };
});
