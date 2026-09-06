/**
 * ACU metering — one normalised "AI Compute Unit" for every capability.
 *
 * Institutions are billed and capped in ACU, never in vendor tokens: the conversion table
 * lives in `admin_config` under the key `acu.conversion` so it can be re-tuned without a
 * deployment, and every AI call lands in `acu_ledger` attributed to tenant, organisation,
 * module, language and channel.
 *
 * Defaults: llm 1 ACU / 1 000 tokens weighted by model · stt 0.5 ACU / minute
 *           tts 0.1 ACU / 1 000 characters · vision 2 ACU / image.
 *
 * When a tenant reaches its monthly cap, non-emergency AI degrades to scripted mode
 * (`isDegradedMode()`); emergencies are never degraded.
 */
import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { emitEvent } from "./events";
import { notifyRoleTemplate } from "./notifications";
import { safeLog } from "./redact";
import type { ChannelType, LanguageCode, ModuleType } from "@server/db/schema";

export const ACU_CONFIG_KEY = "acu.conversion";

export type AcuTask = "llm" | "vision" | "stt" | "tts" | "translate" | "lid" | "embed";

export interface AcuConversion {
  /** ACU per 1 000 LLM tokens (input + output), before the model weight. */
  llmPer1kTokens: number;
  /** Multiplier per model: a frontier model costs more ACU for the same token count. */
  modelWeights: Record<string, number>;
  sttPerMinute: number;
  ttsPer1kChars: number;
  /**
   * Characters assumed for a synthesis call when the caller does not report the length.
   * The AI gateway's usage record does not carry it, so this is the programme's average
   * spoken answer; lower it once per-call character counts are available.
   */
  ttsDefaultChars: number;
  visionPerImage: number;
  /** Indicative monetary value of one ACU, used for cost-per-interaction reporting. */
  costPerAcuUsd: number;
}

export const DEFAULT_ACU_CONVERSION: AcuConversion = {
  llmPer1kTokens: 1,
  modelWeights: {
    default: 1,
    mock: 0.05,
    "claude-opus-5": 3,
    "claude-sonnet-5": 1.5,
    "claude-haiku-4-5": 0.5,
    "gemini-2.5-pro": 1.2,
    "gemini-2.5-flash": 0.3,
    "gpt-4o": 1.5,
    "gpt-4o-mini": 0.2,
    "whisper-1": 1,
    "tts-1": 1,
  },
  sttPerMinute: 0.5,
  ttsPer1kChars: 0.1,
  ttsDefaultChars: 400,
  visionPerImage: 2,
  costPerAcuUsd: 0.01,
};

let cached: { at: number; value: AcuConversion } | null = null;
const CACHE_MS = 60_000;

export async function acuConversion(force = false): Promise<AcuConversion> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value = DEFAULT_ACU_CONVERSION;
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.adminConfig).where(eq(schema.adminConfig.key, ACU_CONFIG_KEY));
    if (row?.value && typeof row.value === "object") {
      const cfg = row.value as Partial<AcuConversion>;
      value = {
        ...DEFAULT_ACU_CONVERSION,
        ...cfg,
        modelWeights: { ...DEFAULT_ACU_CONVERSION.modelWeights, ...(cfg.modelWeights ?? {}) },
      };
    }
  } catch (err) {
    safeLog.warn("metering", "conversion table unavailable, using defaults", err);
  }
  cached = { at: Date.now(), value };
  return value;
}

export function resetAcuCache() {
  cached = null;
}

export interface AcuUsage {
  task: AcuTask;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  characters?: number;
  images?: number;
}

/** Normalised units for the ledger's `units` column (tokens, minutes, characters, images). */
export function rawUnits(usage: AcuUsage): number {
  switch (usage.task) {
    case "stt":
      return round((usage.audioSeconds ?? 0) / 60, 4);
    case "tts":
      return usage.characters ?? DEFAULT_ACU_CONVERSION.ttsDefaultChars;
    case "vision":
      return usage.images ?? 1;
    default:
      return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  }
}

