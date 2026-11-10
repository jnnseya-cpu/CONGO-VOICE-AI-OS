import { describe, expect, it } from "vitest";

import {
  EFFECTIVE_BRIEF_CACHE_CEILING_MS,
  GLOBAL_MARKET,
  GrowthBriefV1,
  baseline,
  briefScopeKey,
  cacheIsUsable,
  checkBriefRuntimeRules,
  isBaseline,
  type GrowthBrief,
} from "@server/ai/trends/brief";
import {
  BRIEF_CHANNELS,
  CHANNEL_REGISTRY,
  FieldNotPatchable,
  V1_FORBIDDEN_FIELDS,
  availableChannels,
  channelRegistration,
  isChannelAvailable,
  isLiveActionKind,
  planChannels,
  validatePatchFields,
} from "@server/ai/trends/channels";
import { actionKey, canonicalHash, canonicalJson } from "@server/ai/trends/actions";

/**
 * The agent contract. Trend Intelligence §6, §7 and Appendix A.
 *
 * Appendix A's positive fixture is used verbatim, because the specification
 * names it the canonical one and a contract test written against a payload of
 * our own invention proves only that we agree with ourselves.
 */

const CANONICAL: GrowthBrief = {
  schema_version: 1,
  brief_id: "gb_104",
  brief_version: 3,
  tenant_id: "tenant_demo",
  platform_id: "fixture_platform_a",
  market: "CA",
  locale: "en-CA",
  topic_id: "simpler-team-onboarding",
  opportunity_score: 86.25,
  confidence: 83.5,
  valid_from: "2026-11-10T10:00:00Z",
  expires_at: "2026-11-17T10:00:00Z",
  evidence_ids: ["ev_341", "ev_342"],
  audience: "Small teams comparing onboarding options",
  intent: "evaluate how to onboard a small team",
  approved_claim_ids: ["claim_onboarding_01"],
  cta_id: "cta_view_onboarding_guide",
  allowed_channels: ["seo", "organic_social"],
  prohibited_claims: ["guaranteed onboarding time", "unsupported third-party endorsements"],
  objective: "qualified trial starts per eligible session",
  experiment_id: "exp_91",
  policy_version: 5,
};

describe("the canonical fixture validates", () => {
  it("accepts Appendix A's positive fixture unchanged", () => {
    expect(() => GrowthBriefV1.parse(CANONICAL)).not.toThrow();
  });

  it("carries the scores from the §5 worked example", () => {
    const parsed = GrowthBriefV1.parse(CANONICAL);
    expect(parsed.opportunity_score).toBeCloseTo(86.25, 10);
    expect(parsed.confidence).toBeCloseTo(83.5, 10);
  });
});

describe("the brief is a closed object", () => {
  it("rejects an unexpected field", () => {
    // §8: the executor interprets only validated typed actions, and an extra
    // field is how a model smuggles one in.
    const smuggled = { ...CANONICAL, approval_required: false };
    expect(() => GrowthBriefV1.parse(smuggled)).toThrow();
  });

  it("rejects a field that would grant an action", () => {
    expect(() =>
      GrowthBriefV1.parse({ ...CANONICAL, action_kind: "publish_immediately" }),
    ).toThrow();
  });

  it.each([
    ["schema_version", { schema_version: 2 }],
    ["brief_version", { brief_version: 0 }],
    ["market", { market: "canada" }],
    ["opportunity_score", { opportunity_score: 101 }],
    ["confidence", { confidence: -1 }],
    ["valid_from", { valid_from: "2026-11-10T10:00:00+01:00" }],
    ["evidence_ids", { evidence_ids: [] }],
    ["allowed_channels", { allowed_channels: [] }],
    ["policy_version", { policy_version: 0 }],
  ])("rejects a bad %s", (_name, patch) => {
    expect(() => GrowthBriefV1.parse({ ...CANONICAL, ...patch })).toThrow();
  });

  it("rejects duplicate channels and duplicate evidence", () => {
    expect(() =>
      GrowthBriefV1.parse({ ...CANONICAL, allowed_channels: ["seo", "seo"] }),
    ).toThrow();
    expect(() =>
      GrowthBriefV1.parse({ ...CANONICAL, evidence_ids: ["ev_1", "ev_1"] }),
    ).toThrow();
  });

  it("requires a UTC timestamp ending in Z", () => {
    expect(() =>
      GrowthBriefV1.parse({ ...CANONICAL, expires_at: "2026-11-17 10:00:00" }),
    ).toThrow();
  });
});

