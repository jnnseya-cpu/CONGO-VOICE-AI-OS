/**
 * Proving that a request came from the platform's own scheduler.
 *
 * Cloud Scheduler calls `/api/v1/workflow/run` every five minutes with a
 * Google-signed identity token in the Authorization header — not a session
 * cookie and not a shared secret. Before this existed the route understood
 * neither, so it answered 401 to every run: reminders never fired, SLA breaches
 * were never swept, expired recordings were never deleted and the audit chain
 * was never verified. Nothing surfaced it, because a scheduler being refused
 * looks exactly like a scheduler that has nothing to do.
 *
 * A shared secret in the job definition would also have worked and is still
 * accepted (a cron job on a VM has nothing else). An identity token is better
 * where it is available: it is short-lived, it is bound to the URL it was
 * minted for, and there is no long-lived value sitting in a job config for
 * somebody to read.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { verifySignedJwt } from "./oidc";

/** Google's published signing keys for identity tokens. */
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface SchedulerIdentity {
  audience: string;
  serviceAccount: string;
}

/**
 * Configured only where a scheduler actually calls in. Absent, the OIDC path is
 * simply not offered — it does not fall open.
 */
export function schedulerIdentity(): SchedulerIdentity | null {
  const audience = process.env.CRON_OIDC_AUDIENCE?.trim();
  const serviceAccount = process.env.CRON_SERVICE_ACCOUNT?.trim();
  if (!audience || !serviceAccount) return null;
  return { audience, serviceAccount };
}

export type SchedulerAuthResult = { ok: true; via: "oidc" | "secret" } | { ok: false; reason: string };

/** Constant-time string comparison, so a shared secret cannot be guessed a character at a time. */
export function secretMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verifies a Google identity token minted for this endpoint by this platform's
 * own service account. Signature, issuer, audience, expiry, and who it belongs
 * to — a token that is validly signed but minted for something else is not an
 * authorisation to run maintenance here.
 */
export async function verifySchedulerToken(
  authorization: string | null,
  identity: SchedulerIdentity,
  now: number = Date.now(),
): Promise<SchedulerAuthResult> {
  if (!authorization?.startsWith("Bearer ")) return { ok: false, reason: "no_bearer_token" };
  const token = authorization.slice(7).trim();
  try {
    const claims = await verifySignedJwt(token, GOOGLE_JWKS);
    if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) return { ok: false, reason: "issuer_mismatch" };
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(identity.audience)) return { ok: false, reason: "audience_mismatch" };
    if (!claims.exp || claims.exp * 1000 <= now) return { ok: false, reason: "token_expired" };
    if (claims.email !== identity.serviceAccount) return { ok: false, reason: "wrong_service_account" };
    if (claims.email_verified === false) return { ok: false, reason: "email_not_verified" };
    return { ok: true, via: "oidc" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "verification_failed" };
  }
}

/**
 * The whole decision for the maintenance endpoint: an identity token from the
 * scheduler, or the shared secret, or a signed-in platform administrator.
 */
export async function authoriseScheduler(input: {
  authorization: string | null;
  cronSecretHeader: string | null;
  now?: number;
}): Promise<SchedulerAuthResult> {
  if (secretMatches(input.cronSecretHeader, process.env.CRON_SECRET)) return { ok: true, via: "secret" };
  const identity = schedulerIdentity();
  if (!identity) return { ok: false, reason: "no_scheduler_identity_configured" };
  return verifySchedulerToken(input.authorization, identity, input.now ?? Date.now());
}
