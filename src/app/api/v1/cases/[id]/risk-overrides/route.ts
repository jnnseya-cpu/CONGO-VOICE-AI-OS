import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { schema } from "@server/db/client";
import { requireStepUp } from "@server/core/mfa";
import { OVERRIDE_MIN_REASON, overrideSeverity } from "@server/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, user, params }) => {
  const c = await loadCaseScoped(db, params.id, user.role);
  const overrides = await db.select().from(schema.aiOverrides).where(eq(schema.aiOverrides.caseId, c.id)).orderBy(desc(schema.aiOverrides.createdAt));
  return { aiSeverityLevel: c.aiSeverityLevel, severityLevel: c.severityLevel, overriddenSeverityLevel: c.overriddenSeverityLevel, overrides };
});

const Body = z.object({
  severityLevel: z.number().int().min(0).max(4),
  reason: z.string().min(OVERRIDE_MIN_REASON, `Motif d'au moins ${OVERRIDE_MIN_REASON} caractères obligatoire.`).max(2000),
  reasonCode: z.string().max(48).optional(),
});

/**
 * Overrule the model's severity. High-risk action: a recent second factor is required for
 * roles that must enrol, and the written reason is mandatory (FR-CS-05).
 */
export const POST = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  await requireStepUp(user);
  const c = await loadCaseScoped(db, params.id, user.role);
  const result = await overrideSeverity(c.id, { userId: user.userId, role: user.role }, body);
  return result;
});
