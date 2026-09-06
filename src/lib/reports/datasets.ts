/**
 * Report datasets — pure SQL aggregation, one builder per report type.
 *
 * Every figure returned here is accompanied by its denominator and passed through the
 * small-number suppression rule before it reaches a page or a spreadsheet.
 */
import "server-only";
import { and, avg, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { ISSUE_FR, SUBJECT_FR, TOPIC_FR } from "@/lib/ai/agents/reporting";
import { acuBreakdown } from "@/lib/core/metering";
import {
  PROGRAMME_NAME,
  REPORT_CATALOGUE,
  SUPPRESSION_NOTE,
  suppress,
  type ReportDocument,
  type ReportPeriod,
  type ReportSection,
  type ReportType,
} from "./types";

export interface BuildOptions {
  period: ReportPeriod;
  scope?: Record<string, unknown>;
}

type Scope = { province?: string; module?: string; tenantId?: string; organisationId?: string };

export async function buildReport(type: ReportType, opts: BuildOptions): Promise<ReportDocument> {
  const meta = REPORT_CATALOGUE[type];
  const scope = (opts.scope ?? {}) as Scope;
  const from = new Date(opts.period.from);
  const to = new Date(opts.period.to);
  const built = await BUILDERS[type]({ from, to, scope });
  return {
    type,
    title: meta.name,
    programme: PROGRAMME_NAME,
    period: opts.period,
    scope: opts.scope ?? {},
    generatedAt: new Date().toISOString(),
    dataFreshness: built.freshness,
    summary: built.summary,
    sections: built.sections,
    definitions: meta.definitions,
    denominators: meta.denominators,
    suppressionNote: SUPPRESSION_NOTE,
    purpose: meta.purpose,
    audience: meta.audience,
  };
}

interface BuilderContext {
  from: Date;
  to: Date;
  scope: Scope;
}
interface BuiltReport {
  summary: Array<{ label: string; value: string | number }>;
  sections: ReportSection[];
  freshness: string | null;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const pct = (a: number, b: number): string => (b === 0 ? "—" : `${Math.round((a / b) * 1000) / 10} %`);

/** Most recent record in scope: tells the reader how fresh the figures are. */
async function freshnessOf(from: Date, to: Date): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ at: sql<string | null>`max(${schema.interactions.createdAt})` })
    .from(schema.interactions)
    .where(and(gte(schema.interactions.createdAt, from), lt(schema.interactions.createdAt, to)));
  return row?.at ? new Date(row.at).toISOString() : null;
}

/* ------------------------------------------------------------------------------------------ */

async function dailyUsage({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const where = and(
    gte(schema.interactions.createdAt, from),
    lt(schema.interactions.createdAt, to),
    scope.province ? eq(schema.interactions.province, scope.province) : undefined,
  );
  const byModule = await db.select({ module: schema.interactions.module, n: count() }).from(schema.interactions).where(where).groupBy(schema.interactions.module);
  const byChannel = await db.select({ channel: schema.interactions.channel, n: count() }).from(schema.interactions).where(where).groupBy(schema.interactions.channel);
  const byLanguage = await db.select({ language: schema.interactions.language, n: count() }).from(schema.interactions).where(where).groupBy(schema.interactions.language);
  const [totals] = await db
    .select({
      n: count(),
      users: sql<number>`count(distinct ${schema.interactions.userId})::int`,
      escalated: sql<number>`sum(case when ${schema.interactions.escalationRequired} then 1 else 0 end)::int`,
      failed: sql<number>`sum(case when ${schema.interactions.status} = 'failed' then 1 else 0 end)::int`,
      latency: avg(schema.interactions.latencyMs),
    })
    .from(schema.interactions)
    .where(where);
  const total = num(totals?.n);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Interactions", value: total },
      { label: "Utilisateurs actifs", value: num(totals?.users) },
      { label: "Escalades", value: num(totals?.escalated) },
      { label: "Échecs techniques", value: num(totals?.failed) },
      { label: "Latence moyenne", value: `${Math.round(num(totals?.latency))} ms` },
    ],
    sections: [
      {
        title: "Interactions par module",
        columns: [
          { key: "module", label: "Module" },
          { key: "n", label: "Interactions", align: "right" },
          { key: "share", label: "Part", align: "right" },
        ],
        rows: byModule.map((r) => ({ module: r.module, n: r.n, share: pct(r.n, total) })),
        note: `Dénominateur : ${total} interactions.`,
      },
      {
        title: "Interactions par canal",
        columns: [
          { key: "channel", label: "Canal" },
          { key: "n", label: "Interactions", align: "right" },
        ],
        rows: byChannel.map((r) => ({ channel: r.channel, n: r.n })),
      },
      {
        title: "Interactions par langue",
        columns: [
          { key: "language", label: "Langue" },
          { key: "n", label: "Interactions", align: "right" },
          { key: "share", label: "Part", align: "right" },
        ],
        rows: byLanguage.map((r) => ({ language: r.language ?? "—", n: r.n, share: pct(r.n, total) })),
      },
    ],
  };
}

