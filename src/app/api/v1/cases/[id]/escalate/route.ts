import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { forbidden, notFound } from "@server/core/errors";
import { moduleScopeFor } from "@server/core/rbac";
import { schema } from "@server/db/client";
import { escalateCase } from "@server/ai/agents/workflow";

const Body = z.object({ reason: z.string().max(1000).optional() });

export const POST = handle<{ id: string }>({ permission: "case:escalate" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, params.id));
  if (!c) throw notFound();
  const scope = moduleScopeFor(user.role);
  if (scope && !scope.includes(c.module)) throw forbidden();
  const after = await escalateCase(c.id, { userId: user.userId, role: user.role }, body.reason);
  return { case: after };
});
