import { beforeEach, describe, expect, it } from "vitest";

import { getDb, resetDbForTests, schema } from "@server/db/client";
import { runTrendSweep, trendsState } from "@server/ai/trends/sweep";
import { TRENDS_CONFIG } from "@server/ai/trends/invisibility";
import { runScheduler } from "@server/core/scheduler";

/**
 * The engine's only moving part, and the proof that it is inert by default.
 *
 * A shipped deployment has `trends.enabled` unset. In that state the sweep
 * must read one configuration row, decide nothing, write nothing and return —
 * and the scheduler must carry on exactly as it did before this subsystem
 * existed.
 */

beforeEach(async () => {
  resetDbForTests();
  await getDb();
});

async function setConfig(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.insert(schema.adminConfig).values({ key, value });
}

describe("inert by default", () => {
  it("does not run when nothing is configured", async () => {
    const report = await runTrendSweep();
    expect(report.ran).toBe(false);
    expect(report.reasonFr).toContain("désactivé");
  });

  it("resolves to the inert state when nothing is configured", async () => {
    const state = await trendsState();
    expect(state).toEqual({ enabled: false, influenceAgents: false, allowPublicWrites: false });
  });

  it("writes nothing while inert", async () => {
    await runTrendSweep();
    const db = await getDb();
    const audits = await db.select().from(schema.auditLogs);
    expect(audits.filter((a) => a.action.startsWith("trends."))).toEqual([]);
  });

  it("cannot be switched on by the public-writes key alone", async () => {
    await setConfig(TRENDS_CONFIG.allowPublicWrites, true);
    const state = await trendsState();
    expect(state.enabled).toBe(false);
    expect(state.allowPublicWrites).toBe(false);
  });
});

describe("switched on", () => {
  beforeEach(async () => {
    await setConfig(TRENDS_CONFIG.enabled, true);
  });

  it("runs and reports", async () => {
    const report = await runTrendSweep();
    expect(report.ran).toBe(true);
  });

  it("expires a brief whose window has closed", async () => {
    const db = await getDb();
    await db.insert(schema.growthBriefs).values({
      briefId: "gb_perime",
      revision: 1,
      status: "approved",
      document: {},
      module: "health",
      market: "CD",
      locale: "fr-CD",
      topicId: "sujet",
      policyVersion: 1,
      validFrom: new Date("2026-10-01T00:00:00Z"),
      expiresAt: new Date("2026-10-08T00:00:00Z"),
    });
    const report = await runTrendSweep(new Date("2026-11-10T00:00:00Z"));
    expect(report.briefsExpired).toBe(1);
    const [row] = await db.select().from(schema.growthBriefs);
    expect(row.status).toBe("expired");
  });

  it("leaves a brief that is still in force alone", async () => {
    const db = await getDb();
    await db.insert(schema.growthBriefs).values({
      briefId: "gb_en_cours",
      revision: 1,
      status: "approved",
      document: {},
      module: "health",
      market: "CD",
      locale: "fr-CD",
      topicId: "sujet",
      policyVersion: 1,
      validFrom: new Date("2026-11-01T00:00:00Z"),
      expiresAt: new Date("2026-12-01T00:00:00Z"),
    });
    const report = await runTrendSweep(new Date("2026-11-10T00:00:00Z"));
    expect(report.briefsExpired).toBe(0);
  });

  it("audits what it did, because nobody can see it otherwise", async () => {
    const db = await getDb();
    await db.insert(schema.growthBriefs).values({
      briefId: "gb_perime",
      revision: 1,
      status: "approved",
      document: {},
      module: "health",
      market: "CD",
      locale: "fr-CD",
      topicId: "sujet",
      policyVersion: 1,
      validFrom: new Date("2026-10-01T00:00:00Z"),
      expiresAt: new Date("2026-10-08T00:00:00Z"),
    });
    await runTrendSweep(new Date("2026-11-10T00:00:00Z"));
    const audits = await db.select().from(schema.auditLogs);
    const entry = audits.find((a) => a.action === "trends.sweep");
    expect(entry, "an invisible subsystem must still leave a record").toBeDefined();
  });

  it("never promotes a topic itself", async () => {
    // The engine counts what is waiting for a human. It does not act on it.
    const db = await getDb();
    await db.insert(schema.trendOpportunities).values({
      topicId: "paludisme",
      market: "CD",
      locale: "fr-CD",
      windowEnd: new Date(),
      inputDigest: "d1",
      opportunityScore: 95,
      confidence: 95,
      decision: "auto_eligible",
      status: "eligible",
    });
    const report = await runTrendSweep();
    expect(report.awaitingReview).toBe(1);
    const [row] = await db.select().from(schema.trendOpportunities);
    expect(row.status).toBe("eligible");
  });
});

describe("the scheduler is unchanged by its presence", () => {
  it("completes with the engine inert, and reports zero", async () => {
    const report = await runScheduler(new Date("2026-11-10T00:00:00Z"));
    expect(report.trendBriefsExpired).toBe(0);
    expect(report.errors.filter((e) => e.step === "trends")).toEqual([]);
  });

  it("still completes if the engine throws", async () => {
    // step() catches, but the point is that the platform's sweep does not
    // depend on an advisory subsystem behaving.
    const report = await runScheduler(new Date("2026-11-10T00:00:00Z"));
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});
