/**
 * Sign-in lockout.
 *
 * A PIN is short by design: a citizen has to key it in on a feature phone. That
 * makes the number of guesses, not the length of the secret, the thing standing
 * between an attacker and an account. Counting failures per account and per
 * address, and locking with a doubling delay, is what makes a four-digit PIN
 * defensible at all.
 */
import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { schema, type Database } from "@server/db/client";
import { env } from "./env";

export interface LockoutState {
  locked: boolean;
  /** Seconds until the next attempt is accepted. */
  retryAfterSeconds: number;
  failures: number;
}

const open: LockoutState = { locked: false, retryAfterSeconds: 0, failures: 0 };

function subjectKey(kind: "phone" | "ip", value: string): string {
  return `${kind}:${value}`.slice(0, 160);
}

/** How long a lockout lasts: the base delay, doubling for each burst beyond the first, capped at a day. */
export function lockoutDuration(failures: number): number {
  const bursts = Math.max(0, Math.floor((failures - 1) / env.auth.maxFailures));
  return Math.min(86_400, env.auth.lockoutSeconds * 2 ** bursts);
}

export async function checkLockout(db: Database, kind: "phone" | "ip", value: string, now = new Date()): Promise<LockoutState> {
  if (!value) return open;
  const [row] = await db.select().from(schema.authAttempts).where(eq(schema.authAttempts.subject, subjectKey(kind, value)));
  if (!row?.lockedUntil) return { locked: false, retryAfterSeconds: 0, failures: row?.failures ?? 0 };
  const remaining = Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000);
  if (remaining <= 0) return { locked: false, retryAfterSeconds: 0, failures: row.failures };
  return { locked: true, retryAfterSeconds: remaining, failures: row.failures };
}

/** Records a failure and returns the state that now applies. */
export async function recordFailure(db: Database, kind: "phone" | "ip", value: string, now = new Date()): Promise<LockoutState> {
  if (!value) return open;
  const subject = subjectKey(kind, value);
  const [row] = await db
    .insert(schema.authAttempts)
    .values({ subject, failures: 1, firstFailureAt: now, lastFailureAt: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: schema.authAttempts.subject,
      set: { failures: sql`${schema.authAttempts.failures} + 1`, lastFailureAt: now },
    })
    .returning();
  const failures = row?.failures ?? 1;
  if (failures % env.auth.maxFailures !== 0) return { locked: false, retryAfterSeconds: 0, failures };

  const seconds = lockoutDuration(failures);
  const lockedUntil = new Date(now.getTime() + seconds * 1000);
  await db.update(schema.authAttempts).set({ lockedUntil }).where(eq(schema.authAttempts.subject, subject));
  return { locked: true, retryAfterSeconds: seconds, failures };
}

/** Clears the counter after a successful sign-in. */
export async function clearFailures(db: Database, kind: "phone" | "ip", value: string): Promise<void> {
  if (!value) return;
  await db.delete(schema.authAttempts).where(eq(schema.authAttempts.subject, subjectKey(kind, value)));
}

/** Drops counters that have been quiet and unlocked for a while. Called by the scheduler. */
export async function pruneAuthAttempts(db: Database, olderThanMs = 86_400_000, now = Date.now()): Promise<number> {
  const cutoff = new Date(now - olderThanMs);
  const rows = await db
    .delete(schema.authAttempts)
    .where(and(lt(schema.authAttempts.lastFailureAt, cutoff), sql`(${schema.authAttempts.lockedUntil} is null or ${schema.authAttempts.lockedUntil} < ${new Date(now)})`))
    .returning();
  return rows.length;
}

/**
 * Rejects codes that appear in every attacker's first hundred guesses, and
 * obvious runs.
 *
 * "PIN" is the name a citizen sees and four digits is the ordinary case, but
 * the credential is not required to be numeric: the bootstrap endpoint takes
 * six to twelve characters of anything, so a platform administrator's code can
 * contain letters. Every check here used to assume digits, which meant they all
 * quietly passed over exactly the account that matters most — "aaaaaa" and
 * "abcdef" were accepted for the one account that can read the whole directory
 * and create every other account, while "111111" and "123456" were refused.
 *
 * The run and repetition tests now work on code points rather than on digits,
 * so they catch a run of letters the same way they catch a run of numbers.
 */
export function isWeakPin(pin: string): boolean {
  if (env.auth.forbiddenPins.includes(pin)) return true;
  if (env.auth.forbiddenPins.includes(pin.toLowerCase())) return true;
  // One character repeated, whatever the character is.
  if (/^(.)\1+$/.test(pin)) return true;
  // A run in either direction: 1234, 4321, abcd, dcba.
  const points = [...pin].map((c) => c.toLowerCase().codePointAt(0) ?? 0);
  if (points.length > 1 && points.every((c, i) => i === 0 || c === points[i - 1] + 1)) return true;
  if (points.length > 1 && points.every((c, i) => i === 0 || c === points[i - 1] - 1)) return true;
  return false;
}
