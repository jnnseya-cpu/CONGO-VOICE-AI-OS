import "server-only";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";

export async function unreadNotificationCount(userId: string): Promise<number> {
  try {
    const db = await getDb();
    const [r] = await db
      .select({ n: count() })
      .from(schema.notifications)
      .where(and(or(eq(schema.notifications.userId, userId), isNull(schema.notifications.userId)), isNull(schema.notifications.readAt)));
    return r.n;
  } catch {
    return 0;
  }
}
