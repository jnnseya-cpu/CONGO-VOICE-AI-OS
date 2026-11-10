/**
 * Résolution du brief en vigueur — Trend Intelligence §4, §14 step 5, §16.
 *
 * This is the embedding point. Everything else in `trends/` is machinery; this
 * is the single function the platform's existing agents call, and it is
 * deliberately the smallest possible surface:
 *
 *     const brief = await effectiveBrief({ module, market, locale, topicId });
 *
 * §4: "Pass the returned brief and claims as data alongside the existing agent
 * instructions. Do not rewrite agent prompts permanently."
 *
 * Three properties make it safe to call from the citizen path:
 *
 *  - **It never throws.** Any failure — no brief, expired brief, database
 *    unavailable, malformed document — returns the baseline, and the baseline
 *    is the platform's ordinary behaviour. A trend failure can never degrade a
 *    citizen's answer, which is why the orchestrator may call it inline.
 *  - **It never grants anything.** The brief changes priority, audience and
 *    emphasis. Approved protocol text, danger signs, severity thresholds and
 *    escalation are untouched by it and are checked after it, as they are now.
 *  - **The cache is never authority.** At most sixty seconds, never beyond
 *    expiry, and §14 is explicit that it may not be used as authority to write
 *    or publish — so the write path re-resolves rather than trusting it.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@server/db/client";
import { safeLog } from "@server/core/redact";
import type { LanguageCode, ModuleType } from "@server/db/schema";

import {
  GrowthBriefV1,
  baseline,
  briefScopeKey,
  cacheIsUsable,
  checkBriefRuntimeRules,
  type CachedBrief,
  type EffectiveBrief,
  type ResolvedBrief,
} from "./brief";
import { planChannels, type BriefChannel } from "./channels";

/** The country this deployment serves. A tenant may install others. */
const DEFAULT_MARKET = "CD";

/** Installed locales, derived from the platform's own language enum. */
const INSTALLED_LOCALES: Record<LanguageCode, string> = {
  fr: "fr-CD",
  ln: "ln-CD",
  kg: "kg-CD",
  sw: "sw-CD",
  lua: "lua-CD",
};

export function localeFor(language: LanguageCode): string {
  return INSTALLED_LOCALES[language];
}

/**
 * Per-process cache, keyed by scope. §14 caps it at sixty seconds.
 *
 * Deliberately per-process and not shared: a shared cache would need
 * invalidation, and an invalidation bug here would mean agents acting on a
 * withdrawn brief. Sixty seconds of staleness is the cheaper failure.
 */
const cache = new Map<string, CachedBrief>();

export function resetBriefCache(): void {
  cache.clear();
}

export interface EffectiveBriefQuery {
  module: ModuleType;
  language: LanguageCode;
  topicId: string;
  market?: string;
  channel?: BriefChannel;
  tenantId?: string | null;
  now?: Date;
}

/**
 * The one call an agent makes.
 *
 * Returns either a resolved brief or the baseline, never an error. §14: "On
 * timeout, disabled entitlement, missing capability or no approved brief, use
 * host baseline behaviour."
 */
export async function effectiveBrief(query: EffectiveBriefQuery): Promise<EffectiveBrief> {
  const now = query.now ?? new Date();
  const market = query.market ?? DEFAULT_MARKET;
  const locale = localeFor(query.language);
  const scope = briefScopeKey({
    tenantId: query.tenantId ?? "default",
    market,
    locale,
    topicId: query.topicId,
  });

  const held = cache.get(scope);
  if (held !== undefined && cacheIsUsable(held, now)) {
    // Still subject to the channel rule, which the caller may vary per call.
    return narrowToChannel(held.resolved, query.channel);
  }
  cache.delete(scope);

  try {
    const resolved = await loadApprovedBrief({ ...query, market, locale, now });
    if (resolved === null) {
      return baseline("Aucun brief approuvé pour ce sujet, ce marché et cette langue.");
    }
    cache.set(scope, { resolved, cachedAt: now.getTime() });
    return narrowToChannel(resolved, query.channel);
  } catch (err) {
    // A trend failure must never reach a citizen as a worse answer.
    safeLog.warn("trends", "effective brief unavailable; using baseline behaviour", err);
    return baseline("Service de veille indisponible : comportement de référence.");
  }
}

