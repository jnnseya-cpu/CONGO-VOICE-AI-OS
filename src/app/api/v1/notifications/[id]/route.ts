import { and, eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { notificationScope, seesNoNotifications } from "@server/core/notification-scope";
import { schema } from "@server/db/client";

/**
 * Mark one of my notifications as read.
 *
 * Scoped identically to the list. Marking an unassigned emergency alert as read
 * used to be open to anyone signed in, which did not merely disclose it — it
 * removed it from the unread queue of the worker who was meant to act on it.
 */
export const PATCH = handle<{ id: string }>({ permission: "notification:read_own" }, async ({ db, user, params }) => {
  if (seesNoNotifications(user)) throw notFound();
  const [n] = await db
    .update(schema.notifications)
    .set({ readAt: new Date(), status: "read" })
    .where(and(eq(schema.notifications.id, params.id), notificationScope(user)))
    .returning();
  if (!n) throw notFound();
  return { notification: n };
});
