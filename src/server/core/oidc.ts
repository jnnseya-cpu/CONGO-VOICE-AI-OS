/**
 * Federated sign-in for staff (IAM-002, SEC-02).
 *
 * A community health worker signs in with a phone number and a PIN because that
 * is what they have. A ministry supervisor should not: their institution
 * already knows who they are, already disables their account when they leave,
 * and already enforces whatever second factor it requires. Duplicating that
 * here means a departed official keeps an account nobody remembers to close.
 *
 * Two deliberate limits. A token proves identity, never entitlement: the
 * subject must already be attached to a staff account created here, and roles
 * are never taken from the token. And the account is looked up by the subject
 * claim rather than by email, because an email address can be reassigned inside
 * an organisation while a subject cannot.
 *
 * Implemented on node:crypto and fetch alone: no new dependency, and nothing to
 * keep patched in a platform that has to run in places that are slow to update.
 */
import "server-only";
import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** When set, a token whose email is outside these domains is refused. */
  allowedDomains: string[];
}

export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  return {
    issuer: issuer.replace(/\/$/, ""),
    clientId,
    clientSecret,
    redirectUri,
    allowedDomains: (process.env.OIDC_ALLOWED_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function oidcEnabled(): boolean {
  return oidcConfig() !== null;
}

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

let discoveryCache: { at: number; issuer: string; doc: Discovery } | null = null;
const DISCOVERY_TTL_MS = 3_600_000;

export async function discover(config: OidcConfig): Promise<Discovery> {
  if (discoveryCache && discoveryCache.issuer === config.issuer && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.doc;
  }
  const res = await fetch(`${config.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`oidc_discovery_failed_${res.status}`);
  const doc = (await res.json()) as Discovery;
  if (doc.issuer?.replace(/\/$/, "") !== config.issuer) throw new Error("oidc_issuer_mismatch");
  discoveryCache = { at: Date.now(), issuer: config.issuer, doc };
  return doc;
}

export function resetDiscoveryCache() {
  discoveryCache = null;
}

export interface AuthorizationStart {
  url: string;
  state: string;
  /** Held by the caller and never sent to the provider until the exchange. */
  codeVerifier: string;
  nonce: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Builds the redirect, with proof key for code exchange so an intercepted code is useless. */
export async function beginAuthorization(config: OidcConfig): Promise<AuthorizationStart> {
  const doc = await discover(config);
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const codeVerifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, codeVerifier, nonce };
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

let jwksCache: { at: number; uri: string; keys: Jwk[] } | null = null;

async function jwks(uri: string): Promise<Jwk[]> {
  if (jwksCache && jwksCache.uri === uri && Date.now() - jwksCache.at < DISCOVERY_TTL_MS) return jwksCache.keys;
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`oidc_jwks_failed_${res.status}`);
  const doc = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), uri, keys: doc.keys ?? [] };
  return jwksCache.keys;
}

export function resetJwksCache() {
  jwksCache = null;
}

const ALGORITHMS: Record<string, string> = { RS256: "RSA-SHA256", RS384: "RSA-SHA384", RS512: "RSA-SHA512" };

/**
 * Verifies the identity token: signature against the provider's published key,
 * then issuer, audience, expiry and the nonce this request started with.
 *
 * Each of these has been a real-world break on its own. A token that is signed
 * but issued for a different application is not a sign-in to this one.
 */
export async function verifyIdToken(token: string, config: OidcConfig, expectedNonce: string, now = Date.now()): Promise<IdTokenClaims> {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("oidc_malformed_token");

  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString()) as { alg: string; kid?: string };
  const nodeAlg = ALGORITHMS[header.alg];
  if (!nodeAlg) throw new Error(`oidc_unsupported_alg_${header.alg}`);

  const doc = await discover(config);
  const keys = await jwks(doc.jwks_uri);
  const key = keys.find((k) => (header.kid ? k.kid === header.kid : true) && k.kty === "RSA");
  if (!key) throw new Error("oidc_signing_key_not_found");

  const publicKey = createPublicKey({ key: key as unknown as import("node:crypto").JsonWebKey, format: "jwk" });
  const verifier = createVerify(nodeAlg);
  verifier.update(`${headerPart}.${payloadPart}`);
  if (!verifier.verify(publicKey, Buffer.from(signaturePart, "base64url"))) throw new Error("oidc_bad_signature");

  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as IdTokenClaims;
  if (claims.iss?.replace(/\/$/, "") !== config.issuer) throw new Error("oidc_issuer_mismatch");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.clientId)) throw new Error("oidc_audience_mismatch");
  if (!claims.exp || claims.exp * 1000 <= now) throw new Error("oidc_token_expired");

  const given = Buffer.from(claims.nonce ?? "");
  const expected = Buffer.from(expectedNonce);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("oidc_nonce_mismatch");

  if (config.allowedDomains.length > 0) {
    const domain = (claims.email ?? "").split("@")[1]?.toLowerCase();
    if (!domain || !config.allowedDomains.includes(domain)) throw new Error("oidc_domain_not_allowed");
  }
  return claims;
}

export async function exchangeCode(config: OidcConfig, code: string, codeVerifier: string): Promise<{ id_token: string }> {
  const doc = await discover(config);
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) throw new Error(`oidc_token_exchange_failed_${res.status}`);
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("oidc_no_id_token");
  return { id_token: json.id_token };
}

/**
 * Finds the staff account a verified subject belongs to.
 *
 * Never creates one. A token from the ministry's directory says who someone is;
 * what they may see here is decided by an administrator of this platform, who
 * attaches the subject to an account with a role.
 */
export async function staffAccountForSubject(claims: IdTokenClaims) {
  const db = await getDb();
  const [bySubject] = await db.select().from(schema.users).where(eq(schema.users.oidcSubject, claims.sub));
  return bySubject ?? null;
}