function narrowToChannel(
  resolved: ResolvedBrief,
  channel: BriefChannel | undefined,
): EffectiveBrief {
  if (channel === undefined) return resolved;
  if (!resolved.brief.allowed_channels.includes(channel)) {
    return baseline(`Le brief en vigueur ne couvre pas le canal ${channel}.`);
  }
  if (!resolved.liveChannels.includes(channel)) {
    return baseline(`Le canal ${channel} n'est pas activé sur ce déploiement.`);
  }
  return resolved;
}

async function loadApprovedBrief(input: {
  module: ModuleType;
  market: string;
  locale: string;
  topicId: string;
  tenantId?: string | null;
  now: Date;
}): Promise<ResolvedBrief | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.growthBriefs)
    .where(
      and(
        eq(schema.growthBriefs.status, "approved"),
        eq(schema.growthBriefs.market, input.market),
        eq(schema.growthBriefs.locale, input.locale),
        eq(schema.growthBriefs.topicId, input.topicId),
      ),
    )
    .orderBy(desc(schema.growthBriefs.revision))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  // The stored document is parsed, not trusted. A row edited outside the
  // approval path must not reach an agent as though it had been approved.
  const parsed = GrowthBriefV1.safeParse(row.document);
  if (!parsed.success) {
    safeLog.error("trends", `brief ${row.briefId} v${row.revision} does not satisfy its own schema`);
    return null;
  }
  const brief = parsed.data;

  const runtime = checkBriefRuntimeRules(brief, {
    now: input.now,
    installedMarkets: [input.market],
    installedLocales: [input.locale],
    activePolicyVersion: row.policyVersion,
  });
  if (!runtime.ok) {
    safeLog.info("trends", `brief ${row.briefId} rejected at runtime: ${runtime.failures.join(", ")}`);
    return null;
  }

  const plan = planChannels(brief.allowed_channels);
  return {
    brief,
    approvedClaims: await resolveClaims(brief.approved_claim_ids),
    liveChannels: plan.live,
    draftOnlyChannels: plan.draftOnly,
    refusedChannels: plan.refused,
  };
}

/**
 * Claim text is resolved server-side, never carried in the brief.
 *
 * §16: "A channel adapter cannot act on a generic free-text instruction." On
 * this platform a claim is a sentence a clinician signed, so it is read from
 * the approved protocol version and nowhere else. A claim that cannot be
 * resolved is omitted rather than invented, and an agent given no claims can
 * still work — it simply has nothing new it is permitted to assert.
 */
async function resolveClaims(
  claimIds: readonly string[],
): Promise<ResolvedBrief["approvedClaims"]> {
  if (claimIds.length === 0) return [];
  const db = await getDb();
  const resolved: ResolvedBrief["approvedClaims"] = [];
  for (const claimId of claimIds) {
    const rows = await db
      .select()
      .from(schema.protocolVersions)
      .where(eq(schema.protocolVersions.protocolId, claimId))
      .orderBy(desc(schema.protocolVersions.approvedAt))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      safeLog.info("trends", `claim ${claimId} has no protocol version; omitted`);
      continue;
    }
    /*
     * Only a live version may be claimed. A draft, a version under review, or
     * one that has been retired or suspended is not something a clinician is
     * standing behind today, and an agent must not repeat it because a brief
     * happened to name it.
     */
    if (row.status !== "approved" && row.status !== "active") {
      safeLog.info(
        "trends",
        `claim ${claimId} is ${row.status}, not approved or active; omitted`,
      );
      continue;
    }
    resolved.push({ claimId, textFr: row.title, protocolVersion: row.version });
  }
  return resolved;
}

/**
 * What an agent actually puts in front of a model.
 *
 * Returns a short block of French to append to the existing instructions, or
 * null for the baseline. Kept to priority, audience and emphasis: nothing here
 * can widen what the agent may claim, and the prohibited list is included so
 * the model is told what not to say as well as what to attend to.
 */
export function briefGuidanceFr(value: EffectiveBrief): string | null {
  if ("kind" in value) return null;
  const { brief, approvedClaims } = value;
  const lines = [
    "Orientation en vigueur (ne remplace aucune règle de sécurité) :",
    `- Sujet prioritaire : ${brief.intent}`,
    `- Public : ${brief.audience}`,
  ];
  if (approvedClaims.length > 0) {
    lines.push(
      `- Affirmations approuvées utilisables : ${approvedClaims.map((c) => c.textFr).filter(Boolean).join(" ; ")}`,
    );
  }
  if (brief.prohibited_claims.length > 0) {
    lines.push(`- À ne jamais affirmer : ${brief.prohibited_claims.join(" ; ")}`);
  }
  return lines.join("\n");
}
