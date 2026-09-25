/**
 * Who may run the platform's maintenance job.
 *
 * This exists because the answer used to be "nobody". Cloud Scheduler calls the
 * endpoint every five minutes with a Google-signed identity token; the route
 * understood only a shared-secret header and a session cookie, so every run was
 * refused. Reminders never fired, SLA breaches were never swept, expired
 * recordings were never deleted and the audit chain was never verified — and a
 * scheduler being refused looks exactly like a scheduler with nothing to do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";

import { authoriseScheduler, schedulerIdentity, secretMatches, verifySchedulerToken } from "@server/core/service-identity";
import { resetJwksCache } from "@server/core/oidc";
import { SCHEDULER_STALE_AFTER_MS, schedulerHealth } from "@server/core/scheduler";
import { audit } from "@server/core/audit";
import { getDb, resetDbForTests } from "@server/db/client";

const AUDIENCE = "https://congovoice.cd/api/v1/workflow/run";
const SERVICE_ACCOUNT = "congovoice-pilot-app@congovoice-pilot.iam.gserviceaccount.com";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
const KID = "test-key";

function sign(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

function schedulerToken(overrides: Record<string, unknown> = {}): string {
  return sign({
    iss: "https://accounts.google.com",
    aud: AUDIENCE,
    sub: "1234567890",
    email: SERVICE_ACCOUNT,
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  });
}

function serveGoogleKeys() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).includes("oauth2/v3/certs")) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("the scheduler's identity token", () => {
  beforeEach(() => {
    resetJwksCache();
    vi.stubEnv("CRON_OIDC_AUDIENCE", AUDIENCE);
    vi.stubEnv("CRON_SERVICE_ACCOUNT", SERVICE_ACCOUNT);
    serveGoogleKeys();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("lets the platform's own scheduler run maintenance", async () => {
    const result = await authoriseScheduler({ authorization: `Bearer ${schedulerToken()}`, cronSecretHeader: null });
    expect(result).toEqual({ ok: true, via: "oidc" });
  });

  it("refuses a token minted for a different endpoint", async () => {
    const token = schedulerToken({ aud: "https://congovoice.cd/api/v1/admin/seed" });
    const result = await verifySchedulerToken(`Bearer ${token}`, { audience: AUDIENCE, serviceAccount: SERVICE_ACCOUNT });
    expect(result).toEqual({ ok: false, reason: "audience_mismatch" });
  });

  it("refuses a token belonging to another service account", async () => {
    const token = schedulerToken({ email: "someone-else@example.iam.gserviceaccount.com" });
    const result = await verifySchedulerToken(`Bearer ${token}`, { audience: AUDIENCE, serviceAccount: SERVICE_ACCOUNT });
    expect(result).toEqual({ ok: false, reason: "wrong_service_account" });
  });

  it("refuses a token from an issuer that is not Google", async () => {
    const token = schedulerToken({ iss: "https://accounts.example.com" });
    const result = await verifySchedulerToken(`Bearer ${token}`, { audience: AUDIENCE, serviceAccount: SERVICE_ACCOUNT });
    expect(result).toEqual({ ok: false, reason: "issuer_mismatch" });
  });

  it("refuses an expired token", async () => {
    const token = schedulerToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    const result = await verifySchedulerToken(`Bearer ${token}`, { audience: AUDIENCE, serviceAccount: SERVICE_ACCOUNT });
    expect(result).toEqual({ ok: false, reason: "token_expired" });
  });

  it("refuses a token whose signature does not match the published key", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: AUDIENCE, email: SERVICE_ACCOUNT, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const forged = `${header}.${payload}.${signer.sign(other.privateKey).toString("base64url")}`;
    const result = await verifySchedulerToken(`Bearer ${forged}`, { audience: AUDIENCE, serviceAccount: SERVICE_ACCOUNT });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("oidc_bad_signature");
  });

  it("refuses a request with no token at all", async () => {
    const result = await verifySchedulerToken(null, { audience: AUDIENCE, serviceAccount: SERVICE_ACCOUNT });
    expect(result).toEqual({ ok: false, reason: "no_bearer_token" });
  });

  it("does not fall open when no scheduler identity is configured", async () => {
    vi.unstubAllEnvs();
    expect(schedulerIdentity()).toBeNull();
    const result = await authoriseScheduler({ authorization: `Bearer ${schedulerToken()}`, cronSecretHeader: null });
    expect(result).toEqual({ ok: false, reason: "no_scheduler_identity_configured" });
  });
});

describe("the shared secret, for hosts without an identity service", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-shared-secret");
    const result = await authoriseScheduler({ authorization: null, cronSecretHeader: "a-long-shared-secret" });
    expect(result).toEqual({ ok: true, via: "secret" });
  });

  it("compares in constant time and refuses a prefix", () => {
    expect(secretMatches("a-long-shared-secret", "a-long-shared-secret")).toBe(true);
    expect(secretMatches("a-long-shared-secre", "a-long-shared-secret")).toBe(false);
    expect(secretMatches("", "a-long-shared-secret")).toBe(false);
    expect(secretMatches("anything", undefined)).toBe(false);
  });

  it("does not treat an unset secret as a match for an absent header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const result = await authoriseScheduler({ authorization: null, cronSecretHeader: null });
    expect(result.ok).toBe(false);
  });
});

describe("a scheduler that stopped arriving is visible", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("is not reported stale while the process is young and has never run", async () => {
    const health = await schedulerHealth(Date.now());
    expect(health.lastRunAt).toBeNull();
    expect(health.ok).toBe(true);
  });

  it("is reported stale when a long-running process has never seen a run", async () => {
    const health = await schedulerHealth(Date.now() - SCHEDULER_STALE_AFTER_MS - 1000);
    expect(health.ok).toBe(false);
  });

  it("is healthy just after a run, and stale once the window passes", async () => {
    await audit({ action: "scheduler.run", actorRole: "system", entityType: "scheduler", systemEvent: "cron" });
    const fresh = await schedulerHealth(Date.now() - 86_400_000);
    expect(fresh.ok).toBe(true);
    expect(fresh.lastRunAt).toBeTruthy();

    const later = await schedulerHealth(Date.now() - 86_400_000, Date.now() + SCHEDULER_STALE_AFTER_MS + 1000);
    expect(later.ok).toBe(false);
    expect(later.staleMs).toBeGreaterThan(SCHEDULER_STALE_AFTER_MS);
  });
});
