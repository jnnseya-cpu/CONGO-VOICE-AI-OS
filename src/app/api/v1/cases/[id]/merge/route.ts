import { z } from "zod";
import { handle } from "@/lib/core/api";
import { mergeCases } from "@/lib/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

const Body = z.object({
  /** The case that survives and keeps the history. */
  targetCaseId: z.string().uuid(),
  reason: z.string().min(10, "Motif d'au moins 10 caractères obligatoire.").max(2000),
});

/**
 * Mark this case as a duplicate of another (FR-CS-07). Nothing is deleted: identifiers,
 * open tasks and scheduled follow-ups move to the survivor, and the duplicate keeps a
 * pointer to it.
 */
export const POST = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const source = await loadCaseScoped(db, params.id, user.role);
  await loadCaseScoped(db, body.targetCaseId, user.role);
  const result = await mergeCases(source.id, body.targetCaseId, { userId: user.userId, role: user.role }, body.reason);
  return result;
});
