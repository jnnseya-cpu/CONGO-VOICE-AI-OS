import "server-only";

/**
 * A value recomputed at most once every interval, per instance.
 *
 * The public landing page was rendering per request and running database
 * aggregates for every anonymous visitor, including every crawler: measured at
 * 28 requests a second on one instance, with p95 reaching 3.8 seconds at fifty
 * concurrent readers. The front door of a national programme is the one page a
 * press mention points at, and it was also an unauthenticated path straight to
 * Cloud SQL.
 *
 * Deliberately per-instance and in-memory rather than a shared cache: the values
 * are "how many people used the service today", each instance recomputing once a
 * minute is cheap and correct, and introducing a shared cache would add a
 * dependency that can fail in front of the public page it is meant to protect.
 *
 * A failed recomputation keeps serving the previous value rather than throwing:
 * a stale visitor count is better than a broken home page.
 */
export function ttlMemo<T>(load: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let value: T | undefined;
  let loadedAt = 0;
  let inFlight: Promise<T> | null = null;

  return async () => {
    const fresh = value !== undefined && Date.now() - loadedAt < ttlMs;
    if (fresh) return value as T;
    // One recomputation at a time: fifty concurrent readers arriving on a cold
    // instance must not become fifty identical aggregate queries.
    if (inFlight) return inFlight;
    inFlight = load()
      .then((next) => {
        value = next;
        loadedAt = Date.now();
        return next;
      })
      .catch((err) => {
        if (value !== undefined) {
          console.warn("[memo] recomputation failed, serving the previous value", err instanceof Error ? err.message : err);
          return value as T;
        }
        throw err;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
