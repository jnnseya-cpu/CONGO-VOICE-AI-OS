/**
 * Session management: stateless, HMAC-signed cookies. PINs are hashed with scrypt.
 */
import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "./env";
import type { Role, LanguageCode } from "@/lib/db/schema";

export const SESSION_COOKIE = "cvai_session";

export interface Session {
  userId: string;
  role: Role;
  language: LanguageCode;
  name?: string | null;
  province?: string | null;
  anonymous: boolean;
  exp: number;
}

const globalSecret = globalThis as unknown as { __cvaiSecret?: string };
function secret(): string {
  if (env.sessionSecret) return env.sessionSecret;
  if (env.isProd) throw new Error("SESSION_SECRET must be set in production");
  return (globalSecret.__cvaiSecret ??= randomBytes(32).toString("hex"));
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(session: Omit<Session, "exp">): string {
  const exp = Date.now() + env.sessionTtlHours * 3600 * 1000;
  const payload = b64(JSON.stringify({ ...session, exp }));
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

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
