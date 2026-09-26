import { z } from "zod";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { hashPin } from "@server/core/auth";
import { isWeakPin } from "@server/core/lockout";
import { audit } from "@server/core/audit";
import { badRequest, forbidden, notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { phoneColumns, phoneLookup } from "@server/core/phone";
import { secretMatches } from "@server/core/service-identity";

/**
 * The first platform administrator.
 *
 * Every other account is created by an administrator through /admin/utilisateurs,
 * which is correct and leaves a fresh deployment unable to start: the directory
 * needs a platform_admin session, and the only way to obtain one is the
 * directory. The database is on a private address, so there is no psql to fall
 * back on either.
 *
 * This endpoint exists to break that circle once, and is built so it cannot
 * become a way in:
 *
 * - It is not offered at all unless BOOTSTRAP_TOKEN is set — no token, 404, the
 *   same as any path that does not exist. An attacker learns nothing.
 * - The token is compared in constant time.
 * - It refuses the moment a platform_admin exists. Not "requires a stronger
 *   token" — refuses, permanently, because the circle it breaks is already
 *   broken. Deleting the last administrator does not re-open it; that is a
 *   restore-from-backup problem, not a bootstrap.
 * - The PIN goes through the same weak-PIN rejection and the same scrypt cost as
 *   every other account. A first administrator with PIN 1234 is worse than none.
 * - It writes an audit record naming itself, so the account's origin is on the
 *   hash chain rather than being the one account nobody can account for.
 *
 * The token should be removed from the deployment afterwards. It is inert once
 * an administrator exists, so leaving it is untidy rather than dangerous.
 */
const Bootstrap = z.object({
  phone: z.string().min(6).max(32),
  pin: z.string().min(6).max(12),
  name: z.string().min(2).max(160),
});

export const POST = handle({ limit: "auth" }, async ({ db, req, json, ip }) => {
  const expected = process.env.BOOTSTRAP_TOKEN?.trim();
  if (!expected) throw notFound();
  if (!secretMatches(req.headers.get("x-bootstrap-token"), expected)) throw notFound();

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "platform_admin"))
    .limit(1);
  if (existing) {
    throw forbidden(
      "Un administrateur de la plateforme existe déjà. Créez les comptes suivants depuis /admin/utilisateurs.",
    );
  }

  const body = await json(Bootstrap);
  // Six digits minimum here, where the schema allows four elsewhere: this
  // account can create every other account and read the whole directory.
  if (isWeakPin(body.pin)) throw badRequest("Ce code PIN est trop courant. Choisissez-en un autre.");

  const [clash] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.phoneIndex, phoneLookup(body.phone)));
  if (clash) throw badRequest("Ce numéro est déjà enregistré");

  const [created] = await db
    .insert(schema.users)
    .values({
      ...phoneColumns(body.phone),
      pinHash: hashPin(body.pin),
      name: body.name,
      role: "platform_admin",
      languagePreference: "fr",
      consentStatus: "granted",
    })
    .returning();

  await audit({
    action: "user.bootstrapped",
    actorUserId: created.id,
    actorRole: "platform_admin",
    entityType: "user",
    entityId: created.id,
    after: { role: created.role, via: "bootstrap_token" },
    ip,
  });

  return {
    created: { id: created.id, name: created.name, role: created.role },
    next: "Connectez-vous avec ce numéro et ce PIN, puis créez les autres comptes depuis /admin/utilisateurs.",
    note: "Cet endpoint refuse désormais toute nouvelle demande. Retirez BOOTSTRAP_TOKEN du déploiement.",
  };
});
