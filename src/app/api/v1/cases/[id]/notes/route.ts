import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { schema } from "@server/db/client";
import { addCaseNote } from "@server/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, user, params }) => {
  const c = await loadCaseScoped(db, params.id, user.role);
  const notes = await db
    .select()
    .from(schema.caseEvents)
    .where(and(eq(schema.caseEvents.caseId, c.id), eq(schema.caseEvents.type, "note")))
    .orderBy(asc(schema.caseEvents.createdAt));
  return { notes };
});

const Body = z.object({ note: z.string().min(1).max(4000) });

export const POST = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const c = await loadCaseScoped(db, params.id, user.role);
  await addCaseNote(c.id, { userId: user.userId, role: user.role }, body.note);
  return { ok: true };
});