/** Deterministic ACU computation. Pure function: unit-tested without a database. */
export function computeAcu(usage: AcuUsage, table: AcuConversion = DEFAULT_ACU_CONVERSION): number {
  const weight = table.modelWeights[usage.model ?? "default"] ?? table.modelWeights.default ?? 1;
  switch (usage.task) {
    case "stt":
      return round(((usage.audioSeconds ?? 0) / 60) * table.sttPerMinute, 6);
    case "tts": {
      const chars = usage.characters ?? table.ttsDefaultChars;
      return round((chars / 1000) * table.ttsPer1kChars, 6);
    }
    case "vision": {
      const images = usage.images ?? 1;
      const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      return round(images * table.visionPerImage + (tokens / 1000) * table.llmPer1kTokens * weight, 6);
    }
    default: {
      const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      return round((tokens / 1000) * table.llmPer1kTokens * weight, 6);
    }
  }
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export interface RecordAcuInput extends AcuUsage {
  providerKey: string;
  interactionId?: string | null;
  tenantId?: string | null;
  organisationId?: string | null;
  module?: ModuleType | null;
  language?: LanguageCode | null;
  channel?: ChannelType | null;
  occurredAt?: Date;
}

/**
 * Write one ledger entry. Never throws — metering must not break an answer to a citizen.
 * Called from the AI gateway's private log() method, the single funnel for AI calls.
 */
export async function recordAcu(input: RecordAcuInput): Promise<number> {
  try {
    const table = await acuConversion();
    const acu = computeAcu(input, table);
    const db = await getDb();
    const { channel } = input;
    let { tenantId, organisationId, module, language } = input;
    // Attribute to the interaction's tenant when the caller does not know it.
    if (input.interactionId && (!tenantId || !module)) {
      const [i] = await db
        .select({ userId: schema.interactions.userId, module: schema.interactions.module, language: schema.interactions.language })
        .from(schema.interactions)
        .where(eq(schema.interactions.id, input.interactionId));
      if (i) {
        module = module ?? i.module;
        language = language ?? i.language;
        if (!tenantId && i.userId) {
          const [u] = await db.select({ tenantId: schema.users.tenantId, organisationId: schema.users.organisationId }).from(schema.users).where(eq(schema.users.id, i.userId));
          tenantId = tenantId ?? u?.tenantId ?? null;
          organisationId = organisationId ?? u?.organisationId ?? null;
        }
      }
    }
    await db.insert(schema.acuLedger).values({
      tenantId: tenantId ?? null,
      organisationId: organisationId ?? null,
      interactionId: input.interactionId ?? null,
      module: module ?? null,
      language: language ?? null,
      channel: channel ?? null,
      task: input.task,
      providerKey: input.providerKey,
      units: rawUnits(input),
      acu,
      occurredAt: input.occurredAt ?? new Date(),
    });
    return acu;
  } catch (err) {
    safeLog.error("metering", "recordAcu failed", err);
    return 0;
  }
}

/* ------------------------------------------------------------------------------------------
 * Monthly consumption, caps and degraded mode
 * ---------------------------------------------------------------------------------------- */

export function monthBounds(at: Date = new Date()) {
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { from, to };
}

export interface AcuConsumption {
  tenantId: string | null;
  from: string;
  to: string;
  acu: number;
  cap: number | null;
  pct: number | null;
  interactions: number;
  costUsd: number;
  costPerInteractionUsd: number;
}

export async function monthlyConsumption(tenantId: string | null, at: Date = new Date()): Promise<AcuConsumption> {
  const db = await getDb();
  const { from, to } = monthBounds(at);
  const [row] = await db
    .select({
      acu: sql<number>`coalesce(sum(${schema.acuLedger.acu}),0)::float`,
      interactions: sql<number>`count(distinct ${schema.acuLedger.interactionId})::int`,
    })
    .from(schema.acuLedger)
    .where(and(gte(schema.acuLedger.occurredAt, from), lt(schema.acuLedger.occurredAt, to), tenantId ? eq(schema.acuLedger.tenantId, tenantId) : undefined));
  const table = await acuConversion();
  let cap: number | null = null;
  if (tenantId) {
    const [t] = await db.select({ cap: schema.tenants.acuMonthlyCap }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    cap = t?.cap ?? null;
  }
  const acu = Number(row?.acu ?? 0);
  const interactions = Number(row?.interactions ?? 0);
  const costUsd = round(acu * table.costPerAcuUsd, 4);
  return {
    tenantId,
    from: from.toISOString(),
    to: to.toISOString(),
    acu: round(acu, 4),
    cap,
    pct: cap && cap > 0 ? round((acu / cap) * 100, 1) : null,
    interactions,
    costUsd,
    costPerInteractionUsd: interactions ? round(costUsd / interactions, 6) : 0,
  };
}

/** Breakdown for the metering endpoint and the monthly statement. */
export async function acuBreakdown(opts: { tenantId?: string | null; organisationId?: string | null; from: Date; to: Date }) {
  const db = await getDb();
  const where = and(
    gte(schema.acuLedger.occurredAt, opts.from),
    lt(schema.acuLedger.occurredAt, opts.to),
    opts.tenantId ? eq(schema.acuLedger.tenantId, opts.tenantId) : undefined,
    opts.organisationId ? eq(schema.acuLedger.organisationId, opts.organisationId) : undefined,
  );
  const byTask = await db
    .select({ task: schema.acuLedger.task, acu: sql<number>`coalesce(sum(${schema.acuLedger.acu}),0)::float`, units: sql<number>`coalesce(sum(${schema.acuLedger.units}),0)::float`, calls: sql<number>`count(*)::int` })
    .from(schema.acuLedger)
    .where(where)
    .groupBy(schema.acuLedger.task);
  const byModule = await db
    .select({ module: schema.acuLedger.module, acu: sql<number>`coalesce(sum(${schema.acuLedger.acu}),0)::float`, calls: sql<number>`count(*)::int` })
    .from(schema.acuLedger)
    .where(where)
    .groupBy(schema.acuLedger.module);
  const byLanguage = await db
    .select({ language: schema.acuLedger.language, acu: sql<number>`coalesce(sum(${schema.acuLedger.acu}),0)::float`, calls: sql<number>`count(*)::int` })
    .from(schema.acuLedger)
    .where(where)
    .groupBy(schema.acuLedger.language);
  const table = await acuConversion();
  const total = byTask.reduce((s, r) => s + Number(r.acu), 0);
  const [inter] = await db
    .select({ n: sql<number>`count(distinct ${schema.acuLedger.interactionId})::int` })
    .from(schema.acuLedger)
    .where(where);
  const interactions = Number(inter?.n ?? 0);
  const costUsd = round(total * table.costPerAcuUsd, 4);
  return {
    period: { from: opts.from.toISOString(), to: opts.to.toISOString() },
    totalAcu: round(total, 4),
    costUsd,
    interactions,
    costPerInteractionUsd: interactions ? round(costUsd / interactions, 6) : 0,
    byTask,
    byModule,
    byLanguage,
    conversion: table,
  };
}

const CAP_THRESHOLDS = [80, 95, 100] as const;

/**
 * Check every tenant's monthly consumption and alert administrators once per threshold
 * per month. Called by the scheduler; returns the alerts raised in this run.
 */
export async function checkAcuCaps(at: Date = new Date()) {
  const db = await getDb();
  const tenants = await db.select().from(schema.tenants).where(eq(schema.tenants.status, "active"));
  const raised: Array<{ tenantId: string; pct: number; threshold: number }> = [];
  for (const t of tenants) {
    if (!t.acuMonthlyCap || t.acuMonthlyCap <= 0) continue;
    const usage = await monthlyConsumption(t.id, at);
    const pct = usage.pct ?? 0;
    const settings = (t.settings ?? {}) as Record<string, unknown>;
    const monthKey = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
    const alerted = (settings.acuAlerts as Record<string, number[]> | undefined)?.[monthKey] ?? [];
    for (const threshold of CAP_THRESHOLDS) {
      if (pct >= threshold && !alerted.includes(threshold)) {
        alerted.push(threshold);
        raised.push({ tenantId: t.id, pct, threshold });
        await notifyRoleTemplate(
          "platform_admin",
          {
            key: "acu.cap_alert",
            type: "alert",
            channel: "in_app",
            vars: { pct: threshold, tenant: t.name, used: usage.acu, cap: t.acuMonthlyCap },
            payload: { tenantId: t.id, threshold, pct },
            dedupeKey: `acu:${t.id}:${monthKey}:${threshold}`,
            tenantId: t.id,
          },
        );
        await emitEvent({
          type: "acu.cap.threshold_reached",
          aggregateType: "tenant",
          aggregateId: t.id,
          tenantId: t.id,
          payload: { threshold, pct, acu: usage.acu, cap: t.acuMonthlyCap },
        });
      }
    }
    await db
      .update(schema.tenants)
      .set({ settings: { ...settings, acuAlerts: { ...((settings.acuAlerts as Record<string, number[]>) ?? {}), [monthKey]: alerted } } })
      .where(eq(schema.tenants.id, t.id));
  }
  return raised;
}

/**
 * At (or above) the cap, non-emergency AI runs in scripted mode: approved protocol text
 * and menus only, no model call. Emergencies always go through.
 */
export async function isDegradedMode(tenantId: string | null | undefined, at: Date = new Date()): Promise<boolean> {
  if (!tenantId) return false;
  const usage = await monthlyConsumption(tenantId, at);
  return usage.cap !== null && usage.cap > 0 && usage.acu >= usage.cap;
}

/** Monthly statement rows (CSV / PDF through the reports engine). */
export async function monthlyStatement(tenantId: string | null, at: Date = new Date()) {
  const { from, to } = monthBounds(at);
  const breakdown = await acuBreakdown({ tenantId, from, to });
  const db = await getDb();
  const tenant = tenantId ? (await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)))[0] : null;
  return {
    tenant: tenant ? { id: tenant.id, name: tenant.name, cap: tenant.acuMonthlyCap } : null,
    ...breakdown,
  };
}