async function weeklyHealthTrends({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const where = and(
    gte(schema.healthTriageRecords.createdAt, from),
    lt(schema.healthTriageRecords.createdAt, to),
    scope.province ? eq(schema.healthTriageRecords.province, scope.province) : undefined,
  );
  const byTopic = await db.select({ topic: schema.healthTriageRecords.topic, n: count() }).from(schema.healthTriageRecords).where(where).groupBy(schema.healthTriageRecords.topic).orderBy(desc(count()));
  const byProvince = await db.select({ province: schema.healthTriageRecords.province, n: count() }).from(schema.healthTriageRecords).where(where).groupBy(schema.healthTriageRecords.province).orderBy(desc(count()));
  const byBand = await db.select({ band: schema.healthTriageRecords.riskBand, n: count() }).from(schema.healthTriageRecords).where(where).groupBy(schema.healthTriageRecords.riskBand);
  const [totals] = await db
    .select({ n: count(), emergencies: sql<number>`sum(case when jsonb_array_length(${schema.healthTriageRecords.emergencyFlags}) > 0 then 1 else 0 end)::int`, referred: sql<number>`sum(case when ${schema.healthTriageRecords.referralStatus} <> 'none' then 1 else 0 end)::int` })
    .from(schema.healthTriageRecords)
    .where(where);
  const total = num(totals?.n);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Enregistrements de triage", value: total },
      { label: "Signes de danger détectés", value: num(totals?.emergencies) },
      { label: "Orientations vers un centre", value: num(totals?.referred) },
      { label: "Taux d'orientation", value: pct(num(totals?.referred), total) },
    ],
    sections: [
      {
        title: "Motifs de consultation",
        columns: [
          { key: "topic", label: "Motif" },
          { key: "n", label: "Cas", align: "right", suppress: true },
          { key: "share", label: "Part", align: "right" },
        ],
        rows: byTopic.map((r) => ({ topic: TOPIC_FR[r.topic ?? ""] ?? r.topic ?? "—", n: suppress(r.n), share: pct(r.n, total) })),
        note: `Dénominateur : ${total} enregistrements de triage.`,
      },
      {
        title: "Répartition par province",
        columns: [
          { key: "province", label: "Province" },
          { key: "n", label: "Cas", align: "right", suppress: true },
        ],
        rows: byProvince.map((r) => ({ province: r.province ?? "—", n: suppress(r.n) })),
      },
      {
        title: "Niveaux de risque",
        columns: [
          { key: "band", label: "Niveau" },
          { key: "n", label: "Cas", align: "right", suppress: true },
        ],
        rows: byBand.map((r) => ({ band: r.band ?? "non classé", n: suppress(r.n) })),
      },
    ],
  };
}

