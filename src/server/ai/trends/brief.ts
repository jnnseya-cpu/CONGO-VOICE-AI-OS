/**
 * Le brief d'orientation — Trend Intelligence §6 and Appendix A.
 *
 * One versioned, time-limited, approved object that changes what the
 * platform's existing agents prioritise at run time. §1: "Existing agent roles,
 * permission boundaries, product facts and brand policy remain authoritative."
 *
 * On this platform that sentence has teeth. A brief may reorder what the health
 * agent attends to; it may never widen what the health agent is allowed to say.
 * Approved protocol text, danger signs, severity thresholds and escalation
 * stay where they are, in code and in signed protocol versions, and a brief
 * cannot reach any of them.
 *
 * The schema below is Appendix A, field for field, with `additionalProperties:
 * false` enforced by a strict zod object. Agents must treat it as closed.
 */
import "server-only";
import { z } from "zod";

import { BRIEF_CHANNELS, type BriefChannel } from "./channels";

/** Appendix A `$defs.id`. */
const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, "identifiant non conforme");

/** Appendix A `$defs.score`. */
const ScoreSchema = z.number().min(0).max(100);

/** Appendix A `$defs.utc`: RFC 3339 and must end in Z. */
const UtcSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    "horodatage UTC attendu, terminé par Z",
  );

const ShortTextSchema = z.string().min(1).max(500);

const IdListSchema = z.array(IdSchema).max(64).refine(
  (list) => new Set(list).size === list.length,
  "identifiants en double",
);

/**
 * The Growth Brief, v1.
 *
 * `.strict()` is the zod equivalent of `additionalProperties: false`. It is not
 * a nicety: §8 requires that "the executor interprets only validated typed
 * actions", and an unexpected field is how a model smuggles one in.
 */
export const GrowthBriefV1 = z
  .object({
    schema_version: z.literal(1),
    brief_id: IdSchema,
    brief_version: z.number().int().min(1),
    tenant_id: IdSchema,
    platform_id: IdSchema,
    market: z.string().regex(/^[A-Z]{2}$/, "code pays ISO alpha-2 attendu"),
    locale: z.string().min(2).max(35),
    topic_id: IdSchema,
    opportunity_score: ScoreSchema,
    confidence: ScoreSchema,
    valid_from: UtcSchema,
    expires_at: UtcSchema,
    evidence_ids: IdListSchema.min(1),
    audience: ShortTextSchema,
    intent: ShortTextSchema,
    approved_claim_ids: IdListSchema,
    cta_id: IdSchema,
    allowed_channels: z
      .array(z.enum(BRIEF_CHANNELS))
      .min(1)
      .max(6)
      .refine((list) => new Set(list).size === list.length, "canaux en double"),
    prohibited_claims: z
      .array(ShortTextSchema)
      .max(32)
      .refine((list) => new Set(list).size === list.length, "interdictions en double"),
    objective: ShortTextSchema,
    experiment_id: IdSchema,
    policy_version: z.number().int().min(1),
  })
  .strict();

export type GrowthBrief = z.infer<typeof GrowthBriefV1>;

/**
 * Appendix A: "Runtime rules beyond JSON Schema … A schema-valid object can
 * still fail these checks."
 *
 * Each is a separate failure with its own message, because "brief invalide"
 * tells an operator nothing about which of six things went wrong.
 */
export type BriefRuntimeFailure =
  | "window_inverted"
  | "not_yet_valid"
  | "expired"
  | "market_not_installed"
  | "locale_not_installed"
  | "channel_not_in_brief"
  | "policy_mismatch";

export interface BriefRuntimeContext {
  now: Date;
  /** The markets this installation serves. ZZ never matches a country lookup. */
  installedMarkets: readonly string[];
  installedLocales: readonly string[];
  activePolicyVersion: number;
  /** The channel the caller is resolving for, when it is resolving for one. */
  channel?: BriefChannel;
}

export interface BriefRuntimeResult {
  ok: boolean;
  failures: BriefRuntimeFailure[];
  messagesFr: string[];
}

/** Appendix A reserves ZZ for explicitly global, non-country-targeted briefs. */
export const GLOBAL_MARKET = "ZZ";

