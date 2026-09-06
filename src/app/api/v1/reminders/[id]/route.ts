import { and, eq } from "drizzle-orm";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { notFound } from "@/lib/core/errors";
import { schema } from "@/lib/db/client";

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
