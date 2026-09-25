import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";

import { beginAuthorization, oidcConfig, oidcEnabled, resetDiscoveryCache, resetJwksCache, verifyIdToken } from "@server/core/oidc";

/**
 * A stubbed identity provider. Every check in verifyIdToken has been a
 * real-world break on its own, so each one is exercised with a token that is
 * otherwise perfectly valid.
 */
const ISSUER = "https://id.example.gov";
const CLIENT_ID = "congo-voice-ai-os";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;

function sign(claims: Record<string, unknown>, alg = "RS256", kid = "test-key"): string {
  const header = Buffer.from(JSON.stringify({ alg, kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

const ENV = process.env as Record<string, string | undefined>;
const saved = { ...ENV };

function validClaims(over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: ISSUER, sub: "user-123", aud: CLIENT_ID, iat: now, exp: now + 300, nonce: "the-nonce", email: "agent@sante.gouv.cd", ...over };
}

beforeEach(() => {
  Object.assign(ENV, {
    OIDC_ISSUER: ISSUER,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: "secret",
    OIDC_REDIRECT_URI: "https://congovoicecd.com/api/v1/auth/oidc/callback",
    OIDC_ALLOWED_DOMAINS: "",
  });
  resetDiscoveryCache();
  resetJwksCache();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return new Response(
        JSON.stringify({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` }),
        { status: 200 },
      );
    }
    if (url.endsWith("/jwks")) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", use: "sig", alg: "RS256" }] }), { status: 200 });
    return new Response("not found", { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(ENV)) if (!(k in saved)) delete ENV[k];
  Object.assign(ENV, saved);
});

describe("federated staff sign-in (IAM-002, SEC-02)", () => {
  it("is off unless every setting is present", () => {
    expect(oidcEnabled()).toBe(true);
    delete ENV.OIDC_CLIENT_SECRET;
    expect(oidcEnabled()).toBe(false);
  });

  it("sends the browser to the provider with proof key for code exchange", async () => {
    const start = await beginAuthorization(oidcConfig()!);
    const url = new URL(start.url);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    // The verifier itself must not travel with the redirect.
    expect(start.url).not.toContain(start.codeVerifier);
    expect(url.searchParams.get("state")).toBe(start.state);
    expect(url.searchParams.get("nonce")).toBe(start.nonce);
  });

  it("accepts a token that is signed, current, addressed to us and answers our nonce", async () => {
    const claims = await verifyIdToken(sign(validClaims()), oidcConfig()!, "the-nonce");
    expect(claims.sub).toBe("user-123");
  });

  it("refuses a token signed by a different key", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(validClaims())).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const forged = `${header}.${payload}.${signer.sign(other.privateKey).toString("base64url")}`;
    await expect(verifyIdToken(forged, oidcConfig()!, "the-nonce")).rejects.toThrow(/bad_signature/);
  });

  it("refuses a token issued for another application", async () => {
    await expect(verifyIdToken(sign(validClaims({ aud: "some-other-app" })), oidcConfig()!, "the-nonce")).rejects.toThrow(/audience_mismatch/);
  });

  it("refuses a token from another issuer", async () => {
    await expect(verifyIdToken(sign(validClaims({ iss: "https://evil.example" })), oidcConfig()!, "the-nonce")).rejects.toThrow(/issuer_mismatch/);
  });

  it("refuses an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    await expect(verifyIdToken(sign(validClaims({ exp: past })), oidcConfig()!, "the-nonce")).rejects.toThrow(/expired/);
  });

  it("refuses a token replayed against a different sign-in attempt", async () => {
    await expect(verifyIdToken(sign(validClaims()), oidcConfig()!, "a-different-nonce")).rejects.toThrow(/nonce_mismatch/);
  });

  it("refuses an unsigned token, whether the signature is absent or nonsense", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(validClaims())).toString("base64url");
    // Empty signature: refused as malformed before any algorithm is considered.
    await expect(verifyIdToken(`${header}.${payload}.`, oidcConfig()!, "the-nonce")).rejects.toThrow(/malformed/);
    // Present but declaring "none": refused because the algorithm is not one we verify.
    await expect(verifyIdToken(`${header}.${payload}.AAAA`, oidcConfig()!, "the-nonce")).rejects.toThrow(/unsupported_alg/);
  });

  it("refuses an identity from outside the permitted domains", async () => {
    ENV.OIDC_ALLOWED_DOMAINS = "sante.gouv.cd";
    await expect(verifyIdToken(sign(validClaims({ email: "someone@gmail.com" })), oidcConfig()!, "the-nonce")).rejects.toThrow(/domain_not_allowed/);
    await expect(verifyIdToken(sign(validClaims()), oidcConfig()!, "the-nonce")).resolves.toBeTruthy();
  });
});
