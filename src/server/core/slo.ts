/**
 * Service level objectives, measured from what the platform already records
 * (NFR-O-02, and the measurement half of NFR-002 and NFR-P-01..04).
 *
 * The targets in the specification are percentiles, and a percentile is not a
 * property of a build: it is a property of a running service under real load.
 * What a repository can do is compute it honestly from the request and turn
 * logs, say how many observations it rests on, and refuse to report a number
 * that rests on too few.
 *
 * Every objective names the thing a citizen experiences. "API availability" is
 * not one of them; "a spoken reply arrives before the caller gives up" is.
 */
import "server-only";
import { and, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";

export interface Objective {
  id: string;
  /** What the citizen or worker actually experiences. */
  title: string;
  /** The specification requirement this comes from. */
  requirement: string;
  target: number;
  unit: "ms" | "percent";
  /** Which way is good. */
  direction: "at_most" | "at_least";
}

export const OBJECTIVES: Objective[] = [
  { id: "ivr_first_reply_p95", title: "Première réponse parlée sur un appel", requirement: "NFR-P-01", target: 6000, unit: "ms", direction: "at_most" },
  { id: "whatsapp_reply_p95", title: "Réponse à une note vocale WhatsApp", requirement: "NFR-P-02", target: 12000, unit: "ms", direction: "at_most" },
  { id: "photo_analysis_p95", title: "Analyse d'une photo de culture", requirement: "NFR-P-03", target: 15000, unit: "ms", direction: "at_most" },
  { id: "api_p95", title: "Réponse d'API hors appel de modèle", requirement: "NFR-P-04", target: 400, unit: "ms", direction: "at_most" },
  { id: "useful_reply_p95", title: "Réponse utile, voie texte", requirement: "NFR-002", target: 12000, unit: "ms", direction: "at_most" },
  { id: "availability", title: "Requêtes servies sans erreur du serveur", requirement: "NFR-001", target: 99.5, unit: "percent", direction: "at_least" },
];

/** Below this many observations a percentile is noise, and is reported as unmeasured. */
export const MIN_OBSERVATIONS = 30;

export interface Measurement {
  objective: Objective;
  /** Null when there is not enough traffic to say anything. */
  value: number | null;
  observations: number;
  meets: boolean | null;
  window: { from: string; to: string };
}

function percentileExpr(column: unknown, p: number) {
  return sql<number>`percentile_disc(${p}) within group (order by ${column})`;
}

/**
 * Measures every objective over a window.
 *
 * Percentiles are computed in the database rather than by pulling rows out:
 * on a national service the row count is the reason the percentile matters.
 */
export async function measureObjectives(opts: { from?: Date; to?: Date } = {}): Promise<Measurement[]> {
  const db = await getDb();
  const to = opts.to ?? new Date();
  const from = opts.from ?? new Date(to.getTime() - 24 * 3600 * 1000);
  const window = { from: from.toISOString(), to: to.toISOString() };
  const out: Measurement[] = [];

  const interactionWindow = and(
    gte(schema.interactions.createdAt, from),
    lte(schema.interactions.createdAt, to),
    isNotNull(schema.interactions.latencyMs),
  );

  const byChannel = async (channel: string) => {
    const [row] = await db
      .select({ p95: percentileExpr(schema.interactions.latencyMs, 0.95), n: sql<number>`count(*)::int` })
      .from(schema.interactions)
      .where(and(interactionWindow, sql`${schema.interactions.channel} = ${channel}`));
    return { value: row?.n ? Number(row.p95) : null, observations: row?.n ?? 0 };
  };

  const voice = await byChannel("voice");
  const image = await byChannel("image");
  const text = await byChannel("text");

  const [apiRow] = await db
    .select({ p95: percentileExpr(schema.apiRequestLogs.durationMs, 0.95), n: sql<number>`count(*)::int` })
    .from(schema.apiRequestLogs)
    .where(and(gte(schema.apiRequestLogs.createdAt, from), lte(schema.apiRequestLogs.createdAt, to), sql`${schema.apiRequestLogs.path} not like '/api/v1/interactions%'`));

  const [availabilityRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${schema.apiRequestLogs.statusCode} >= 500)::int`,
    })
    .from(schema.apiRequestLogs)
    .where(and(gte(schema.apiRequestLogs.createdAt, from), lte(schema.apiRequestLogs.createdAt, to)));

  const raw: Record<string, { value: number | null; observations: number }> = {
    ivr_first_reply_p95: voice,
    whatsapp_reply_p95: voice,
    photo_analysis_p95: image,
    useful_reply_p95: text,
    api_p95: { value: apiRow?.n ? Number(apiRow.p95) : null, observations: apiRow?.n ?? 0 },
    availability: {
      value: availabilityRow?.total ? ((availabilityRow.total - availabilityRow.failed) / availabilityRow.total) * 100 : null,
      observations: availabilityRow?.total ?? 0,
    },
  };

  for (const objective of OBJECTIVES) {
    const measured = raw[objective.id] ?? { value: null, observations: 0 };
    const enough = measured.observations >= MIN_OBSERVATIONS && measured.value !== null;
    out.push({
      objective,
      value: enough ? measured.value : null,
      observations: measured.observations,
      meets: enough ? (objective.direction === "at_most" ? measured.value! <= objective.target : measured.value! >= objective.target) : null,
      window,
    });
  }
  return out;
}

export interface SloReport {
  measurements: Measurement[];
  breaching: Measurement[];
  unmeasured: Measurement[];
}

export async function sloReport(opts: { from?: Date; to?: Date } = {}): Promise<SloReport> {
  const measurements = await measureObjectives(opts);
  return {
    measurements,
    breaching: measurements.filter((m) => m.meets === false),
    // Said out loud rather than shown as a pass: nobody should read silence as success.
    unmeasured: measurements.filter((m) => m.meets === null),
  };
}
