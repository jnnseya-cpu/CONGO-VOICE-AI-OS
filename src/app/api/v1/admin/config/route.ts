import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { schema } from "@/lib/db/client";

/** Runtime configuration editable by platform admins (thresholds, feature flags, messages). */
export const GET = handle({ permission: "admin:config" }, async ({ db }) => ({ config: await db.select().from(schema.adminConfig) }));

const Body = z.object({ key: z.string().min(1).max(96), value: z.unknown() });

export const PUT = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  const [before] = await db.select().from(schema.adminConfig).where(eq(schema.adminConfig.key, body.key));
  const [row] = await db
    .insert(schema.adminConfig)
    .values({ key: body.key, value: body.value ?? null, updatedBy: user.userId })
    .onConflictDoUpdate({ target: schema.adminConfig.key, set: { value: body.value ?? null, updatedBy: user.userId, updatedAt: new Date() } })
    .returning();
  await audit({ action: "admin.config_updated", actorUserId: user.userId, actorRole: user.role, entityType: "config", entityId: body.key, before: before?.value, after: body.value, ip });
  return { config: row };
});
