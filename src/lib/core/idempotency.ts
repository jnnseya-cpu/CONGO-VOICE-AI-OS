/**
 * Exactly-once acceptance for mutating endpoints and offline replay.
 *
 * The client sends `Idempotency-Key`; the first request runs the work and its response is
 * stored, and every replay of the same key returns that stored response instead of running
 * the work twice. This is what makes the offline queue safe: a voice note queued on a phone
 * with no network can be retried as often as the service worker likes.
 */
import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

export interface IdempotentOutcome<T> {
  result: T;
  /** True when the stored response of an earlier identical request was returned. */
  replayed: boolean;
}

export class IdempotencyConflict extends Error {
  constructor(message = "Idempotency key reused with a different request") {
    super(message);
    this.name = "IdempotencyConflict";
  }
}

export function requestHash(payload: unknown): string {
  return createHash("sha256").update(typeof payload === "string" ? payload : JSON.stringify(payload ?? null)).digest("hex").slice(0, 64);
}

/**
 * Runs `fn` at most once per (key, user). The result must be JSON-serialisable: it is
 * stored and replayed verbatim.
 *
 * - unknown key            → claim it, run `fn`, store the result
 * - known key, same body   → return the stored result (`replayed: true`)
 * - known key, in flight   → IdempotencyConflict (the caller may retry)
 * - known key, other body  → IdempotencyConflict
 */
export async function withIdempotency<T>(
  key: string | null | undefined,
  userId: string | null,
  fn: () => Promise<T>,
  options: { requestHash?: string; status?: number } = {},
): Promise<IdempotentOutcome<T>> {
  if (!key) return { result: await fn(), replayed: false };
  const db = await getDb();
  const scoped = `${userId ?? "anon"}:${key}`.slice(0, 160);
  const hash = options.requestHash ?? null;

  const claimed = await db
    .insert(schema.idempotencyKeys)
    .values({ key: scoped, userId, requestHash: hash })
    .onConflictDoNothing()
    .returning();

  if (claimed.length === 0) {
    const [existing] = await db.select().from(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, scoped));
    if (!existing) throw new IdempotencyConflict();
    if (hash && existing.requestHash && existing.requestHash !== hash) throw new IdempotencyConflict();
    if (existing.responseBody === null || existing.responseBody === undefined) {
      throw new IdempotencyConflict("A request with this key is still being processed");
    }
    return { result: existing.responseBody as T, replayed: true };
  }

  try {
    const result = await fn();
    await db
      .update(schema.idempotencyKeys)
      .set({ responseStatus: options.status ?? 200, responseBody: result as Record<string, unknown> })
      .where(eq(schema.idempotencyKeys.key, scoped));
    return { result, replayed: false };
  } catch (err) {
    // Failed work must not poison the key: drop the claim so a retry can succeed.
    await db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, scoped));
    throw err;
  }
}
