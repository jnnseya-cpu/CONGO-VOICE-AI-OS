/**
 * Session management: stateless, HMAC-signed cookies. PINs are hashed with scrypt.
 */
import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "./env";
import type { Role, LanguageCode } from "@server/db/schema";

export const SESSION_COOKIE = "cvai_session";

export interface Session {
  userId: string;
  role: Role;
  language: LanguageCode;
  name?: string | null;
  province?: string | null;
  anonymous: boolean;
  /** Issued at, in milliseconds. Compared against the account's session epoch so a signed token can be revoked. */
  iat: number;
  exp: number;
}

const globalSecret = globalThis as unknown as { __cvaiSecret?: string };
function secret(): string {
  if (env.sessionSecret) return env.sessionSecret;
  if (env.isProd) throw new Error("SESSION_SECRET must be set in production");
  if (globalSecret.__cvaiSecret) return globalSecret.__cvaiSecret;
  if (env.isTest) return (globalSecret.__cvaiSecret = "test-secret");
  // Development: persist a generated secret so sessions survive server restarts.
  const file = path.resolve(process.cwd(), env.dataDir, ".session-secret");
  try {
    globalSecret.__cvaiSecret = fs.readFileSync(file, "utf8").trim();
  } catch {
    const generated = randomBytes(32).toString("hex");
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, generated, { mode: 0o600 });
    } catch {
      /* read-only filesystem: fall back to an in-memory secret */
    }
    globalSecret.__cvaiSecret = generated;
  }
  return globalSecret.__cvaiSecret;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(session: Omit<Session, "exp" | "iat">, now = Date.now()): string {
  const exp = now + env.sessionTtlHours * 3600 * 1000;
  const payload = b64(JSON.stringify({ ...session, iat: now, exp }));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(unb64(payload)) as Session;
    if (!parsed.userId || !parsed.role || parsed.exp < Date.now()) return null;
    // Tokens minted before `iat` existed are treated as issued at the start of
    // their own lifetime, so they expire normally rather than being revoked en masse.
    if (typeof parsed.iat !== "number") parsed.iat = parsed.exp - env.sessionTtlHours * 3600 * 1000;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: NextRequest): Session | null {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return decodeSession(bearer.slice(7));
  return decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** For server components / server actions. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProd,
    path: "/",
    maxAge: env.sessionTtlHours * 3600,
  };
}

/**
 * PIN hashing. The cost is written into the stored value, so raising it later
 * does not invalidate the PINs already set: an old hash keeps verifying at the
 * cost it was created with, and is rewritten at the new cost on next change.
 *
 * Format: `scrypt$<N>$<salt hex>$<hash hex>`. The original `salt:hash` form is
 * still accepted and read at the cost that produced it.
 */
const LEGACY_COST = 16384;

function derive(pin: string, salt: string, cost: number): Buffer {
  // 128 * N * r bytes are needed; the default 32 MB ceiling is too low above N=16384.
  return scryptSync(pin, salt, 32, { N: cost, r: 8, p: 1, maxmem: 256 * cost * 8 });
}

export function hashPin(pin: string, cost = env.auth.scryptCost): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${cost}$${salt}$${derive(pin, salt, cost).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  let salt: string, hash: string, cost: number;
  if (stored.startsWith("scrypt$")) {
    const [, n, s, h] = stored.split("$");
    cost = Number(n);
    salt = s;
    hash = h;
    if (!Number.isFinite(cost) || !salt || !hash) return false;
  } else {
    [salt, hash] = stored.split(":");
    cost = LEGACY_COST;
    if (!salt || !hash) return false;
  }
  const candidate = derive(pin, salt, cost);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** True when a stored hash was made at a lower cost than the one now configured. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!stored.startsWith("scrypt$")) return true;
  return Number(stored.split("$")[1]) < env.auth.scryptCost;
}
