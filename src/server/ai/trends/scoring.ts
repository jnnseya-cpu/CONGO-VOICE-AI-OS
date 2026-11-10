/**
 * Détection et notation des tendances — Trend Intelligence §5 et §17.
 *
 * Pure functions, no I/O, no model. The specification makes this the
 * deterministic half of the engine on purpose: its §4 gives the trend reader
 * "read only, deterministic calculations", and its §5 ends with "model
 * certainty is excluded".
 *
 * That rule is already this platform's: CLAUDE.md says risk thresholds and
 * escalation are code and config, never model judgement. A model may label an
 * intent or explain evidence here; it never moves a score and it never decides
 * what may happen next.
 *
 * Every threshold is a starting value the specification marks adjustable and
 * requires to be calibrated against labelled historical cases before release.
 * They are named constants so that calibration is a visible change.
 */
import "server-only";

/* ── Detection gates (§5.3) ─────────────────────────────────────────────── */

/** "Initial count-feed gate is c >= 20 and z >= 2, both adjustable." */
export const DEFAULT_MIN_COUNT = 20;
export const DEFAULT_MIN_Z = 2;

/** `max(1.4826 × MAD(log1p(x)), 0.2)` — the floor stops a flat history turning a trivial movement into a large z. */
export const MAD_SCALE = 1.4826;
export const MIN_DEVIATION = 0.2;

/** "With fewer than four comparable periods, label insufficient history and keep draft-only." */
export const MIN_COMPARABLE_PERIODS = 4;

/* ── Weights (§5.4, §5.5) ───────────────────────────────────────────────── */

export const OPPORTUNITY_WEIGHTS = {
  demand: 0.25,
  fit: 0.25,
  intent: 0.2,
  timing: 0.15,
  readiness: 0.15,
} as const;

export const CONFIDENCE_WEIGHTS = {
  sourceQuality: 0.35,
  corroboration: 0.25,
  coverage: 0.2,
  freshness: 0.2,
} as const;

/**
 * "As a starting rule, cap a single source family at 69."
 *
 * Load-bearing: 69 is below the 75 a reviewable brief needs, so a single family
 * can never on its own cause the platform to act. One report of a symptom in
 * one village is a reason to watch, not a reason to brief every agent.
 */
export const SINGLE_FAMILY_CONFIDENCE_CAP = 69;

/* ── Decision thresholds (§5 table) ─────────────────────────────────────── */

export const ARCHIVE_SCORE_BELOW = 60;
export const ARCHIVE_CONFIDENCE_BELOW = 55;
export const BRIEF_SCORE_AT_LEAST = 75;
export const BRIEF_CONFIDENCE_AT_LEAST = 75;
export const AUTO_SCORE_AT_LEAST = 85;
export const AUTO_CONFIDENCE_AT_LEAST = 85;

export type TrendDecision = "archive" | "watch" | "reviewable_brief" | "auto_eligible";

/**
 * §5.4 hard vetoes. Any one blocks activation outright, whatever the score.
 *
 * `unsupported_claim` and `restricted_topic` are where this engine meets the
 * platform's own rule that no answer may make a clinical claim outside approved
 * protocol text.
 */
export type TrendVeto =
  | "out_of_market"
  | "unsupported_claim"
  | "restricted_topic"
  | "unavailable_capacity"
  | "illegal_targeting"
  | "insufficient_history"
  | "missing_readiness";

export interface OpportunityComponents {
  /** Derived from calibrated source scores (§5.4). */
  demand: number;
  /** Module, territory and audience match against the platform profile. */
  fit: number;
  /** Explicit behaviour and taxonomy, not inferred eagerness. */
  intent: number;
  /** How much of the actionable window remains. */
  timing: number;
  /**
   * Approved content, staffed responders, available capacity.
   *
   * On this platform readiness is not stock. It is whether a protocol version
   * is signed, whether a responder exists in the territory, and whether an
   * alert channel can actually reach them — the same question §13.3 of the
   * AI-OS set calls the platform's conscience.
   */
  readiness: number;
}

export interface ConfidenceComponents {
  sourceQuality: number;
  corroboration: number;
  coverage: number;
  freshness: number;
}

