import { z } from "zod";
import { handle } from "@server/core/api";
import { badRequest, forbidden } from "@server/core/errors";
import { requireStepUp } from "@server/core/mfa";
import { CREDENTIALS, CredentialRefused, clearCredential, credentialStatus, NEVER_SETTABLE, setCredential } from "@server/core/credentials";
import { aiGateway } from "@server/ai/gateway";

/**
 * The vendor credentials an administrator may set, and their current state.
 *
 * Three rules hold on every method here.
 *
 * Platform administrators only. `admin:config` is held by the government
 * administrator too, and supervising a service is not the same job as holding
 * its vendor keys.
 *
 * A recent second factor. Setting a credential is in the same class as
 * break-glass access and a risk override, and those already require it.
 *
 * No secret is ever returned. GET answers with where each credential comes
 * from, the last four characters of a secret, who set it and when. There is no
 * route that reads one back, for an administrator or for anybody else.
 */

const SetBody = z.object({ name: z.string().min(1).max(64), value: z.string().min(1).max(4096) });
const ClearBody = z.object({ name: z.string().min(1).max(64) });

function onlyPlatformAdmin(role: string) {
  if (role !== "platform_admin") {
    throw forbidden("Seul un administrateur de la plateforme peut gérer les clés des fournisseurs.");
  }
}

export const GET = handle({ permission: "admin:config", registered: true }, async ({ user }) => {
  onlyPlatformAdmin(user.role);
  const [credentials, status] = await Promise.all([credentialStatus(), aiGateway().status()]);
  return {
    credentials,
    /** What the gateway is actually using right now, by internal identifier. */
    active: status,
    /** Named so the console can explain why a key is set but unused. */
    refusedByResidency: status.refusedByResidency,
    neverSettable: NEVER_SETTABLE,
    note:
      "Une clé enregistrée ici prend effet immédiatement sur cette instance et dans la minute sur les autres. Elle remplace la variable du déploiement ; en la retirant, celle du déploiement s'applique de nouveau.",
  };
});

/*
 * The ordinary request limit, not the sign-in one.
 *
 * The strict "auth" class is keyed by address and allows ten a minute, which is
 * right for guessing a PIN and wrong here: wiring a pilot means setting a dozen
 * or more credentials in one sitting from one office, and there is nothing to
 * guess —
 * the caller is already a platform administrator with a second factor verified
 * minutes ago. Throttling that at ten would have made the page unusable for the
 * one job it exists to do.
 */
export const PUT = handle({ permission: "admin:config", registered: true, limit: "default" }, async ({ user, json, ip }) => {
  onlyPlatformAdmin(user.role);
  await requireStepUp(user);
  const body = await json(SetBody);
  if (!CREDENTIALS.some((c) => c.name === body.name)) {
    throw badRequest(`« ${body.name} » ne fait pas partie des clés gérées depuis la console.`);
  }
  try {
    const credential = await setCredential(body.name, body.value, { userId: user.userId, role: user.role, ip });
    return { credential, active: await aiGateway().status() };
  } catch (err) {
    if (err instanceof CredentialRefused) throw badRequest(err.message);
    throw err;
  }
});

export const DELETE = handle({ permission: "admin:config", registered: true, limit: "default" }, async ({ user, json, ip }) => {
  onlyPlatformAdmin(user.role);
  await requireStepUp(user);
  const body = await json(ClearBody);
  try {
    const credential = await clearCredential(body.name, { userId: user.userId, role: user.role, ip });
    return { credential, active: await aiGateway().status() };
  } catch (err) {
    if (err instanceof CredentialRefused) throw badRequest(err.message);
    throw err;
  }
});
