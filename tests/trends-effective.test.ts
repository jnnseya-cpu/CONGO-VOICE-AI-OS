import { beforeEach, describe, expect, it } from "vitest";

import { getDb, resetDbForTests, schema } from "@server/db/client";
import {
  briefGuidanceFr,
  effectiveBrief,
  localeFor,
  resetBriefCache,
} from "@server/ai/trends/effective";
import { isBaseline, type GrowthBrief } from "@server/ai/trends/brief";

/**
 * The embedding point. Trend Intelligence §4, §14 step 5 and §16.
 *
 * The property that matters most is the one in the last describe block: this
 * call is on the citizen path, so it must never throw and must never make an
 * answer worse. Everything else here is in service of that.
 */

const NOW = new Date("2026-11-12T10:00:00Z");

function briefDocument(overrides: Partial<GrowthBrief> = {}): GrowthBrief {
  return {
    schema_version: 1,
    brief_id: "gb_paludisme_01",
    brief_version: 1,
    tenant_id: "default",
    platform_id: "congo_voice",
    market: "CD",
    locale: "fr-CD",
    topic_id: "paludisme-saison-pluies",
    opportunity_score: 86.25,
    confidence: 83.5,
    valid_from: "2026-11-10T10:00:00Z",
    expires_at: "2026-11-17T10:00:00Z",
    evidence_ids: ["ev_1", "ev_2"],
    audience: "Parents d'enfants de moins de cinq ans",
    intent: "reconnaître les signes de danger du paludisme",
    approved_claim_ids: [],
    cta_id: "cta_centre_de_sante",
    allowed_channels: ["seo"],
    prohibited_claims: ["durée de guérison garantie"],
    objective: "escalades prises en charge dans le délai",
    experiment_id: "exp_1",
    policy_version: 1,
    ...overrides,
  };
}

async function seedBrief(
  document: GrowthBrief,
  row: { status?: string; policyVersion?: number } = {},
): Promise<void> {
  const db = await getDb();
  await db.insert(schema.growthBriefs).values({
    briefId: document.brief_id,
    revision: document.brief_version,
    status: row.status ?? "approved",
    document: document as unknown as Record<string, unknown>,
    module: "health",
    market: document.market,
    locale: document.locale,
    topicId: document.topic_id,
    policyVersion: row.policyVersion ?? document.policy_version,
    validFrom: new Date(document.valid_from),
    expiresAt: new Date(document.expires_at),
  });
}

beforeEach(async () => {
  resetDbForTests();
  resetBriefCache();
  await getDb();
});

describe("locale mapping covers every national language", () => {
  it.each([
    ["fr", "fr-CD"],
    ["ln", "ln-CD"],
    ["kg", "kg-CD"],
    ["sw", "sw-CD"],
    ["lua", "lua-CD"],
  ] as const)("maps %s", (language, expected) => {
    expect(localeFor(language)).toBe(expected);
  });
});

