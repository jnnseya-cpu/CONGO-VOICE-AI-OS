import { NextResponse } from "next/server";
import { handle } from "@server/core/api";
import { ApiError } from "@server/core/errors";
import { beginAuthorization, oidcConfig } from "@server/core/oidc";
import { env } from "@server/core/env";

/** Begins federated staff sign-in (IAM-002). Returns 404 when no provider is configured. */
export const GET = handle({ limit: "auth" }, async () => {
  const config = oidcConfig();
  if (!config) throw new ApiError(404, "L'authentification fédérée n'est pas configurée.", "oidc_not_configured");

  const start = await beginAuthorization(config);
  const res = NextResponse.redirect(start.url, 302);
  // State, nonce and the code verifier stay with the browser and never reach the
  // provider until the exchange, which is what makes an intercepted code useless.
  const options = { httpOnly: true as const, sameSite: "lax" as const, secure: env.isProd, path: "/", maxAge: 600 };
  res.cookies.set("cvai_oidc_state", start.state, options);
  res.cookies.set("cvai_oidc_nonce", start.nonce, options);
  res.cookies.set("cvai_oidc_verifier", start.codeVerifier, options);
  return res;
});
