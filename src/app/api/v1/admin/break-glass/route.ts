import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { emitEvent } from "@/lib/core/events";
import { notFound } from "@/lib/core/errors";
import { schema } from "@/lib/db/client";
import { requireStepUp } from "@/lib/core/mfa";
import { notifyRole } from "@/lib/core/notifications";

/** Break-glass grants: who opened one, why, until when, and whether it was revoked. */
export const GET = handle({ permission: "admin:config" }, async ({ db }) => ({
  grants: await db.select().from(schema.breakGlassAccess).orderBy(desc(schema.breakGlassAccess.createdAt)).limit(100),
}));

const Body = z.object({
  scope: z.string().min(3).max(160),
  justification: z.string().min(20, "Justification d'au moins 20 caractères obligatoire.").max(2000),
  minutes: z.number().int().min(5).max(240).default(60),
  /** Revoke an existing grant instead of opening one. */
  revokeId: z.string().uuid().optional(),
});

/**
 * Emergency access outside the normal permission model: time-boxed, justified in writing,
 * audited, and announced to every administrator the moment it is opened. There is no
 * silent break-glass.
 */
export const POST = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  await requireStepUp(user);

  if (body.revokeId) {
    const [revoked] = await db.update(schema.breakGlassAccess).set({ revokedAt: new Date() }).where(eq(schema.breakGlassAccess.id, body.revokeId)).returning();
    if (!revoked) throw notFound();
    await audit({ action: "admin.break_glass_revoked", actorUserId: user.userId, actorRole: user.role, entityType: "break_glass", entityId: revoked.id, after: { scope: revoked.scope }, purpose: "break_glass", ip });
    await emitEvent({ type: "security.break_glass.revoked", aggregateType: "break_glass", aggregateId: revoked.id, classification: "restricted", actor: { type: "worker", id: user.userId }, payload: { scope: revoked.scope } });
    return { grant: revoked, revoked: true };
  }

  const expiresAt = new Date(Date.now() + body.minutes * 60_000);
  const [grant] = await db
    .insert(schema.breakGlassAccess)
    .values({ userId: user.userId, justification: body.justification, scope: body.scope, expiresAt })
    .returning();

  await audit({
    action: "admin.break_glass_opened",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "break_glass",
    entityId: grant.id,
    after: { scope: body.scope, expiresAt, justification: body.justification },
    purpose: "break_glass",
    ip,
  });
  await emitEvent({ type: "security.break_glass.opened", aggregateType: "break_glass", aggregateId: grant.id, classification: "restricted", actor: { type: "worker", id: user.userId }, payload: { scope: body.scope, expiresAt: expiresAt.toISOString() } });
  await notifyRole("platform_admin", {
    type: "alert",
    channel: "in_app",
    title: "Accès d'urgence ouvert",
    body: `Un accès d'urgence a été ouvert sur « ${body.scope} » jusqu'à ${expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC. Motif : ${body.justification}`,
    payload: { grantId: grant.id, scope: body.scope },
    emergency: true,
    requiresAck: true,
  });
  return { grant, expiresAt };
});
