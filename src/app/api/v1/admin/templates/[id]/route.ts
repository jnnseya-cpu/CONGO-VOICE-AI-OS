import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { notFound } from "@/lib/core/errors";
import { schema } from "@/lib/db/client";

const Patch = z.object({
  title: z.string().max(240).optional(),
  body: z.string().min(2).optional(),
  sensitivity: z.enum(["normal", "sensitive"]).optional(),
  status: z.enum(["draft", "review", "approved", "canary", "active", "retired"]).optional(),
});

/** Edit or approve a template. Approval is recorded with the approver's identity. */
export const PATCH = handle<{ id: string }>({ permission: "admin:config" }, async ({ db, user, params, json, ip }) => {
  const body = await json(Patch);
  const [before] = await db.select().from(schema.notificationTemplates).where(eq(schema.notificationTemplates.id, params.id));
  if (!before) throw notFound();
  const [row] = await db
    .update(schema.notificationTemplates)
    .set({ ...body, approvedBy: body.status === "approved" ? user.userId : before.approvedBy })
    .where(eq(schema.notificationTemplates.id, params.id))
    .returning();
  await audit({ action: "notification.template_updated", actorUserId: user.userId, actorRole: user.role, entityType: "notification_template", entityId: params.id, before: { body: before.body, status: before.status }, after: { body: row.body, status: row.status }, ip });
  return { template: row };
});

/** Templates are retired, never deleted: past messages must remain explainable. */
export const DELETE = handle<{ id: string }>({ permission: "admin:config" }, async ({ db, user, params, ip }) => {
  const [row] = await db.update(schema.notificationTemplates).set({ status: "retired" }).where(eq(schema.notificationTemplates.id, params.id)).returning();
  if (!row) throw notFound();
  await audit({ action: "notification.template_retired", actorUserId: user.userId, actorRole: user.role, entityType: "notification_template", entityId: params.id, after: { status: "retired" }, ip });
  return { template: row };
});
