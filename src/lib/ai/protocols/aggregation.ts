/**
 * k-anonymity for health aggregates (FR-HE-17).
 * No health figure is ever published for a group smaller than k (default 10).
 */
export const K_ANONYMITY_THRESHOLD = 10;

export interface AggregateBucket {
  key: string;
  count: number;
  [extra: string]: unknown;
}

export interface KAnonymityResult<T extends AggregateBucket> {
  released: T[];
  suppressed: Array<{ key: string; reason: "below_k" }>;
  /** Total of the suppressed buckets, published only when it is itself ≥ k. */
  residual: number | null;
  k: number;
}

/** Splits buckets into those safe to publish and those suppressed for being too small. */
export function applyKAnonymity<T extends AggregateBucket>(buckets: T[], k = K_ANONYMITY_THRESHOLD): KAnonymityResult<T> {
  const released: T[] = [];
  const suppressed: Array<{ key: string; reason: "below_k" }> = [];
  let residual = 0;
  for (const b of buckets) {
    if (b.count >= k) released.push(b);
    else {
      suppressed.push({ key: b.key, reason: "below_k" });
      residual += b.count;
    }
  }
  return { released, suppressed, residual: residual >= k ? residual : null, k };
}

/** True when a single figure may be shown at all. */
export function isPublishable(count: number, k = K_ANONYMITY_THRESHOLD): boolean {
  return count >= k;
}
