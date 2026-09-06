import { and, desc, eq, isNull, or } from "drizzle-orm";
import { handle, paging } from "@/lib/core/api";
import { schema } from "@/lib/db/client";

export const GET = handle({ permission: "notification:read_own" }, async ({ req, db, user }) => {
  const { limit, offset } = paging(req);
  const unread = req.nextUrl.searchParams.get("unread") === "1";
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(or(eq(schema.notifications.userId, user.userId), isNull(schema.notifications.userId)), unread ? isNull(schema.notifications.readAt) : undefined))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .offset(offset);
  return { notifications: rows, unread: rows.filter((n) => !n.readAt).length };
});
