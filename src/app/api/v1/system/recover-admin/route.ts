import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { hashPin } from "@server/core/auth";
import { clearFailures, isWeakPin } from "@server/core/lockout";
import { audit } from "@server/core/audit";
import { badRequest, notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { phoneLookup } from "@server/core/phone";
import { secretMatches } from "@server/core/service-identity";

/**
 * The way back in for the one account nobody can reset.
 *
 * Every citizen who forgets their code has somebody to ask: the agent who
 * registered them, or the national call centre. The first platform
 * administrator has nobody. /api/v1/system/bootstrap refuses permanently once
 * an administrator exists — correctly, because it is a way in — the database
 * sits on a private address with no psql to fall back on, and a deployment
 * with one administrator and no second account is therefore one forgotten code
 * away from having no administrator at all. That is not a hypothetical: it is
 * how this endpoint came to be written.
 *
 * It is a way in, so it is built to be one that is off by default and loud when
 * it is used:
 *
 * - Not offered at all unless ADMIN_RECOVERY_TOKEN is set — no token, 404, the
 *   same as any path that does not exist. It is deliberately a different secret
 *   from BOOTSTRAP_TOKEN, so that leaving one behind does not silently arm the
 *   other.
 * - The token is compared in constant time, and the request is rate limited on
 *   the authentication bucket.
 * - It resets an existing platform administrator and creates nobody. An unknown
 *   number is a 404 with no hint as to which part was wrong.
 * - The new code goes through the same weak-code rejection and the same scrypt
 *   cost as every other account.
 * - It bumps the account's session epoch, so every session that existed before
 *   the reset stops working. If the code was changed because somebody else had
 *   it, that somebody is signed out by the same action.
 * - It writes an audit record naming itself, on the hash chain, so a recovery
 *   is never something that merely happened.
 *
 * The token is meant to be set, used, and removed. Leaving it in the deployment
 * leaves a door that opens with one secret; unlike BOOTSTRAP_TOKEN, this one
 * does not go inert by itself.
 */
const Recover = z.object({
  phone: z.string().min(6).max(32),
  pin: z.string().min(6).max(12),
});

export const POST = handle({ limit: "auth" }, async ({ db, req, json, ip }) => {
  const expected = process.env.ADMIN_RECOVERY_TOKEN?.trim();
  if (!expected) throw notFound();
  if (!secretMatches(req.headers.get("x-recovery-token"), expected)) throw notFound();

  const body = await json(Recover);
  // Six characters minimum, as at bootstrap: this account can create every
  // other account and read the whole directory.
  if (isWeakPin(body.pin)) throw badRequest("Ce code est trop courant. Choisissez-en un autre.");

  const [admin] = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(eq(schema.users.phoneIndex, phoneLookup(body.phone)), eq(schema.users.role, "platform_admin")))
    .limit(1);
  // Deliberately the same answer as a missing token: an unknown number must not
  // tell an attacker that some other number would have worked.
  if (!admin) throw notFound();

  await db
    .update(schema.users)
    .set({ pinHash: hashPin(body.pin), status: "active", sessionEpoch: new Date() })
    .where(eq(schema.users.id, admin.id));

  // The lockout counter is cleared too: an administrator who has just proved
  // they hold the recovery secret should not then be told to wait.
  await clearFailures(db, "phone", body.phone);

  await audit({
    action: "user.admin_recovered",
    actorUserId: admin.id,
    actorRole: "platform_admin",
    entityType: "user",
    entityId: admin.id,
    after: { via: "admin_recovery_token", sessionsRevoked: true },
    ip,
  });

  return {
    recovered: { id: admin.id, name: admin.name },
    next: "Connectez-vous avec ce numéro et ce nouveau code.",
    warning:
      "Toutes les sessions ouvertes de ce compte ont été fermées. Retirez ADMIN_RECOVERY_TOKEN du déploiement maintenant, puis créez un second administrateur depuis /admin/utilisateurs.",
  };
});