export function checkBriefRuntimeRules(
  brief: GrowthBrief,
  context: BriefRuntimeContext,
): BriefRuntimeResult {
  const failures: BriefRuntimeFailure[] = [];
  const messagesFr: string[] = [];

  const from = Date.parse(brief.valid_from);
  const until = Date.parse(brief.expires_at);
  const now = context.now.getTime();

  if (!(from < until)) {
    failures.push("window_inverted");
    messagesFr.push("La date de début doit précéder la date d'expiration.");
  }
  if (now < from) {
    failures.push("not_yet_valid");
    messagesFr.push("Le brief n'est pas encore en vigueur.");
  }
  if (now >= until) {
    failures.push("expired");
    messagesFr.push("Le brief a expiré.");
  }

  // "ZZ never matches a country-targeted lookup by default."
  if (brief.market !== GLOBAL_MARKET && !context.installedMarkets.includes(brief.market)) {
    failures.push("market_not_installed");
    messagesFr.push(`Le marché ${brief.market} n'est pas installé.`);
  }
  if (!context.installedLocales.includes(brief.locale)) {
    failures.push("locale_not_installed");
    messagesFr.push(`La langue ${brief.locale} n'est pas installée.`);
  }
  if (context.channel !== undefined && !brief.allowed_channels.includes(context.channel)) {
    failures.push("channel_not_in_brief");
    messagesFr.push(`Le canal ${context.channel} ne figure pas dans ce brief.`);
  }
  if (brief.policy_version !== context.activePolicyVersion) {
    failures.push("policy_mismatch");
    messagesFr.push(
      `La politique a changé depuis l'approbation (brief : v${brief.policy_version}, active : v${context.activePolicyVersion}).`,
    );
  }

  return { ok: failures.length === 0, failures, messagesFr };
}

/**
 * What an agent receives. §4: "Pass the returned brief and claims as data
 * alongside the existing agent instructions. Do not rewrite agent prompts
 * permanently."
 *
 * The claim *text* is resolved server-side from `approved_claim_ids`, never
 * carried in the brief: §16 says "A channel adapter cannot act on a generic
 * free-text instruction", and on this platform a claim is a sentence a
 * clinician signed.
 */
export interface ResolvedBrief {
  brief: GrowthBrief;
  approvedClaims: Array<{ claimId: string; textFr: string; protocolVersion: string | null }>;
  /** Channels that survived this deployment's registry. */
  liveChannels: BriefChannel[];
  draftOnlyChannels: BriefChannel[];
  refusedChannels: Array<{ channel: BriefChannel; reasonFr: string }>;
}

/**
 * §14 step 5: the SDK "may cache within a 60-second ceiling and never beyond
 * expiry" and must "never use the cache as authority to write or publish".
 */
export const EFFECTIVE_BRIEF_CACHE_CEILING_MS = 60_000;

export interface CachedBrief {
  resolved: ResolvedBrief;
  cachedAt: number;
}

export function cacheIsUsable(entry: CachedBrief, now: Date): boolean {
  const age = now.getTime() - entry.cachedAt;
  if (age > EFFECTIVE_BRIEF_CACHE_CEILING_MS) return false;
  // Never beyond expiry, however young the cache entry is.
  return now.getTime() < Date.parse(entry.resolved.brief.expires_at);
}

/**
 * The answer when there is no eligible brief.
 *
 * §14: "On timeout, disabled entitlement, missing capability or no approved
 * brief, use host baseline behaviour." The platform's baseline is its ordinary
 * behaviour — protocols, risk rules, escalation — which is always correct and
 * never depends on this engine. That is why a trend failure can never degrade
 * a citizen's answer.
 */
export interface BaselineFallback {
  kind: "baseline";
  reasonFr: string;
}

export type EffectiveBrief = ResolvedBrief | BaselineFallback;

export function isBaseline(value: EffectiveBrief): value is BaselineFallback {
  return (value as BaselineFallback).kind === "baseline";
}

export function baseline(reasonFr: string): BaselineFallback {
  return { kind: "baseline", reasonFr };
}

/**
 * §5: "Limit one active brief per platform, market and topic."
 *
 * The key a unique index is built on, and the key the effective-brief lookup
 * resolves by.
 */
export function briefScopeKey(input: {
  tenantId: string;
  market: string;
  locale: string;
  topicId: string;
}): string {
  return [input.tenantId, input.market, input.locale, input.topicId].join("|");
}
