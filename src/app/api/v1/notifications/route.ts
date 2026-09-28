import { and, count, desc, isNull } from "drizzle-orm";
import { handle, paging } from "@server/core/api";
import { notificationScope, seesNoNotifications } from "@server/core/notification-scope";
import { schema } from "@server/db/client";

/**
 * The signed-in person's notifications, and nobody else's.
 *
 * See src/server/core/notification-scope.ts for who may see what and why the
 * previous condition leaked other people's clinical alerts to every session.
 */
export const GET = handle({ permission: "notification:read_own" }, async ({ req, db, user }) => {
  if (seesNoNotifications(user)) return { notifications: [], unread: 0 };

  const { limit, offset } = paging(req);
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const scope = notificationScope(user);

  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(scope, unreadOnly ? isNull(schema.notifications.readAt) : undefined))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .offset(offset);

  // Counted across everything in scope, not across this page: the bell showed
  // the unread count of whatever happened to be on the first page.
  const [{ value: unread }] = await db
    .select({ value: count() })
    .from(schema.notifications)
    .where(and(scope, isNull(schema.notifications.readAt)));

  return { notifications: rows, unread };
});