async function weeklyAgriRisk({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const where = and(
    gte(schema.agricultureReports.createdAt, from),
    lt(schema.agricultureReports.createdAt, to),
    scope.province ? eq(schema.agricultureReports.province, scope.province) : undefined,
  );
  const byIssue = await db.select({ issue: schema.agricultureReports.issueType, crop: schema.agricultureReports.cropType, n: count() }).from(schema.agricultureReports).where(where).groupBy(schema.agricultureReports.issueType, schema.agricultureReports.cropType).orderBy(desc(count()));
  const byProvince = await db.select({ province: schema.agricultureReports.province, n: count() }).from(schema.agricultureReports).where(where).groupBy(schema.agricultureReports.province).orderBy(desc(count()));
  const clusters = await db.select().from(schema.agriClusters).where(and(gte(schema.agriClusters.windowEnd, from), lt(schema.agriClusters.windowStart, to))).orderBy(desc(schema.agriClusters.reportCount)).limit(20);
  const [totals] = await db
    .select({ n: count(), urgent: sql<number>`sum(case when ${schema.agricultureReports.urgent} then 1 else 0 end)::int`, notifiable: sql<number>`sum(case when ${schema.agricultureReports.isNotifiable} then 1 else 0 end)::int` })
    .from(schema.agricultureReports)
    .where(where);
  const total = num(totals?.n);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Signalements", value: total },
      { label: "Signalements urgents", value: num(totals?.urgent) },
      { label: "Déclarations obligatoires", value: num(totals?.notifiable) },
      { label: "Foyers suivis", value: clusters.length },
    ],
    sections: [
      {
        title: "Problèmes par culture",
        columns: [
          { key: "issue", label: "Problème" },
          { key: "crop", label: "Culture" },
          { key: "n", label: "Signalements", align: "right", suppress: true },
        ],
        rows: byIssue.map((r) => ({ issue: ISSUE_FR[r.issue ?? ""] ?? r.issue ?? "—", crop: r.crop ?? "—", n: suppress(r.n) })),
        note: `Dénominateur : ${total} signalements agricoles.`,
      },
      {
        title: "Répartition par province",
        columns: [
          { key: "province", label: "Province" },
          { key: "n", label: "Signalements", align: "right", suppress: true },
        ],
        rows: byProvince.map((r) => ({ province: r.province ?? "—", n: suppress(r.n) })),
      },
      {
        title: "Foyers détectés",
        description: "Un foyer reste « non vérifié » tant qu'un agent ne l'a pas validé sur le terrain.",
        columns: [
          { key: "issue", label: "Problème" },
          { key: "crop", label: "Culture" },
          { key: "province", label: "Province" },
          { key: "territory", label: "Territoire" },
          { key: "reportCount", label: "Signalements", align: "right" },
          { key: "status", label: "Statut" },
        ],
        rows: clusters.map((c) => ({ issue: ISSUE_FR[c.issue] ?? c.issue, crop: c.crop ?? "—", province: c.province ?? "—", territory: c.territory ?? "—", reportCount: c.reportCount, status: c.status })),
      },
    ],
  };
}

async function weeklyEducationSupport({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const where = and(
    gte(schema.educationSessions.createdAt, from),
    lt(schema.educationSessions.createdAt, to),
    scope.province ? eq(schema.educationSessions.province, scope.province) : undefined,
  );
  const bySubject = await db.select({ subject: schema.educationSessions.subject, n: count() }).from(schema.educationSessions).where(where).groupBy(schema.educationSessions.subject).orderBy(desc(count()));
  const gaps = await db
    .select({ topic: schema.educationSessions.topic, subject: schema.educationSessions.subject, n: count() })
    .from(schema.educationSessions)
    .where(and(where, eq(schema.educationSessions.progressSignal, "needs_support")))
    .groupBy(schema.educationSessions.topic, schema.educationSessions.subject)
    .orderBy(desc(count()))
    .limit(20);
  const byAge = await db.select({ age: schema.educationSessions.learnerAgeGroup, n: count() }).from(schema.educationSessions).where(where).groupBy(schema.educationSessions.learnerAgeGroup);
  const [totals] = await db.select({ n: count(), learners: sql<number>`count(distinct ${schema.educationSessions.userId})::int` }).from(schema.educationSessions).where(where);
  const total = num(totals?.n);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Sessions d'apprentissage", value: total },
      { label: "Apprenants distincts", value: suppress(num(totals?.learners)) },
      { label: "Notions à renforcer", value: gaps.length },
    ],
    sections: [
      {
        title: "Sessions par matière",
        columns: [
          { key: "subject", label: "Matière" },
          { key: "n", label: "Sessions", align: "right", suppress: true },
          { key: "share", label: "Part", align: "right" },
        ],
        rows: bySubject.map((r) => ({ subject: SUBJECT_FR[r.subject ?? ""] ?? r.subject ?? "—", n: suppress(r.n), share: pct(r.n, total) })),
        note: `Dénominateur : ${total} sessions.`,
      },
      {
        title: "Notions demandant un appui",
        columns: [
          { key: "topic", label: "Notion" },
          { key: "subject", label: "Matière" },
          { key: "n", label: "Demandes", align: "right", suppress: true },
        ],
        rows: gaps.map((r) => ({ topic: r.topic ?? "—", subject: SUBJECT_FR[r.subject ?? ""] ?? r.subject ?? "—", n: suppress(r.n) })),
      },
      {
        title: "Tranches d'âge",
        columns: [
          { key: "age", label: "Tranche" },
          { key: "n", label: "Sessions", align: "right", suppress: true },
        ],
        rows: byAge.map((r) => ({ age: r.age ?? "—", n: suppress(r.n) })),
      },
    ],
  };
}