describe("resolving an approved brief", () => {
  it("returns it for the matching module, language and topic", async () => {
    await seedBrief(briefDocument());
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(false);
    if (isBaseline(result)) return;
    expect(result.brief.brief_id).toBe("gb_paludisme_01");
    expect(result.liveChannels).toEqual(["seo"]);
  });

  it("falls back to baseline when no brief exists", async () => {
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "sujet-inconnu",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("falls back to baseline for a draft brief", async () => {
    await seedBrief(briefDocument(), { status: "draft" });
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("falls back to baseline once the brief has expired", async () => {
    await seedBrief(briefDocument());
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: new Date("2026-11-20T10:00:00Z"),
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("falls back to baseline when the policy moved after approval", async () => {
    await seedBrief(briefDocument(), { policyVersion: 9 });
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("refuses a stored document that does not satisfy its own schema", async () => {
    // A row edited outside the approval path must not reach an agent as though
    // it had been approved.
    const db = await getDb();
    await db.insert(schema.growthBriefs).values({
      briefId: "gb_tampered",
      revision: 1,
      status: "approved",
      document: { schema_version: 1, brief_id: "gb_tampered", approval_required: false },
      module: "health",
      market: "CD",
      locale: "fr-CD",
      topicId: "sujet-altere",
      policyVersion: 1,
      validFrom: new Date("2026-11-10T10:00:00Z"),
      expiresAt: new Date("2026-11-17T10:00:00Z"),
    });
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "sujet-altere",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });
});

describe("the channel narrowing", () => {
  it("returns baseline for a channel the brief does not name", async () => {
    await seedBrief(briefDocument());
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      channel: "organic_social",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("returns baseline for a channel this deployment refuses", async () => {
    // Even a brief that names `paid` cannot activate it here.
    await seedBrief(briefDocument({ allowed_channels: ["seo", "paid"] }));
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      channel: "paid",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("drops a refused channel from the live set without failing the brief", async () => {
    await seedBrief(briefDocument({ allowed_channels: ["seo", "paid", "lifecycle"] }));
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    if (isBaseline(result)) throw new Error("expected a resolved brief");
    expect(result.liveChannels).toEqual(["seo"]);
    expect(result.refusedChannels.map((r) => r.channel).sort()).toEqual(["lifecycle", "paid"]);
  });
});

describe("claims are bound to an approved protocol version", () => {
  async function seedProtocol(protocolId: string, status: string): Promise<void> {
    const db = await getDb();
    await db.insert(schema.protocolVersions).values({
      protocolId,
      version: "7",
      module: "health",
      title: "Signes de danger du paludisme grave",
      definition: {},
      status: status as "approved",
    });
  }

  it("resolves the text from the protocol, never from the brief", async () => {
    await seedProtocol("claim_paludisme", "approved");
    await seedBrief(briefDocument({ approved_claim_ids: ["claim_paludisme"] }));
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    if (isBaseline(result)) throw new Error("expected a resolved brief");
    expect(result.approvedClaims).toHaveLength(1);
    expect(result.approvedClaims[0].textFr).toBe("Signes de danger du paludisme grave");
    expect(result.approvedClaims[0].protocolVersion).toBe("7");
  });

  it.each(["draft", "review", "retired"])(
    "omits a claim whose protocol is %s rather than live",
    async (status) => {
      await seedProtocol("claim_paludisme", status);
      await seedBrief(briefDocument({ approved_claim_ids: ["claim_paludisme"] }));
      const result = await effectiveBrief({
        module: "health",
        language: "fr",
        topicId: "paludisme-saison-pluies",
        now: NOW,
      });
      if (isBaseline(result)) throw new Error("expected a resolved brief");
      expect(result.approvedClaims).toEqual([]);
    },
  );

  it("omits a claim with no protocol at all rather than inventing one", async () => {
    await seedBrief(briefDocument({ approved_claim_ids: ["claim_inexistante"] }));
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    if (isBaseline(result)) throw new Error("expected a resolved brief");
    expect(result.approvedClaims).toEqual([]);
  });
});

describe("the guidance handed to an agent", () => {
  it("carries priority, audience and the prohibited list", async () => {
    await seedBrief(briefDocument());
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "paludisme-saison-pluies",
      now: NOW,
    });
    const guidance = briefGuidanceFr(result);
    expect(guidance).not.toBeNull();
    expect(guidance).toContain("ne remplace aucune règle de sécurité");
    expect(guidance).toContain("signes de danger du paludisme");
    expect(guidance).toContain("À ne jamais affirmer");
  });

  it("returns null for the baseline, so an agent appends nothing", () => {
    expect(briefGuidanceFr({ kind: "baseline", reasonFr: "aucun" })).toBeNull();
  });
});

describe("it is safe to call on the citizen path", () => {
  it("never throws when the database is unavailable", async () => {
    // The citizen path cannot afford an exception from an advisory subsystem.
    resetDbForTests();
    const result = await effectiveBrief({
      module: "health",
      language: "ln",
      topicId: "quelconque",
      now: NOW,
    });
    expect(isBaseline(result)).toBe(true);
  });

  it("says why it fell back, so an operator can tell silence from absence", async () => {
    const result = await effectiveBrief({
      module: "health",
      language: "fr",
      topicId: "rien",
      now: NOW,
    });
    if (!isBaseline(result)) throw new Error("expected baseline");
    expect(result.reasonFr.length).toBeGreaterThan(10);
  });
});
