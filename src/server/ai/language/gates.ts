/**
 * Whether a language is allowed to answer, and in what mode (AI-18, §6.5).
 *
 * The specification is explicit that a language cannot go live in a module
 * until measured numbers pass, and that a language whose metrics later fall
 * below the gates is downgraded automatically rather than by someone
 * remembering. Both directions matter: shipping a language on the strength of
 * a demo, and leaving it shipped after a model change degraded it, are the
 * same failure seen from different ends.
 *
 * The default is the strict one. A language with no measurement is not
 * "unknown", it is not ready: it answers from scripts and menus, which is worse
 * service and honest, rather than fluent nonsense, which is worse than nothing.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode, ModuleType } from "@server/db/schema";

export interface LanguageGates {
  /** Word error rate on the clean gold set. Lower is better. */
  maxWerClean: number;
  /** Word error rate on 8 kHz field audio. Lower is better. */
  maxWerField: number;
  /** Intent accuracy on the gold set. */
  minIntentAccuracy: number;
  /** Recall of the emergency class. False negatives here are the unacceptable ones. */
  minEmergencyRecall: number;
  /** Text-to-speech intelligibility, mean opinion score out of five. */
  minTtsMos: number;
  /** Language identification accuracy. */
  minLanguageIdAccuracy: number;
}

/** French is held to a tighter transcription gate because the models are far better at it. */
const FRENCH_GATES: LanguageGates = {
  maxWerClean: 0.12,
  maxWerField: 0.3,
  minIntentAccuracy: 0.9,
  minEmergencyRecall: 0.98,
  minTtsMos: 3.8,
  minLanguageIdAccuracy: 0.95,
};

const NATIONAL_GATES: LanguageGates = {
  maxWerClean: 0.2,
  maxWerField: 0.3,
  minIntentAccuracy: 0.9,
  minEmergencyRecall: 0.98,
  minTtsMos: 3.8,
  minLanguageIdAccuracy: 0.95,
};

/** Outside health the intent bar is 0.85; the emergency recall gate does not apply. */
export function gatesFor(language: LanguageCode, module: ModuleType): LanguageGates {
  const base = language === "fr" ? FRENCH_GATES : NATIONAL_GATES;
  return module === "health" ? base : { ...base, minIntentAccuracy: 0.85, minEmergencyRecall: 0 };
}

export interface LanguageMetrics {
  werClean?: number | null;
  werField?: number | null;
  intentAccuracy?: number | null;
  emergencyRecall?: number | null;
  ttsMos?: number | null;
  languageIdAccuracy?: number | null;
  sampleSize?: number;
}

export interface GateVerdict {
  passes: boolean;
  /** Which gate failed, and by how much, in words a reviewer can act on. */
  failedGates: string[];
}

/** The smallest evaluation set a decision may rest on. */
export const MIN_EVALUATION_SAMPLE = 200;

export function evaluateGates(metrics: LanguageMetrics, gates: LanguageGates): GateVerdict {
  const failed: string[] = [];
  const need = (value: number | null | undefined, label: string) => {
    if (value === null || value === undefined) {
      failed.push(`${label}: non mesuré`);
      return null;
    }
    return value;
  };

  const werClean = need(metrics.werClean, "WER audio propre");
  if (werClean !== null && werClean > gates.maxWerClean) failed.push(`WER audio propre ${pct(werClean)} > ${pct(gates.maxWerClean)}`);

  const werField = need(metrics.werField, "WER audio de terrain");
  if (werField !== null && werField > gates.maxWerField) failed.push(`WER terrain ${pct(werField)} > ${pct(gates.maxWerField)}`);

  const intent = need(metrics.intentAccuracy, "précision d'intention");
  if (intent !== null && intent < gates.minIntentAccuracy) failed.push(`précision d'intention ${pct(intent)} < ${pct(gates.minIntentAccuracy)}`);

  if (gates.minEmergencyRecall > 0) {
    const recall = need(metrics.emergencyRecall, "rappel des urgences");
    if (recall !== null && recall < gates.minEmergencyRecall) failed.push(`rappel des urgences ${pct(recall)} < ${pct(gates.minEmergencyRecall)}`);
  }

  const mos = need(metrics.ttsMos, "intelligibilité de la voix");
  if (mos !== null && mos < gates.minTtsMos) failed.push(`MOS ${mos.toFixed(1)} < ${gates.minTtsMos.toFixed(1)}`);

  const lid = need(metrics.languageIdAccuracy, "identification de la langue");
  if (lid !== null && lid < gates.minLanguageIdAccuracy) failed.push(`identification de la langue ${pct(lid)} < ${pct(gates.minLanguageIdAccuracy)}`);

  if ((metrics.sampleSize ?? 0) < MIN_EVALUATION_SAMPLE) {
    failed.push(`échantillon ${metrics.sampleSize ?? 0} < ${MIN_EVALUATION_SAMPLE} énoncés`);
  }

  return { passes: failed.length === 0, failedGates: failed };
}