async function monthlyRegionalActivity({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const iWhere = and(gte(schema.interactions.createdAt, from), lt(schema.interactions.createdAt, to), scope.province ? eq(schema.interactions.province, scope.province) : undefined);
  const cWhere = and(gte(schema.cases.createdAt, from), lt(schema.cases.createdAt, to), scope.province ? eq(schema.cases.province, scope.province) : undefined);
  const interactions = await db.select({ province: schema.interactions.province, n: count() }).from(schema.interactions).where(iWhere).groupBy(schema.interactions.province).orderBy(desc(count()));
  const cases = await db
    .select({
      province: schema.cases.province,
      n: count(),
      closed: sql<number>`sum(case when ${schema.cases.status} in ('closed','resolved') then 1 else 0 end)::int`,
      breached: sql<number>`sum(case when ${schema.cases.slaBreached} then 1 else 0 end)::int`,
    })
    .from(schema.cases)
    .where(cWhere)
    .groupBy(schema.cases.province);
  const caseMap = new Map(cases.map((c) => [c.province ?? "—", c]));
  const [totals] = await db.select({ n: count() }).from(schema.interactions).where(iWhere);
  const total = num(totals?.n);
  const rows = interactions.map((r) => {
    const key = r.province ?? "—";
    const c = caseMap.get(key);
    return {
      province: key,
      interactions: r.n,
      cases: suppress(num(c?.n)),
      closed: suppress(num(c?.closed)),
      breached: suppress(num(c?.breached)),
      closureRate: c && num(c.n) > 0 ? pct(num(c.closed), num(c.n)) : "—",
    };
  });
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Interactions", value: total },
      { label: "Provinces actives", value: interactions.length },
      { label: "Cas ouverts", value: cases.reduce((s, c) => s + num(c.n), 0) },
      { label: "Délais dépassés", value: cases.reduce((s, c) => s + num(c.breached), 0) },
    ],
    sections: [
      {
        title: "Activité par province",
        columns: [
          { key: "province", label: "Province" },
          { key: "interactions", label: "Interactions", align: "right" },
          { key: "cases", label: "Cas", align: "right", suppress: true },
          { key: "closed", label: "Clos / résolus", align: "right", suppress: true },
          { key: "closureRate", label: "Taux de clôture", align: "right" },
          { key: "breached", label: "Délais dépassés", align: "right", suppress: true },
        ],
        rows,
        note: `Dénominateur : ${total} interactions et ${cases.reduce((s, c) => s + num(c.n), 0)} cas sur la période.`,
      },
    ],
  };
}

