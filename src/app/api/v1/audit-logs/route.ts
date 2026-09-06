import { and, desc, eq } from "drizzle-orm";
import { handle, paging } from "@/lib/core/api";
import { schema } from "@/lib/db/client";

export const GET = handle({ permission: "audit:read" }, async ({ req, db }) => {
  const { limit, offset } = paging(req);
  const q = req.nextUrl.searchParams;
  const rows = await db
    .select()
    .from(schema.auditLogs)
    .where(and(q.get("entityType") ? eq(schema.auditLogs.entityType, q.get("entityType")!) : undefined, q.get("entityId") ? eq(schema.auditLogs.entityId, q.get("entityId")!) : undefined, q.get("action") ? eq(schema.auditLogs.action, q.get("action")!) : undefined))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit)
    .offset(offset);
  return { logs: rows };
});
