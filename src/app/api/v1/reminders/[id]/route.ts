import { and, eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { notFound } from "@server/core/errors";
import { schema } from "@server/db/client";

/** Cancel a single scheduled reminder without unsubscribing from the programme. */
export const DELETE = handle<{ id: string }>({ auth: true }, async ({ db, user, params, ip }) => {
  const [row] = await db
    .update(schema.schedules)
    .set({ status: "cancelled" })
    .where(and(eq(schema.schedules.id, params.id), eq(schema.schedules.userId, user.userId), eq(schema.schedules.status, "scheduled")))
    .returning();
  if (!row) throw notFound();
  await audit({ action: "reminder.cancelled", actorUserId: user.userId, actorRole: user.role, entityType: "schedule", entityId: row.id, after: { kind: row.kind }, purpose: "reminders", ip });
  return { reminder: row };
});
