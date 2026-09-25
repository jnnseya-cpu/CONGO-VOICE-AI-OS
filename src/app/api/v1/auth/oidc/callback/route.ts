import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { ApiError } from "@server/core/errors";
import { SESSION_COOKIE, cookieOptions, encodeSession } from "@server/core/auth";
import { audit } from "@server/core/audit";
import { exchangeCode, oidcConfig, staffAccountForSubject, verifyIdToken } from "@server/core/oidc";
import { schema } from "@server/db/client";
import { env } from "@server/core/env";

const CLEAR = { httpOnly: true as const, sameSite: "lax" as const, secure: env.isProd, path: "/", maxAge: 0 };

/**
 * Completes federated staff sign-in.
 *
 * A verified token proves identity. It does not grant entitlement: the subject
 * must already be attached to an account on this platform, and the role comes
 * from that account, never from the token.
 */
export const GET = handle({ limit: "auth" }, async ({ req, db, ip }) => {
  const config = oidcConfig();
  if (!config) throw new ApiError(404, "L'authentification fédérée n'est pas configurée.", "oidc_not_configured");

  const url = req.nextUrl;
  const error = url.searchParams.get("error");
  if (error) throw new ApiError(401, "Connexion refusée par le fournisseur d'identité.", "oidc_provider_error", { error });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get("cvai_oidc_state")?.value;
  const nonce = req.cookies.get("cvai_oidc_nonce")?.value;
  const verifier = req.cookies.get("cvai_oidc_verifier")?.value;
  if (!code || !state || !expectedState || state !== expectedState || !nonce || !verifier) {
    throw new ApiError(400, "Requête de connexion invalide ou expirée.", "oidc_state_mismatch");
  }

  const { id_token } = await exchangeCode(config, code, verifier);
  const claims = await verifyIdToken(id_token, config, nonce);

  const account = await staffAccountForSubject(claims);
  if (!account || account.status !== "active") {
    await audit({ action: "auth.oidc_no_account", ip, after: { subject: claims.sub.slice(0, 12), issuer: claims.iss } });
    throw new ApiError(403, "Aucun compte de cette plateforme n'est rattaché à cette identité. Contactez un administrateur.", "oidc_no_account");
  }

  await db.update(schema.users).set({ lastActivityAt: new Date(), oidcIssuer: claims.iss }).where(eq(schema.users.id, account.id));
  const token = encodeSession({
    userId: account.id,
    role: account.role,
    language: account.languagePreference,
    name: account.name,
    province: account.province,
    anonymous: false,
  });
  await audit({ action: "auth.login", actorUserId: account.id, actorRole: account.role, ip, after: { method: "oidc", issuer: claims.iss } });

  const res = NextResponse.redirect(new URL("/tableau-de-bord", url.origin), 302);
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  for (const c of ["cvai_oidc_state", "cvai_oidc_nonce", "cvai_oidc_verifier"]) res.cookies.set(c, "", CLEAR);
  return res;
});
