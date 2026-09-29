import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { hashPin } from "@server/core/auth";
import { clearFailures, isWeakPin } from "@server/core/lockout";
import { audit } from "@server/core/audit";
import { badRequest, notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { maskStoredPhone, phoneColumns, phoneLookup } from "@server/core/phone";
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
/**
 * Two requests, because looking the account up by number assumed the number
 * was known, and it was not.
 *
 * An administrator locked out of this platform was told by the bootstrap
 * endpoint that an administrator exists — that check asks only whether any
 * platform_admin row is present, never which number it carries — and then told
 * by this one, repeatedly, that no administrator matched the number they were
 * certain of. Both answers were true. The account had been created with a
 * different number, and nothing either endpoint said could reveal that.
 *
 * `{ list: true }` answers the question that was actually blocking: which
 * administrators exist, and what number is each one under. The numbers come
 * back masked to their last four digits — enough to recognise your own, not
 * enough to be a directory dump if the token ever leaks.
 */
/**
 * Order matters. z.union takes the first branch that parses, and a plain
 * z.object ignores unknown keys — so with the phone branch listed first, a
 * payload carrying userId AND phone matched it, the id was dropped, and the
 * lookup went back to searching by a number that cannot be found. The id
 * branch is first for that reason.
 */
const Recover = z.union([
  z.object({ list: z.literal(true) }),
  z.object({
    userId: z.string().uuid(),
    pin: z.string().min(6).max(12),
    /**
     * Rewrites the account's number with the key that is running now.
     *
     * A stored number that will not decrypt — the listing shows it as
     * "(illisible)" — means the row was written under a different
     * DATA_ENCRYPTION_KEY. The lookup index beside it is keyed by the same
     * secret, so it cannot match anything this deployment computes: that
     * account cannot be signed into with any number and any code, and no
     * amount of resetting the code changes it. Setting the number here puts
     * both columns back under the current key, which is the only thing that
     * makes the account reachable again.
     */
    phone: z.string().min(6).max(32).optional(),
  }),
  z.object({ phone: z.string().min(6).max(32), pin: z.string().min(6).max(12) }),
]);

export const POST = handle({ limit: "auth" }, async ({ db, req, json, ip }) => {
  const expected = process.env.ADMIN_RECOVERY_TOKEN?.trim();
  if (!expected) throw notFound();
  if (!secretMatches(req.headers.get("x-recovery-token"), expected)) throw notFound();

  const body = await json(Recover);

  if ("list" in body) {
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        phone: schema.users.phone,
        status: schema.users.status,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.role, "platform_admin"));
    await audit({
      action: "user.admin_listed",
      entityType: "user",
      entityId: "platform_admins",
      systemEvent: "admin_recovery_list",
      after: { count: rows.length },
      ip,
    });
    return {
      administrators: rows.map((r) => ({
        id: r.id,
        name: r.name,
        // Last four digits only. Enough to recognise your own number.
        phone: maskStoredPhone(r.phone) ?? "(illisible)",
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  // Six characters minimum, as at bootstrap: this account can create every
  // other account and read the whole directory.
  if (isWeakPin(body.pin)) throw badRequest("Ce code est trop courant. Choisissez-en un autre.");

  const where =
    "userId" in body
      ? and(eq(schema.users.id, body.userId), eq(schema.users.role, "platform_admin"))
      : and(eq(schema.users.phoneIndex, phoneLookup(body.phone)), eq(schema.users.role, "platform_admin"));
  const [admin] = await db
    .select({ id: schema.users.id, name: schema.users.name, phone: schema.users.phone })
    .from(schema.users)
    .where(where)
    .limit(1);
  // Deliberately the same answer as a missing token: an unknown number must not
  // tell an attacker that some other number would have worked.
  if (!admin) throw notFound();

  const rewritePhone = "phone" in body && body.phone ? phoneColumns(body.phone) : null;
  if (rewritePhone?.phoneIndex) {
    // Refuse to collide with a different account that already holds it.
    const [clash] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.phoneIndex, rewritePhone.phoneIndex))
      .limit(1);
    if (clash && clash.id !== admin.id) throw badRequest("Ce numéro est déjà enregistré sur un autre compte.");
  }

  await db
    .update(schema.users)
    .set({
      pinHash: hashPin(body.pin),
      status: "active",
      sessionEpoch: new Date(),
      ...(rewritePhone ? { phone: rewritePhone.phone, phoneIndex: rewritePhone.phoneIndex } : {}),
    })
    .where(eq(schema.users.id, admin.id));

  // The lockout counter is cleared too: an administrator who has just proved
  // they hold the recovery secret should not then be told to wait.
  if ("phone" in body && body.phone) await clearFailures(db, "phone", body.phone);

  await audit({
    action: "user.admin_recovered",
    actorUserId: admin.id,
    actorRole: "platform_admin",
    entityType: "user",
    entityId: admin.id,
    after: { via: "admin_recovery_token", sessionsRevoked: true, phoneRewritten: Boolean(rewritePhone) },
    ip,
  });

  return {
    /**
     * The number is in the answer, masked, because it is the other half of
     * signing in and the person resetting the code may not know it. The first
     * successful recovery reset the code and did not say which number it
     * belonged to, which left the account exactly as unreachable as before.
     */
    recovered: { id: admin.id, name: admin.name, phone: maskStoredPhone(admin.phone) ?? "(illisible)" },
    next: "Connectez-vous avec ce numéro et ce nouveau code.",
    warning:
      "Toutes les sessions ouvertes de ce compte ont été fermées. Retirez ADMIN_RECOVERY_TOKEN du déploiement maintenant, puis créez un second administrateur depuis /admin/utilisateurs.",
  };
});
