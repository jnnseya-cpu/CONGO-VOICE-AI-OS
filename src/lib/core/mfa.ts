/**
 * TOTP multi-factor authentication (RFC 6238 / RFC 4226) for privileged roles.
 *
 * Implemented on node:crypto alone — no new dependency, works offline, and the shared
 * secret never leaves the server. Administrators and supervisors must enrol; step-up
 * verification is additionally required for high-risk actions (severity overrides,
 * identifiable exports, break-glass).
 */
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { forbidden } from "./errors";
import type { Role } from "@/lib/db/schema";
import type { Session } from "./auth";

export const MFA_REQUIRED_ROLES: Role[] = ["gov_admin", "platform_admin"];
export const STEP_UP_WINDOW_MINUTES = 15;
const PERIOD = 30;
const DIGITS = 6;
/** One step of clock drift either side. */
const WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** HOTP (RFC 4226) for a given counter. Counters are unsigned by definition. */
export function hotp(secret: string, counter: number): string {
  if (!Number.isFinite(counter) || counter < 0) throw new RangeError("HOTP counter must be a non-negative integer");
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totp(secret: string, at: Date = new Date()): string {
  return hotp(secret, Math.floor(at.getTime() / 1000 / PERIOD));
}

/** Constant-time verification with ±1 step of tolerance. */
export function verifyTotp(secret: string, token: string, at: Date = new Date()): boolean {
  const candidate = (token ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  const counter = Math.floor(at.getTime() / 1000 / PERIOD);
  for (let drift = -WINDOW; drift <= WINDOW; drift++) {
    if (counter + drift < 0) continue;
    const expected = hotp(secret, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(candidate);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** otpauth:// URI for authenticator applications (rendered as a QR code by the console). */
export function otpauthUri(secret: string, account: string, issuer = "CONGO VOICE AI OS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

export function mfaRequiredFor(role: Role): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

/** Start enrolment: the secret is stored but MFA stays disabled until a code is verified. */
export async function beginEnrolment(userId: string, account: string) {
  const db = await getDb();
  const secret = generateSecret();
  await db.update(schema.users).set({ mfaSecret: secret, mfaEnabled: false }).where(eq(schema.users.id, userId));
  return { secret, otpauthUri: otpauthUri(secret, account) };
}

export interface MfaVerification {
  ok: boolean;
  enabled: boolean;
  verifiedAt: string | null;
  reason?: string;
}

/** Verify a code: completes enrolment the first time, and serves as step-up afterwards. */
export async function verifyCode(userId: string, token: string, at: Date = new Date()): Promise<MfaVerification> {
  const db = await getDb();
  const [u] = await db.select({ mfaSecret: schema.users.mfaSecret, mfaEnabled: schema.users.mfaEnabled, preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.mfaSecret) return { ok: false, enabled: false, verifiedAt: null, reason: "not_enrolled" };
  if (!verifyTotp(u.mfaSecret, token, at)) return { ok: false, enabled: u.mfaEnabled, verifiedAt: null, reason: "invalid_code" };
  const prefs = { ...(u.preferences ?? {}), mfaVerifiedAt: at.toISOString() };
  await db.update(schema.users).set({ mfaEnabled: true, preferences: prefs }).where(eq(schema.users.id, userId));
  return { ok: true, enabled: true, verifiedAt: at.toISOString() };
}

export interface StepUpStatus {
  satisfied: boolean;
  required: boolean;
  reason: "ok" | "not_required" | "not_enrolled" | "expired";
  verifiedAt: string | null;
}

export async function stepUpStatus(userId: string, role: Role, at: Date = new Date()): Promise<StepUpStatus> {
  const db = await getDb();
  const [u] = await db.select({ mfaEnabled: schema.users.mfaEnabled, preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.id, userId));
  const required = mfaRequiredFor(role);
  const verifiedAt = ((u?.preferences ?? {}) as Record<string, unknown>).mfaVerifiedAt as string | undefined;
  if (!u?.mfaEnabled) return { satisfied: !required, required, reason: required ? "not_enrolled" : "not_required", verifiedAt: null };
  const fresh = verifiedAt ? at.getTime() - new Date(verifiedAt).getTime() <= STEP_UP_WINDOW_MINUTES * 60_000 : false;
  return { satisfied: fresh, required: true, reason: fresh ? "ok" : "expired", verifiedAt: verifiedAt ?? null };
}

/**
 * Guard for high-risk actions. Throws 403 when a recent second factor is missing.
 * Roles that are not required to enrol pass through, so a CHW can still work offline.
 */
export async function requireStepUp(session: Session, at: Date = new Date()): Promise<StepUpStatus> {
  const status = await stepUpStatus(session.userId, session.role, at);
  if (!status.satisfied) {
    throw forbidden(
      status.reason === "not_enrolled"
        ? "Double authentification requise : activez-la dans votre profil."
        : "Vérification de sécurité requise : saisissez votre code à 6 chiffres.",
    );
  }
  return status;
}
