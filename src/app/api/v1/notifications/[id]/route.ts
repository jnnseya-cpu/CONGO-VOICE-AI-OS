import { and, eq, isNull, or } from "drizzle-orm";
import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { schema } from "@server/db/client";

/** Mark a notification as read (own notifications, or shared-queue notifications addressed to a role). */
export const PATCH = handle<{ id: string }>({ permission: "notification:read_own" }, async ({ db, user, params }) => {
  const [n] = await db.update(schema.notifications).set({ readAt: new Date(), status: "read" }).where(and(eq(schema.notifications.id, params.id), or(eq(schema.notifications.userId, user.userId), isNull(schema.notifications.userId)))).returning();
  if (!n) throw notFound();
  return { notification: n };
});