describe("runtime rules beyond the schema", () => {
  const context = {
    now: new Date("2026-11-12T10:00:00Z"),
    installedMarkets: ["CA", "CD"],
    installedLocales: ["en-CA", "fr-CD"],
    activePolicyVersion: 5,
  };

  it("accepts a brief inside its window", () => {
    expect(checkBriefRuntimeRules(CANONICAL, context).ok).toBe(true);
  });

  it("refuses an expired brief", () => {
    const result = checkBriefRuntimeRules(CANONICAL, {
      ...context,
      now: new Date("2026-11-20T10:00:00Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("expired");
  });

  it("refuses a brief that is not yet in force", () => {
    const result = checkBriefRuntimeRules(CANONICAL, {
      ...context,
      now: new Date("2026-11-01T10:00:00Z"),
    });
    expect(result.failures).toContain("not_yet_valid");
  });

  it("refuses an uninstalled market and an uninstalled locale", () => {
    const result = checkBriefRuntimeRules(
      { ...CANONICAL, market: "FR", locale: "de-DE" },
      context,
    );
    expect(result.failures).toContain("market_not_installed");
    expect(result.failures).toContain("locale_not_installed");
  });

  it("refuses a policy mismatch, because approval was bound to a version", () => {
    const result = checkBriefRuntimeRules(CANONICAL, { ...context, activePolicyVersion: 6 });
    expect(result.failures).toContain("policy_mismatch");
  });

  it("refuses a channel the brief does not name", () => {
    const result = checkBriefRuntimeRules(CANONICAL, { ...context, channel: "paid" });
    expect(result.failures).toContain("channel_not_in_brief");
  });

  it("does not match ZZ against a country-targeted lookup", () => {
    // Appendix A reserves ZZ for explicitly global briefs.
    const result = checkBriefRuntimeRules({ ...CANONICAL, market: GLOBAL_MARKET }, context);
    expect(result.failures).not.toContain("market_not_installed");
  });

  it("says which rule failed, not merely that one did", () => {
    const result = checkBriefRuntimeRules(CANONICAL, {
      ...context,
      now: new Date("2026-11-20T10:00:00Z"),
    });
    expect(result.messagesFr.join(" ")).toContain("expiré");
  });
});

describe("the cache may never become authority", () => {
  const resolved = {
    brief: CANONICAL,
    approvedClaims: [],
    liveChannels: [] as never[],
    draftOnlyChannels: [] as never[],
    refusedChannels: [] as never[],
  };

  it("holds for at most sixty seconds", () => {
    expect(EFFECTIVE_BRIEF_CACHE_CEILING_MS).toBe(60_000);
    const cachedAt = Date.parse("2026-11-12T10:00:00Z");
    expect(cacheIsUsable({ resolved, cachedAt }, new Date("2026-11-12T10:00:59Z"))).toBe(true);
    expect(cacheIsUsable({ resolved, cachedAt }, new Date("2026-11-12T10:01:01Z"))).toBe(false);
  });

  it("expires with the brief even when the entry is fresh", () => {
    // A thirty-second-old cache entry for a brief that expired ten seconds ago
    // is still not usable.
    const cachedAt = Date.parse("2026-11-17T09:59:40Z");
    expect(cacheIsUsable({ resolved, cachedAt }, new Date("2026-11-17T10:00:10Z"))).toBe(false);
  });
});

describe("the baseline fallback", () => {
  it("is distinguishable from a resolved brief", () => {
    const fallback = baseline("aucun brief approuvé");
    expect(isBaseline(fallback)).toBe(true);
  });

  it("names a stable scope key for the one-active-brief rule", () => {
    expect(
      briefScopeKey({ tenantId: "t", market: "CD", locale: "fr-CD", topicId: "paludisme" }),
    ).toBe("t|CD|fr-CD|paludisme");
  });
});

describe("the channel registry embeds §7 without cutting it down", () => {
  it("registers all six routing values from Appendix A", () => {
    expect(CHANNEL_REGISTRY.map((r) => r.channel).sort()).toEqual([...BRIEF_CHANNELS].sort());
  });

  it("refuses paid media on this deployment, permanently", () => {
    const paid = channelRegistration("paid");
    expect(paid.availability).toBe("refused_by_policy");
    expect(paid.reasonFr).toContain("gratuit");
    expect(isChannelAvailable("paid")).toBe(false);
  });

  it("refuses lifecycle marketing to a citizen about their health", () => {
    const lifecycle = channelRegistration("lifecycle");
    expect(lifecycle.availability).toBe("refused_by_policy");
    expect(lifecycle.reasonFr).toContain("prospection");
  });

  it("carries a reason for every channel, available or not", () => {
    for (const registration of CHANNEL_REGISTRY) {
      expect(registration.reasonFr.length).toBeGreaterThan(20);
    }
  });

  it("keeps the owned surfaces available, which is what the release gate needs", () => {
    expect(availableChannels()).toContain("seo");
    expect(availableChannels()).toContain("owned_placement");
  });

  it("drops an unavailable channel from the live set without failing the brief", () => {
    const plan = planChannels(["seo", "organic_social", "paid", "lifecycle"]);
    expect(plan.live).toEqual(["seo"]);
    expect(plan.draftOnly).toEqual(["organic_social"]);
    expect(plan.refused.map((r) => r.channel).sort()).toEqual(["lifecycle", "paid"]);
  });

  it("produces no draft at all for a refused channel", () => {
    // A draft implies an intention to send.
    const plan = planChannels(["paid"]);
    expect(plan.draftOnly).toEqual([]);
    expect(plan.live).toEqual([]);
  });
});

describe("the field allowlist", () => {
  it.each([...V1_FORBIDDEN_FIELDS])("refuses %s", (field) => {
    expect(() => validatePatchFields({ [field]: "x" })).toThrow(FieldNotPatchable);
  });

  it("refuses an unknown field", () => {
    expect(() => validatePatchFields({ invented: "x" })).toThrow(FieldNotPatchable);
  });

  it("allows the four v1 fields", () => {
    expect(() =>
      validatePatchFields({ seo_title: "t", seo_description: "d", body_block: "b", cta_label: "c" }),
    ).not.toThrow();
  });

  it("separates live kinds from draft kinds", () => {
    expect(isLiveActionKind("seo_metadata_patch")).toBe(true);
    expect(isLiveActionKind("organic_social_draft")).toBe(false);
  });
});

describe("the action key is deterministic", () => {
  const base = {
    tenantId: "tenant_demo",
    briefVersion: 3,
    channel: "seo",
    actionKind: "seo_metadata_patch" as const,
    targetId: "page_urgence",
    baseRevision: "rev-1",
    patch: { seo_title: "Nouveau titre" },
  };

  it("gives the same key for the same logical write", () => {
    expect(actionKey(base)).toBe(actionKey(base));
  });

  it("changes when the patch changes", () => {
    expect(actionKey(base)).not.toBe(actionKey({ ...base, patch: { seo_title: "Autre" } }));
  });

  it("changes when the base revision changes", () => {
    expect(actionKey(base)).not.toBe(actionKey({ ...base, baseRevision: "rev-2" }));
  });

  it("hashes independently of key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalHash({ b: 1, a: 2 })).toBe(canonicalHash({ a: 2, b: 1 }));
  });
});
