import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";
import { CANARY_HOLD_DAYS, CANARY_START_PERCENT, canariesDue, resetFlagCache } from "@server/core/flags";

/** Flags, their scope, and which staged rollouts have served their window (DO-04, AI-17). */
export const GET = handle({ permission: "admin:config" }, async ({ db }) => {
  const flags = await db.select().from(schema.featureFlags).orderBy(schema.featureFlags.key);
  return { flags, canariesDue: await canariesDue(), defaults: { startPercent: CANARY_START_PERCENT, holdDays: CANARY_HOLD_DAYS } };
});

const Upsert = z.object({
  key: z.string().min(2).max(96),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(false),
  modules: z.array(z.enum(["health", "agriculture", "education", "general"])).default([]),
  languages: z.array(z.enum(["fr", "ln", "kg", "sw", "lua"])).default([]),
  channels: z.array(z.string().max(16)).default([]),
  provinces: z.array(z.string().max(120)).default([]),
  rolloutPercent: z.number().int().min(0).max(100).default(100),
  /** Start a staged rollout now. Widening it later is a separate, deliberate act. */
  startCanary: z.boolean().default(false),
  canaryDays: z.number().int().min(1).max(60).default(CANARY_HOLD_DAYS),
});

export const POST = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Upsert);
  const [previous] = await db.select().from(schema.featureFlags).where(eq(schema.featureFlags.key, body.key));

  const values = {
    key: body.key,
    description: body.description ?? null,
    enabled: body.enabled,
    modules: body.modules,
    languages: body.languages,
    channels: body.channels,
    provinces: body.provinces,
    rolloutPercent: body.startCanary ? CANARY_START_PERCENT : body.rolloutPercent,
    canaryStartedAt: body.startCanary ? new Date() : (previous?.canaryStartedAt ?? null),
    canaryDays: body.canaryDays,
    updatedBy: user.userId,
    updatedAt: new Date(),
  };

  const [row] = previous
    ? await db.update(schema.featureFlags).set(values).where(eq(schema.featureFlags.id, previous.id)).returning()
    : await db.insert(schema.featureFlags).values(values).returning();

  resetFlagCache();
  await audit({
    action: previous ? "flag.updated" : "flag.created",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "feature_flag",
    entityId: row.id,
    before: previous ? { enabled: previous.enabled, rolloutPercent: previous.rolloutPercent, provinces: previous.provinces } : null,
    after: { enabled: row.enabled, rolloutPercent: row.rolloutPercent, provinces: row.provinces, canaryStartedAt: row.canaryStartedAt },
    ip,
  });
  return { flag: row };
});

/** Remove a flag once its behaviour is permanent. A flag nobody retires becomes a second codebase. */
export const DELETE = handle({ permission: "admin:config" }, async ({ db, req, user, ip }) => {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return { deleted: 0 };
  const rows = await db.delete(schema.featureFlags).where(and(eq(schema.featureFlags.key, key))).returning();
  resetFlagCache();
  if (rows.length) {
    await audit({ action: "flag.deleted", actorUserId: user.userId, actorRole: user.role, entityType: "feature_flag", entityId: rows[0].id, before: { key }, ip });
  }
  return { deleted: rows.length };
});