async function monthlyNgoImpact({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const where = and(
    gte(schema.cases.createdAt, from),
    lt(schema.cases.createdAt, to),
    scope.organisationId ? eq(schema.cases.organisationId, scope.organisationId) : undefined,
    scope.province ? eq(schema.cases.province, scope.province) : undefined,
  );
  const byOutcome = await db.select({ outcome: schema.cases.outcome, n: count() }).from(schema.cases).where(and(where, isNotNull(schema.cases.outcome))).groupBy(schema.cases.outcome).orderBy(desc(count()));
  const byModule = await db
    .select({
      module: schema.cases.module,
      n: count(),
      closed: sql<number>`sum(case when ${schema.cases.status} = 'closed' then 1 else 0 end)::int`,
      acknowledged: sql<number>`sum(case when ${schema.cases.acknowledgedAt} is not null then 1 else 0 end)::int`,
    })
    .from(schema.cases)
    .where(where)
    .groupBy(schema.cases.module);
  const [followUps] = await db
    .select({ n: count(), captured: sql<number>`sum(case when ${schema.followUps.status} = 'captured' then 1 else 0 end)::int` })
    .from(schema.followUps)
    .where(and(gte(schema.followUps.createdAt, from), lt(schema.followUps.createdAt, to)));
  const totalCases = byModule.reduce((s, r) => s + num(r.n), 0);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Cas suivis", value: totalCases },
      { label: "Cas clos", value: byModule.reduce((s, r) => s + num(r.closed), 0) },
      { label: "Suivis programmés", value: num(followUps?.n) },
      { label: "Taux de suivi recueilli", value: pct(num(followUps?.captured), num(followUps?.n)) },
    ],
    sections: [
      {
        title: "Cas par module",
        columns: [
          { key: "module", label: "Module" },
          { key: "n", label: "Cas", align: "right", suppress: true },
          { key: "acknowledged", label: "Pris en charge", align: "right", suppress: true },
          { key: "closed", label: "Clos", align: "right", suppress: true },
          { key: "rate", label: "Taux de clôture", align: "right" },
        ],
        rows: byModule.map((r) => ({ module: r.module, n: suppress(r.n), acknowledged: suppress(num(r.acknowledged)), closed: suppress(num(r.closed)), rate: pct(num(r.closed), num(r.n)) })),
        note: `Dénominateur : ${totalCases} cas ouverts sur la période.`,
      },
      {
        title: "Résultats déclarés à la clôture",
        columns: [
          { key: "outcome", label: "Résultat" },
          { key: "n", label: "Cas", align: "right", suppress: true },
        ],
        rows: byOutcome.map((r) => ({ outcome: r.outcome ?? "—", n: suppress(r.n) })),
      },
    ],
  };
}

async function quarterlyGovernmentProgramme({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const iWhere = and(gte(schema.interactions.createdAt, from), lt(schema.interactions.createdAt, to), scope.province ? eq(schema.interactions.province, scope.province) : undefined);
  const cWhere = and(gte(schema.cases.createdAt, from), lt(schema.cases.createdAt, to), scope.province ? eq(schema.cases.province, scope.province) : undefined);
  const [totals] = await db.select({ n: count(), users: sql<number>`count(distinct ${schema.interactions.userId})::int`, provinces: sql<number>`count(distinct ${schema.interactions.province})::int` }).from(schema.interactions).where(iWhere);
  const byLanguage = await db.select({ language: schema.interactions.language, n: count() }).from(schema.interactions).where(iWhere).groupBy(schema.interactions.language).orderBy(desc(count()));
  const byModule = await db.select({ module: schema.interactions.module, n: count() }).from(schema.interactions).where(iWhere).groupBy(schema.interactions.module);
  const [caseTotals] = await db
    .select({
      n: count(),
      breached: sql<number>`sum(case when ${schema.cases.slaBreached} then 1 else 0 end)::int`,
      acknowledged: sql<number>`sum(case when ${schema.cases.acknowledgedAt} is not null then 1 else 0 end)::int`,
      escalated: sql<number>`sum(case when ${schema.cases.escalationLevel} > 0 then 1 else 0 end)::int`,
    })
    .from(schema.cases)
    .where(cWhere);
  const total = num(totals?.n);
  const casesTotal = num(caseTotals?.n);
  const onTime = casesTotal - num(caseTotals?.breached);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Interactions", value: total },
      { label: "Usagers distincts", value: num(totals?.users) },
      { label: "Provinces couvertes", value: num(totals?.provinces) },
      { label: "Cas ouverts", value: casesTotal },
      { label: "Respect des délais", value: pct(onTime, casesTotal) },
    ],
    sections: [
      {
        title: "Couverture linguistique",
        columns: [
          { key: "language", label: "Langue" },
          { key: "n", label: "Interactions", align: "right" },
          { key: "share", label: "Part", align: "right" },
        ],
        rows: byLanguage.map((r) => ({ language: r.language ?? "—", n: r.n, share: pct(r.n, total) })),
        note: `Dénominateur : ${total} interactions du trimestre.`,
      },
      {
        title: "Répartition par module",
        columns: [
          { key: "module", label: "Module" },
          { key: "n", label: "Interactions", align: "right" },
          { key: "share", label: "Part", align: "right" },
        ],
        rows: byModule.map((r) => ({ module: r.module, n: r.n, share: pct(r.n, total) })),
      },
      {
        title: "Qualité de service",
        columns: [
          { key: "indicator", label: "Indicateur" },
          { key: "value", label: "Valeur", align: "right" },
          { key: "denominator", label: "Dénominateur" },
        ],
        rows: [
          { indicator: "Cas pris en charge (accusé de réception)", value: suppress(num(caseTotals?.acknowledged)), denominator: `${casesTotal} cas` },
          { indicator: "Cas escaladés", value: suppress(num(caseTotals?.escalated)), denominator: `${casesTotal} cas` },
          { indicator: "Cas hors délai", value: suppress(num(caseTotals?.breached)), denominator: `${casesTotal} cas` },
          { indicator: "Respect des délais", value: pct(onTime, casesTotal), denominator: `${casesTotal} cas` },
        ],
      },
    ],
  };
}

