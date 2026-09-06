import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@server/core/api";
import { forbidden } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { schema } from "@server/db/client";
import { DATA_REQUEST_SLA_DAYS, createDataRequest } from "@server/core/privacy";

/** Access and erasure requests. Citizens see their own; administrators see all. */
export const GET = handle({ auth: true }, async ({ req, db, user }) => {
  const { limit, offset } = paging(req);
  const all = hasPermission(user.role, "user:manage");
  const rows = await db
    .select()
    .from(schema.dataRequests)
    .where(all ? undefined : eq(schema.dataRequests.userId, user.userId))
    .orderBy(desc(schema.dataRequests.createdAt))
    .limit(limit)
    .offset(offset);
  return { requests: rows, slaDays: DATA_REQUEST_SLA_DAYS };
});

const Body = z.object({
  type: z.enum(["access", "erasure"]),
  method: z.enum(["voice", "button", "ussd", "worker_assisted", "written"]).default("voice"),
  userId: z.string().uuid().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

/** Open a request. The 30-day legal deadline starts now and is tracked by the scheduler. */
export const POST = handle({ auth: true }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const target = body.userId ?? user.userId;
  if (target !== user.userId && !hasPermission(user.role, "user:manage")) throw forbidden();
  const request = await createDataRequest({
    userId: target,
    type: body.type,
    method: body.method,
    requestedBy: { userId: user.userId, role: user.role },
    evidence: body.evidence,
    ip,
  });
  return { request, dueAt: request.dueAt, slaDays: DATA_REQUEST_SLA_DAYS };
});
