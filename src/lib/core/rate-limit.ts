/**
 * Sliding-window rate limiter. In-memory per instance; swap `store` for Redis
 * when running several instances (interface intentionally minimal).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, max: number, windowSeconds: number, now = Date.now()): RateLimitResult {
  const windowMs = windowSeconds * 1000;
  const since = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > since);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return { allowed: false, remaining: 0, resetAt: hits[0] + windowMs };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) {
    // crude memory guard
    for (const [k, v] of buckets) if (v.every((t) => t <= since)) buckets.delete(k);
  }
  return { allowed: true, remaining: max - hits.length, resetAt: now + windowMs };
}

export function resetRateLimits() {
  buckets.clear();
}