async function monthlyAiPerformance({ from, to }: BuilderContext): Promise<BuiltReport> {
  const db = await getDb();
  const iWhere = and(gte(schema.interactions.createdAt, from), lt(schema.interactions.createdAt, to));
  const [totals] = await db
    .select({
      n: count(),
      avgConfidence: avg(schema.interactions.confidence),
      low: sql<number>`sum(case when ${schema.interactions.confidence} < 0.55 then 1 else 0 end)::int`,
      failed: sql<number>`sum(case when ${schema.interactions.status} = 'failed' then 1 else 0 end)::int`,
      escalated: sql<number>`sum(case when ${schema.interactions.escalationRequired} then 1 else 0 end)::int`,
    })
    .from(schema.interactions)
    .where(iWhere);
  const overrides = await db
    .select({ field: schema.aiOverrides.field, n: count() })
    .from(schema.aiOverrides)
    .where(and(gte(schema.aiOverrides.createdAt, from), lt(schema.aiOverrides.createdAt, to)))
    .groupBy(schema.aiOverrides.field);
  const byCapability = await db
    .select({
      capability: schema.aiUsageLogs.capability,
      calls: count(),
      failures: sql<number>`sum(case when ${schema.aiUsageLogs.success} then 0 else 1 end)::int`,
      avgMs: avg(schema.aiUsageLogs.durationMs),
    })
    .from(schema.aiUsageLogs)
    .where(and(gte(schema.aiUsageLogs.createdAt, from), lt(schema.aiUsageLogs.createdAt, to)))
    .groupBy(schema.aiUsageLogs.capability);
  const byLanguage = await db
    .select({ language: schema.interactions.language, n: count(), avgConfidence: avg(schema.interactions.confidence) })
    .from(schema.interactions)
    .where(iWhere)
    .groupBy(schema.interactions.language);
  const total = num(totals?.n);
  const overrideTotal = overrides.reduce((s, r) => s + num(r.n), 0);
  return {
    freshness: await freshnessOf(from, to),
    summary: [
      { label: "Interactions analysées", value: total },
      { label: "Confiance moyenne", value: Math.round(num(totals?.avgConfidence) * 100) / 100 },
      { label: "Interactions à confiance faible", value: pct(num(totals?.low), total) },
      { label: "Corrections humaines", value: overrideTotal },
      { label: "Taux d'échec technique", value: pct(num(totals?.failed), total) },
    ],
    sections: [
      {
        title: "Confiance par langue",
        columns: [
          { key: "language", label: "Langue" },
          { key: "n", label: "Interactions", align: "right" },
          { key: "confidence", label: "Confiance moyenne", align: "right" },
        ],
        rows: byLanguage.map((r) => ({ language: r.language ?? "—", n: r.n, confidence: Math.round(num(r.avgConfidence) * 100) / 100 })),
        note: `Dénominateur : ${total} interactions.`,
      },
      {
        title: "Corrections humaines",
        description: "Chaque correction est motivée par écrit et alimente l'amélioration des protocoles.",
        columns: [
          { key: "field", label: "Champ corrigé" },
          { key: "n", label: "Corrections", align: "right", suppress: true },
          { key: "rate", label: "Taux", align: "right" },
        ],
        rows: overrides.map((r) => ({ field: r.field, n: suppress(r.n), rate: pct(num(r.n), total) })),
      },
      {
        title: "Fiabilité technique par capacité",
        columns: [
          { key: "capability", label: "Capacité" },
          { key: "calls", label: "Appels", align: "right" },
          { key: "failures", label: "Échecs", align: "right" },
          { key: "avgMs", label: "Durée moyenne (ms)", align: "right" },
        ],
        rows: byCapability.map((r) => ({ capability: r.capability, calls: r.calls, failures: num(r.failures), avgMs: Math.round(num(r.avgMs)) })),
      },
    ],
  };
}