function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

export type LanguageMode = "full" | "scripted";

export interface LanguageStatus {
  language: LanguageCode;
  module: ModuleType;
  mode: LanguageMode;
  measuredAt: string | null;
  failedGates: string[];
  reason: "never_measured" | "gates_failed" | "passing";
}

const CACHE_MS = 60_000;
let cache: { at: number; rows: Map<string, LanguageStatus> } | null = null;

function key(language: LanguageCode, module: ModuleType) {
  return `${language}:${module}`;
}

/**
 * The live decision for every language and module, from the most recent
 * measurement of each. Cached briefly: it is read on every turn, and a language
 * that has just been downgraded should still stop answering within the minute.
 */
export async function languageStatuses(): Promise<Map<string, LanguageStatus>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.rows;

  const db = await getDb();
  const rows = await db.select().from(schema.languageQuality).orderBy(desc(schema.languageQuality.measuredAt));
  const seen = new Map<string, LanguageStatus>();
  for (const row of rows) {
    const k = key(row.language, row.module);
    if (seen.has(k)) continue; // the ordering above makes the first row the latest
    seen.set(k, {
      language: row.language,
      module: row.module,
      mode: row.passes ? "full" : "scripted",
      measuredAt: row.measuredAt.toISOString(),
      failedGates: row.failedGates ?? [],
      reason: row.passes ? "passing" : "gates_failed",
    });
  }
  cache = { at: now, rows: seen };
  return seen;
}

export function resetLanguageStatusCache() {
  cache = null;
}

/**
 * Whether this language may answer freely in this module right now.
 *
 * Absence of a measurement is a "no". That is the whole point of a gate: a
 * language nobody has evaluated is exactly the one most likely to be bad.
 */
export async function languageMode(language: LanguageCode, module: ModuleType): Promise<LanguageStatus> {
  const statuses = await languageStatuses().catch(() => new Map<string, LanguageStatus>());
  const exact = statuses.get(key(language, module));
  if (exact) return exact;
  const general = statuses.get(key(language, "general"));
  if (general) return { ...general, module };
  return { language, module, mode: "scripted", measuredAt: null, failedGates: ["aucune évaluation enregistrée"], reason: "never_measured" };
}

/** Records a measurement and, with it, the decision it forces. */
export async function recordLanguageQuality(input: {
  language: LanguageCode;
  module: ModuleType;
  metrics: LanguageMetrics;
  source?: string;
  notes?: string | null;
}): Promise<LanguageStatus> {
  const db = await getDb();
  const verdict = evaluateGates(input.metrics, gatesFor(input.language, input.module));
  const [row] = await db
    .insert(schema.languageQuality)
    .values({
      language: input.language,
      module: input.module,
      werClean: input.metrics.werClean ?? null,
      werField: input.metrics.werField ?? null,
      intentAccuracy: input.metrics.intentAccuracy ?? null,
      emergencyRecall: input.metrics.emergencyRecall ?? null,
      ttsMos: input.metrics.ttsMos ?? null,
      languageIdAccuracy: input.metrics.languageIdAccuracy ?? null,
      sampleSize: input.metrics.sampleSize ?? 0,
      source: input.source ?? "evaluation",
      passes: verdict.passes,
      failedGates: verdict.failedGates,
      notes: input.notes ?? null,
    })
    .returning();
  resetLanguageStatusCache();
  return {
    language: row.language,
    module: row.module,
    mode: row.passes ? "full" : "scripted",
    measuredAt: row.measuredAt.toISOString(),
    failedGates: row.failedGates ?? [],
    reason: row.passes ? "passing" : "gates_failed",
  };
}

/** Every language and module pair, for the administration console. */
export async function languageReadiness(languages: LanguageCode[], modules: ModuleType[]): Promise<LanguageStatus[]> {
  const out: LanguageStatus[] = [];
  for (const language of languages) for (const module of modules) out.push(await languageMode(language, module));
  return out;
}

/** Narrow helper used by the scheduler's daily report. */
export async function downgradedLanguages(): Promise<LanguageStatus[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.languageQuality)
    .where(and(eq(schema.languageQuality.passes, false), inArray(schema.languageQuality.module, ["health", "agriculture", "education", "general"])))
    .orderBy(desc(schema.languageQuality.measuredAt))
    .limit(50);
  const seen = new Set<string>();
  const out: LanguageStatus[] = [];
  for (const row of rows) {
    const k = key(row.language, row.module);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      language: row.language,
      module: row.module,
      mode: "scripted",
      measuredAt: row.measuredAt.toISOString(),
      failedGates: row.failedGates ?? [],
      reason: "gates_failed",
    });
  }
  return out;
}
