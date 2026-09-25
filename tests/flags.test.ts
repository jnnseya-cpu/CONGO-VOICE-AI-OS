import { beforeEach, describe, expect, it } from "vitest";

import { CANARY_HOLD_DAYS, CANARY_START_PERCENT, bucketOf, canariesDue, evaluateFlag, isEnabled, resetFlagCache } from "@server/core/flags";
import { getDb, resetDbForTests, schema } from "@server/db/client";

async function flag(over: Partial<typeof schema.featureFlags.$inferInsert> = {}) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.featureFlags)
    .values({ key: "whatsapp_channel", enabled: true, rolloutPercent: 100, ...over })
    .returning();
  resetFlagCache();
  return row;
}

describe("feature flags (DO-04)", () => {
  beforeEach(async () => {
    resetDbForTests();
    resetFlagCache();
    await getDb();
  });

  it("is off for a flag nobody has created", async () => {
    const d = await evaluateFlag("not_a_flag");
    expect(d.on).toBe(false);
    expect(d.reason).toBe("unknown_flag");
  });

  it("is off while the flag is off, whatever the scope says", async () => {
    await flag({ enabled: false });
    expect(await isEnabled("whatsapp_channel", { province: "Kinshasa" })).toBe(false);
  });

  it("opens one province at a time, because that is where the workers are", async () => {
    await flag({ provinces: ["Kongo-Central"] });
    expect(await isEnabled("whatsapp_channel", { province: "Kongo-Central" })).toBe(true);
    expect(await isEnabled("whatsapp_channel", { province: "Kinshasa" })).toBe(false);
    expect((await evaluateFlag("whatsapp_channel", { province: "Kinshasa" })).reason).toBe("out_of_scope");
  });

  it("treats an empty scope as everywhere, never as nowhere", async () => {
    await flag({ provinces: [], languages: [] });
    expect(await isEnabled("whatsapp_channel", { province: "Tshopo", language: "lua" })).toBe(true);
  });

  it("narrows on every dimension at once", async () => {
    await flag({ modules: ["health"], languages: ["ln"], channels: ["whatsapp"], provinces: ["Kinshasa"] });
    const full = { module: "health", language: "ln", channel: "whatsapp", province: "Kinshasa" };
    expect(await isEnabled("whatsapp_channel", full)).toBe(true);
    expect(await isEnabled("whatsapp_channel", { ...full, language: "sw" })).toBe(false);
  });

  it("gives the same citizen the same answer every time", async () => {
    await flag({ rolloutPercent: 50 });
    const first = await isEnabled("whatsapp_channel", { subject: "citizen-42" });
    for (let i = 0; i < 20; i++) expect(await isEnabled("whatsapp_channel", { subject: "citizen-42" })).toBe(first);
  });

  it("splits traffic roughly where it was told to", async () => {
    await flag({ rolloutPercent: 25 });
    let on = 0;
    for (let i = 0; i < 2000; i++) if (await isEnabled("whatsapp_channel", { subject: `citizen-${i}` })) on++;
    expect(on / 2000).toBeGreaterThan(0.2);
    expect(on / 2000).toBeLessThan(0.3);
  });

  it("says no rather than sometimes when there is nothing stable to hash", async () => {
    await flag({ rolloutPercent: 50 });
    expect(await isEnabled("whatsapp_channel", {})).toBe(false);
  });

  it("spreads subjects across the range", () => {
    const buckets = new Set(Array.from({ length: 200 }, (_, i) => bucketOf("k", `s-${i}`)));
    expect(buckets.size).toBeGreaterThan(50);
    for (const b of buckets) expect(b).toBeGreaterThanOrEqual(0), expect(b).toBeLessThan(100);
  });
});

describe("staged rollout (AI-17)", () => {
  beforeEach(async () => {
    resetDbForTests();
    resetFlagCache();
    await getDb();
  });

  it("starts at the share the specification names", () => {
    expect(CANARY_START_PERCENT).toBe(5);
    expect(CANARY_HOLD_DAYS).toBe(7);
  });

  it("does not report a canary that is still inside its window", async () => {
    await flag({ rolloutPercent: 5, canaryStartedAt: new Date(Date.now() - 3 * 86_400_000), canaryDays: 7 });
    expect(await canariesDue()).toEqual([]);
  });

  it("reports one that has served its window, without widening it", async () => {
    const row = await flag({ rolloutPercent: 5, canaryStartedAt: new Date(Date.now() - 8 * 86_400_000), canaryDays: 7 });
    const due = await canariesDue();
    expect(due).toHaveLength(1);
    expect(due[0].readyToWiden).toBe(true);
    // Reported, not promoted: the share is unchanged.
    const db = await getDb();
    const [after] = await db.select().from(schema.featureFlags);
    expect(after.rolloutPercent).toBe(5);
    expect(after.id).toBe(row.id);
  });

  it("ignores a flag already at full traffic", async () => {
    await flag({ rolloutPercent: 100, canaryStartedAt: new Date(Date.now() - 30 * 86_400_000) });
    expect(await canariesDue()).toEqual([]);
  });
});
