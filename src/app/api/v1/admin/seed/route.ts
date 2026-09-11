import { handle } from "@server/core/api";
import { forbidden } from "@server/core/errors";
import { env } from "@server/core/env";
import { audit } from "@server/core/audit";
import { seed } from "@server/db/seed";

/**
 * Loads demonstration data into an empty database.
 *
 * Closed in production. The data it writes includes a platform administrator
 * whose PIN is printed in the source, so an endpoint that can create one is a
 * standing way in — an administrator account, once compromised, could mint
 * another with credentials the attacker already knows.
 */
export const POST = handle({ permission: "admin:config" }, async ({ user, ip }) => {
  if (env.isProd) {
    await audit({ action: "admin.seed_refused", actorUserId: user.userId, actorRole: user.role, ip });
    throw forbidden("Le jeu de démonstration ne peut pas être chargé en production.");
  }
  await audit({ action: "admin.seed_loaded", actorUserId: user.userId, actorRole: user.role, ip });
  return seed();
});
