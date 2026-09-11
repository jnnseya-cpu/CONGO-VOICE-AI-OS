/**
 * Application-level encryption for the few fields whose exposure in a database
 * dump would be immediately harmful: the TOTP seed that is a second factor, and
 * the raw audio a citizen recorded.
 *
 * This sits on top of, not instead of, transport encryption and whole-disk
 * encryption on the database host. It protects against a leaked backup or a
 * read-only view of a table; it does not protect against an attacker who owns
 * the running server, because the running server must be able to decrypt.
 *
 * Envelope format: `v1.<iv>.<tag>.<ciphertext>`, all base64url. AES-256-GCM,
 * fresh 12-byte IV per value, authentication tag verified on read.
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const VERSION = "v1";
const IV_BYTES = 12;

let cachedRoot: Buffer | null = null;

/** Thrown when a value needs a key the process does not have. */
export class EncryptionUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionUnavailable";
  }
}

function rootKey(): Buffer {
  if (cachedRoot) return cachedRoot;
  const raw = env.dataEncryptionKey;
  if (!raw) {
    if (env.isProd) {
      throw new EncryptionUnavailable(
        "DATA_ENCRYPTION_KEY must be set in production: it protects second-factor seeds and stored recordings",
      );
    }
    // Development and tests: derive from the session secret so the platform runs
    // with no extra setup. Never reached in production, which throws above.
    cachedRoot = Buffer.from(hkdfSync("sha256", Buffer.from(env.sessionSecret ?? "dev-secret"), Buffer.alloc(0), Buffer.from("cvos-dev-data-key"), 32));
    return cachedRoot;
  }
  const key = raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new EncryptionUnavailable("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters, or base64)");
  }
  cachedRoot = key;
  return cachedRoot;
}

/**
 * One key per purpose, derived from the root. A seed key that leaks cannot read
 * recordings, and rotating the root rotates every purpose at once.
 */
function purposeKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", rootKey(), Buffer.alloc(0), Buffer.from(`cvos:${purpose}`), 32));
}

export function encryptValue(plaintext: string, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", purposeKey(purpose), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptValue(envelope: string, purpose: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new EncryptionUnavailable("Unrecognised ciphertext envelope");
  const decipher = createDecipheriv("aes-256-gcm", purposeKey(purpose), Buffer.from(parts[1], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}

/**
 * Reads a column that may still hold a plaintext value written before
 * encryption was introduced, so a deployment upgrades without a migration
 * window. Values are re-encrypted on next write.
 */
export function decryptIfEncrypted(value: string | null | undefined, purpose: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return isEncrypted(value) ? decryptValue(value, purpose) : value;
}

export function encryptBytes(plaintext: Buffer, purpose: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", purposeKey(purpose), iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  // magic | version | iv | tag | ciphertext
  return Buffer.concat([Buffer.from("CVOS1"), iv, cipher.getAuthTag(), body]);
}

export function decryptBytes(envelope: Buffer, purpose: string): Buffer {
  if (envelope.length < 5 + IV_BYTES + 16 || envelope.subarray(0, 5).toString() !== "CVOS1") {
    throw new EncryptionUnavailable("Unrecognised ciphertext container");
  }
  const iv = envelope.subarray(5, 5 + IV_BYTES);
  const tag = envelope.subarray(5 + IV_BYTES, 5 + IV_BYTES + 16);
  const decipher = createDecipheriv("aes-256-gcm", purposeKey(purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(envelope.subarray(5 + IV_BYTES + 16)), decipher.final()]);
}

export function looksEncryptedBytes(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString() === "CVOS1";
}

/**
 * Deterministic keyed digest, for looking a value up without storing it in the
 * clear. Not reversible; equal inputs give equal outputs, which is the point
 * and also the limit — it leaks equality, nothing more.
 */
export function blindIndex(value: string, purpose: string): string {
  return createHmac("sha256", purposeKey(`index:${purpose}`)).update(value.trim().toLowerCase()).digest("base64url");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