export interface ScoringResult {
  opportunity: number;
  confidence: number;
  decision: TrendDecision;
  vetoes: TrendVeto[];
  reasons: string[];
  independentFamilies: number;
}

function assertRange(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${name} doit être compris entre 0 et 100 (reçu : ${value})`);
  }
}

/** `lift = ln((c+1)/(b+1))` — §5.3. */
export function logLift(current: number, baselineMedian: number): number {
  return Math.log((current + 1) / (baselineMedian + 1));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * `z = (log1p(c) − median(log1p(x))) / max(1.4826 × MAD(log1p(x)), 0.2)`.
 *
 * A median absolute deviation rather than a standard deviation, because one
 * campaign — or one radio broadcast telling a province to call the line —
 * would otherwise inflate the denominator and hide the next real movement.
 */
export function robustZ(current: number, history: number[]): number {
  if (history.length === 0) return 0;
  const logs = history.map((x) => Math.log1p(x));
  const centre = median(logs);
  const mad = median(logs.map((v) => Math.abs(v - centre)));
  const deviation = Math.max(MAD_SCALE * mad, MIN_DEVIATION);
  return (Math.log1p(current) - centre) / deviation;
}

export function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

/** §17: "Reference fixture mapping for count feeds is clamp(50 + 10 × z, 0, 100)". */
export function demandFromZ(z: number): number {
  return clamp(50 + 10 * z);
}

/** Both §5.3 gates. Never apply these to an indexed or ranked feed. */
export function countFeedPassesGates(
  current: number,
  history: number[],
  options: { minCount?: number; minZ?: number } = {},
): boolean {
  const minCount = options.minCount ?? DEFAULT_MIN_COUNT;
  const minZ = options.minZ ?? DEFAULT_MIN_Z;
  if (history.length < MIN_COMPARABLE_PERIODS) return false;
  return current >= minCount && robustZ(current, history) >= minZ;
}

/** 0–100, full precision. §17: "round only for display". */
export function opportunityScore(c: OpportunityComponents): number {
  assertRange("demand", c.demand);
  assertRange("fit", c.fit);
  assertRange("intent", c.intent);
  assertRange("timing", c.timing);
  assertRange("readiness", c.readiness);
  return (
    c.demand * OPPORTUNITY_WEIGHTS.demand +
    c.fit * OPPORTUNITY_WEIGHTS.fit +
    c.intent * OPPORTUNITY_WEIGHTS.intent +
    c.timing * OPPORTUNITY_WEIGHTS.timing +
    c.readiness * OPPORTUNITY_WEIGHTS.readiness
  );
}

/**
 * 0–100, with the single-family cap applied last.
 *
 * `independentFamilies` counts families genuinely independent and relevant to
 * the same topic, territory and time. §3 limits syndicated stories, mirrors and
 * amendments to one family between them; §17 excludes context-only sources from
 * satisfying corroboration at all.
 */
export function confidenceScore(c: ConfidenceComponents, independentFamilies: number): number {
  assertRange("sourceQuality", c.sourceQuality);
  assertRange("corroboration", c.corroboration);
  assertRange("coverage", c.coverage);
  assertRange("freshness", c.freshness);
  const raw =
    c.sourceQuality * CONFIDENCE_WEIGHTS.sourceQuality +
    c.corroboration * CONFIDENCE_WEIGHTS.corroboration +
    c.coverage * CONFIDENCE_WEIGHTS.coverage +
    c.freshness * CONFIDENCE_WEIGHTS.freshness;
  return independentFamilies <= 1 ? Math.min(raw, SINGLE_FAMILY_CONFIDENCE_CAP) : raw;
}

/** §17's reproducible corroboration ladder: 0 for one family, 80 for two, 100 for three or more. */
export function corroborationFor(independentFamilies: number): number {
  if (independentFamilies >= 3) return 100;
  if (independentFamilies === 2) return 80;
  return 0;
}

/**
 * The §5 threshold table, in its stated order.
 *
 * A veto cannot be out-scored: it collapses the result to `watch`, so the topic
 * stays visible and reopenable rather than being silently archived.
 */
export function decide(
  opportunity: number,
  confidence: number,
  options: { vetoes?: TrendVeto[]; autoOptIn?: boolean } = {},
): TrendDecision {
  const vetoes = options.vetoes ?? [];
  if (opportunity < ARCHIVE_SCORE_BELOW || confidence < ARCHIVE_CONFIDENCE_BELOW) return "archive";
  if (vetoes.length > 0) return "watch";
  if (
    options.autoOptIn === true &&
    opportunity >= AUTO_SCORE_AT_LEAST &&
    confidence >= AUTO_CONFIDENCE_AT_LEAST
  ) {
    return "auto_eligible";
  }
  if (opportunity >= BRIEF_SCORE_AT_LEAST && confidence >= BRIEF_CONFIDENCE_AT_LEAST) {
    return "reviewable_brief";
  }
  return "watch";
}

export interface ScoreInput {
  components: OpportunityComponents;
  confidence: ConfidenceComponents;
  independentFamilies: number;
  vetoes?: TrendVeto[];
  autoOptIn?: boolean;
  comparablePeriods?: number;
}

export function score(input: ScoreInput): ScoringResult {
  const collected: TrendVeto[] = [...(input.vetoes ?? [])];
  const reasons: string[] = [];

  // §5.4: "Missing readiness blocks activation." Here that means no signed
  // protocol, no responder, or no channel that could carry the alert.
  if (input.components.readiness <= 0) {
    collected.push("missing_readiness");
    reasons.push(
      "Préparation nulle : contenu approuvé, responsable ou canal d'alerte manquant.",
    );
  }

  const periods = input.comparablePeriods ?? MIN_COMPARABLE_PERIODS;
  if (periods < MIN_COMPARABLE_PERIODS) {
    collected.push("insufficient_history");
    reasons.push(
      `Historique insuffisant : ${periods} période(s) comparables sur ${MIN_COMPARABLE_PERIODS} requises.`,
    );
  }

  const opportunity = opportunityScore(input.components);
  const confidence = confidenceScore(input.confidence, input.independentFamilies);

  if (input.independentFamilies <= 1) {
    reasons.push(
      `Source unique : confiance plafonnée à ${SINGLE_FAMILY_CONFIDENCE_CAP}, en dessous du seuil de ${BRIEF_CONFIDENCE_AT_LEAST}.`,
    );
  }

  const vetoes = [...new Set(collected)];
  return {
    opportunity,
    confidence,
    decision: decide(opportunity, confidence, { vetoes, autoOptIn: input.autoOptIn }),
    vetoes,
    reasons,
    independentFamilies: input.independentFamilies,
  };
}

/** True only when the result may become a live change. */
export function mayActivate(result: ScoringResult): boolean {
  return (
    result.vetoes.length === 0 &&
    (result.decision === "reviewable_brief" || result.decision === "auto_eligible")
  );
}

export interface FamilyObservation {
  sourceFamily: string;
  sourceId: string;
  demand: number;
  weight?: number;
  /** §17: context cannot corroborate. Pageviews are attention, not need. */
  contextOnly?: boolean;
  /** §3: a stale source gives dated context, never a fresh action. */
  stale?: boolean;
}

/**
 * §17: "the median of the highest-weight valid observation per independent
 * source family … deterministic tie-break by source ID".
 */
export function demandComponent(observations: FamilyObservation[]): number {
  const best = new Map<string, FamilyObservation>();
  for (const obs of observations) {
    if (obs.stale === true) continue;
    const held = best.get(obs.sourceFamily);
    if (held === undefined) {
      best.set(obs.sourceFamily, obs);
      continue;
    }
    const obsWeight = obs.weight ?? 1;
    const heldWeight = held.weight ?? 1;
    if (obsWeight > heldWeight || (obsWeight === heldWeight && obs.sourceId > held.sourceId)) {
      best.set(obs.sourceFamily, obs);
    }
  }
  if (best.size === 0) return 0;
  return median([...best.values()].map((o) => o.demand));
}

/** Families that may satisfy corroboration: neither context-only nor stale. */
export function independentFamilyCount(observations: FamilyObservation[]): number {
  return new Set(
    observations.filter((o) => o.contextOnly !== true && o.stale !== true).map((o) => o.sourceFamily),
  ).size;
}
