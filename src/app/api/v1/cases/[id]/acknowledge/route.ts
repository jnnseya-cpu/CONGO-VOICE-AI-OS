import { z } from "zod";
import { handle } from "@/lib/core/api";
import { acknowledgeCase } from "@/lib/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

const Body = z.object({ note: z.string().max(2000).optional() });

/**
 * Explicit acknowledgement: the human act that stops the response clock (FR-CS-03).
 * A message that was merely delivered is never an acknowledgement.
 */
export const POST = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Body).catch(() => ({ note: undefined }) as { note?: string });
  const c = await loadCaseScoped(db, params.id, user.role);
  const after = await acknowledgeCase(c.id, { userId: user.userId, role: user.role }, body.note);
  return { case: after };
});
