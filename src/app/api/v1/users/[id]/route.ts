import { z } from "zod";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { badRequest, notFound } from "@server/core/errors";
import { tombstoneUser } from "@server/core/privacy";
import { schema } from "@server/db/client";
import { publicUser } from "@server/core/users";

/**
 * One account, and its deletion by an administrator.
 *
 * Deleting somebody else's account is the most consequential thing this
 * platform lets an administrator do, so it carries what the self-service route
 * carries and one thing more: a written reason. An erasure is irreversible and
 * appears in the audit log; "who did this and why" is the only question anyone
 * will ask afterwards, and the answer has to already be there.
 */
export const GET = handle<{ id: string }>({ permission: "user:manage" }, async ({ db, params }) => {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, params.id));
  if (!u) throw notFound();
  return { user: { ...publicUser(u), createdAt: u.createdAt, lastActivityAt: u.lastActivityAt, status: u.status } };
});

const Delete = z.object({
  reason: z.string().min(10).max(500),
});

export const DELETE = handle<{ id: string }>({ permission: "user:manage" }, async ({ db, params, user, json, ip }) => {
  const body = await json(Delete);

  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, params.id));
  if (!target) throw notFound();
  if (target.status === "erased") throw badRequest("Ce compte est déjà supprimé.");

  // An administrator deleting their own account goes through /api/v1/me/delete,
  // which asks for their PIN. Re-authentication is the point; routing around it
  // through the directory would make the confirmation decorative.
  if (target.id === user.userId) {
    throw badRequest("Pour supprimer votre propre compte, passez par vos paramètres : la confirmation par code PIN y est demandée.");
  }

  // The platform must not be left with nobody who can appoint anybody.
  if (target.role === "platform_admin") {
    const admins = await db
      .select({ id: schema.users.id, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.role, "platform_admin"));
    const remaining = admins.filter((a) => a.id !== target.id && a.status === "active");
    if (remaining.length === 0) {
      throw badRequest("C'est le dernier administrateur actif. Nommez un remplaçant avant de supprimer ce compte.");
    }
  }

  await audit({
    action: "user.deletion_ordered",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "user",
    entityId: target.id,
    before: publicUser(target),
    after: { reason: body.reason },
    ip,
  });

  const result = await tombstoneUser(target.id, { userId: user.userId, role: user.role }, { ip });
  return { deleted: true, ...result };
});