async function monthlyCostUsage({ from, to, scope }: BuilderContext): Promise<BuiltReport> {
  const breakdown = await acuBreakdown({ tenantId: scope.tenantId ?? null, organisationId: scope.organisationId ?? null, from, to });
  const db = await getDb();
  let cap: number | null = null;
  let tenantName: string | null = null;
  if (scope.tenantId) {
    const [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, scope.tenantId));
    cap = t?.acuMonthlyCap ?? null;
    tenantName = t?.name ?? null;
  }
  return {
    freshness: new Date().toISOString(),
    summary: [
      { label: "Tenant", value: tenantName ?? "Tous" },
      { label: "ACU consommées", value: breakdown.totalAcu },
      { label: "Plafond mensuel", value: cap ?? "non plafonné" },
      { label: "Coût estimé (USD)", value: breakdown.costUsd },
      { label: "Coût par interaction (USD)", value: breakdown.costPerInteractionUsd },
    ],
    sections: [
      {
        title: "Consommation par capacité",
        columns: [
          { key: "task", label: "Capacité" },
          { key: "calls", label: "Appels", align: "right" },
          { key: "units", label: "Unités brutes", align: "right" },
          { key: "acu", label: "ACU", align: "right" },
        ],
        rows: breakdown.byTask.map((r) => ({ task: r.task, calls: r.calls, units: Math.round(num(r.units) * 100) / 100, acu: Math.round(num(r.acu) * 1000) / 1000 })),
        note: `Table de conversion : 1 ACU = ${breakdown.conversion.llmPer1kTokens} × 1 000 jetons pondérés · STT ${breakdown.conversion.sttPerMinute} ACU/min · TTS ${breakdown.conversion.ttsPer1kChars} ACU/1 000 caractères · vision ${breakdown.conversion.visionPerImage} ACU/image.`,
      },
      {
        title: "Consommation par module",
        columns: [
          { key: "module", label: "Module" },
          { key: "calls", label: "Appels", align: "right" },
          { key: "acu", label: "ACU", align: "right" },
        ],
        rows: breakdown.byModule.map((r) => ({ module: r.module ?? "—", calls: r.calls, acu: Math.round(num(r.acu) * 1000) / 1000 })),
      },
      {
        title: "Consommation par langue",
        columns: [
          { key: "language", label: "Langue" },
          { key: "calls", label: "Appels", align: "right" },
          { key: "acu", label: "ACU", align: "right" },
        ],
        rows: breakdown.byLanguage.map((r) => ({ language: r.language ?? "—", calls: r.calls, acu: Math.round(num(r.acu) * 1000) / 1000 })),
      },
    ],
  };
}

const BUILDERS: Record<ReportType, (ctx: BuilderContext) => Promise<BuiltReport>> = {
  daily_usage: dailyUsage,
  weekly_health_trends: weeklyHealthTrends,
  weekly_agri_risk: weeklyAgriRisk,
  weekly_education_support: weeklyEducationSupport,
  monthly_regional_activity: monthlyRegionalActivity,
  monthly_ngo_impact: monthlyNgoImpact,
  quarterly_government_programme: quarterlyGovernmentProgramme,
  monthly_ai_performance: monthlyAiPerformance,
  monthly_cost_usage: monthlyCostUsage,
};
