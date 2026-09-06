import { and, eq } from "drizzle-orm";
import { handle } from "@/lib/core/api";
import { notFound } from "@/lib/core/errors";
import { schema } from "@/lib/db/client";

/** Mark a notification as read. */
export const PATCH = handle<{ id: string }>({ permission: "notification:read_own" }, async ({ db, user, params }) => {
  const [n] = await db.update(schema.notifications).set({ readAt: new Date(), status: "read" }).where(and(eq(schema.notifications.id, params.id), eq(schema.notifications.userId, user.userId))).returning();
  if (!n) throw notFound();
  return { notification: n };
});
