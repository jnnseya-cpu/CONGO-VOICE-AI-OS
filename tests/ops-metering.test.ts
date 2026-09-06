import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import {
  ACU_CONFIG_KEY,
  DEFAULT_ACU_CONVERSION,
  acuBreakdown,
  acuConversion,
  checkAcuCaps,
  computeAcu,
  isDegradedMode,
  monthBounds,
  monthlyConsumption,
  monthlyStatement,
  rawUnits,
  recordAcu,
  resetAcuCache,
} from "@/lib/core/metering";

const ids = { tenant: "", cappedTenant: "", admin: "" };

describe("ACU metering", () => {
  beforeAll(async () => {
    resetDbForTests();
    resetAcuCache();
    const db = await getDb();
    const [t] = await db.insert(schema.tenants).values({ name: "Programme national", type: "national", acuMonthlyCap: 1000 }).returning();
    const [capped] = await db.insert(schema.tenants).values({ name: "Programme pilote", type: "programme", acuMonthlyCap: 10 }).returning();
    const [admin] = await db.insert(schema.users).values({ role: "platform_admin", name: "Admin", phone: "+243820000001" }).returning();
    ids.tenant = t.id;
    ids.cappedTenant = capped.id;
    ids.admin = admin.id;
  });

  it("converts each capability with the documented default table", () => {
    // 1 ACU per 1 000 tokens, weighted by model.
    expect(computeAcu({ task: "llm", model: "claude-opus-5", inputTokens: 600, outputTokens: 400 })).toBe(3);
    expect(computeAcu({ task: "llm", model: "gemini-2.5-flash", inputTokens: 1000 })).toBeCloseTo(0.3, 6);
    expect(computeAcu({ task: "llm", model: "unknown-model", inputTokens: 2000 })).toBe(2);
    // 0.5 ACU per minute of speech.
    expect(computeAcu({ task: "stt", audioSeconds: 120 })).toBe(1);
    // 0.1 ACU per 1 000 characters.
    expect(computeAcu({ task: "tts", characters: 2000 })).toBeCloseTo(0.2, 6);
    // 2 ACU per image.
    expect(computeAcu({ task: "vision", images: 2 })).toBe(4);
    expect(rawUnits({ task: "stt", audioSeconds: 90 })).toBeCloseTo(1.5, 4);
    expect(rawUnits({ task: "llm", inputTokens: 10, outputTokens: 5 })).toBe(15);
  });

  it("reads the conversion table from admin_config and falls back to the defaults", async () => {
    const db = await getDb();
    expect((await acuConversion(true)).llmPer1kTokens).toBe(DEFAULT_ACU_CONVERSION.llmPer1kTokens);
    await db.insert(schema.adminConfig).values({ key: ACU_CONFIG_KEY, value: { llmPer1kTokens: 2, modelWeights: { "test-model": 5 } } });
    const table = await acuConversion(true);
    expect(table.llmPer1kTokens).toBe(2);
    expect(table.modelWeights["test-model"]).toBe(5);
    expect(table.sttPerMinute).toBe(DEFAULT_ACU_CONVERSION.sttPerMinute); // untouched keys keep their default
    expect(computeAcu({ task: "llm", model: "test-model", inputTokens: 1000 }, table)).toBe(10);

    await db.delete(schema.adminConfig).where(eq(schema.adminConfig.key, ACU_CONFIG_KEY));
    resetAcuCache();
    expect((await acuConversion(true)).llmPer1kTokens).toBe(1);
  });

  it("writes a ledger entry attributed to the tenant, module and language", async () => {
    const db = await getDb();
    const acu = await recordAcu({
      task: "llm",
      model: "claude-sonnet-5",
      providerKey: "anthropic",
      tenantId: ids.tenant,
      module: "health",
      language: "ln",
      channel: "ivr",
      inputTokens: 800,
      outputTokens: 200,
    });
    expect(acu).toBe(1.5);
    const rows = await db.select().from(schema.acuLedger).where(eq(schema.acuLedger.tenantId, ids.tenant));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task: "llm", providerKey: "anthropic", module: "health", language: "ln", channel: "ivr" });
    expect(rows[0].units).toBe(1000);
    expect(rows[0].acu).toBe(1.5);
  });

  it("attributes a call to the interaction's tenant when the caller does not know it", async () => {
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ role: "citizen", tenantId: ids.tenant, phone: "+243820000009" }).returning();
    const [interaction] = await db.insert(schema.interactions).values({ userId: user.id, module: "agriculture", language: "kg", status: "completed" }).returning();
    await recordAcu({ task: "stt", providerKey: "mock", interactionId: interaction.id, audioSeconds: 60 });
    const [row] = await db.select().from(schema.acuLedger).where(eq(schema.acuLedger.interactionId, interaction.id));
    expect(row.tenantId).toBe(ids.tenant);
    expect(row.module).toBe("agriculture");
    expect(row.acu).toBe(0.5);
  });

  it("reports monthly consumption, cost and cost per interaction", async () => {
    const usage = await monthlyConsumption(ids.tenant);
    expect(usage.acu).toBeGreaterThan(0);
    expect(usage.cap).toBe(1000);
    expect(usage.pct).toBeGreaterThan(0);
    expect(usage.costUsd).toBeCloseTo(usage.acu * DEFAULT_ACU_CONVERSION.costPerAcuUsd, 4);
    expect(usage.costPerInteractionUsd).toBeGreaterThanOrEqual(0);

    const { from, to } = monthBounds();
    const breakdown = await acuBreakdown({ tenantId: ids.tenant, from, to });
    expect(breakdown.byTask.map((t) => t.task).sort()).toEqual(["llm", "stt"]);
    expect(breakdown.totalAcu).toBeCloseTo(usage.acu, 4);

    const statement = await monthlyStatement(ids.tenant);
    expect(statement.tenant?.name).toBe("Programme national");
  });

  it("degrades non-emergency AI to scripted mode at the cap, and alerts at 80/95/100 %", async () => {
    const db = await getDb();
    expect(await isDegradedMode(ids.cappedTenant)).toBe(false);
    expect(await isDegradedMode(null)).toBe(false);

    // 8.5 of 10 ACU → 85 %: the 80 % alert fires, the cap is not reached.
    await db.insert(schema.acuLedger).values({ tenantId: ids.cappedTenant, task: "llm", providerKey: "mock", units: 8500, acu: 8.5 });
    const first = await checkAcuCaps();
    expect(first.filter((a) => a.tenantId === ids.cappedTenant).map((a) => a.threshold)).toEqual([80]);
    expect(await isDegradedMode(ids.cappedTenant)).toBe(false);

    // Over the cap: 95 % and 100 % fire, and non-emergency AI degrades.
    await db.insert(schema.acuLedger).values({ tenantId: ids.cappedTenant, task: "llm", providerKey: "mock", units: 2000, acu: 2 });
    const second = await checkAcuCaps();
    expect(second.filter((a) => a.tenantId === ids.cappedTenant).map((a) => a.threshold)).toEqual([95, 100]);
    expect(await isDegradedMode(ids.cappedTenant)).toBe(true);

    // Each threshold alerts once per month.
    const third = await checkAcuCaps();
    expect(third.filter((a) => a.tenantId === ids.cappedTenant)).toHaveLength(0);

    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.templateKey, "acu.cap_alert"));
    expect(notifications.length).toBeGreaterThanOrEqual(3);
    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.eventType, "acu.cap.threshold_reached"));
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("meters through the AI gateway's usage funnel", async () => {
    const db = await getDb();
    const before = (await db.select().from(schema.acuLedger)).length;
    const { aiGateway } = await import("@/lib/ai/gateway");
    await aiGateway().transcribe({ audio: Buffer.from("hello world audio payload"), mimeType: "audio/webm", languageHint: "fr" });
    const after = await db.select().from(schema.acuLedger);
    expect(after.length).toBeGreaterThan(before);
    expect(after.some((r) => r.task === "stt" && r.providerKey === "mock")).toBe(true);
  });
});
