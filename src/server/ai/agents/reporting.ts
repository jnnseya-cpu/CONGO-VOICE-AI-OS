/**
 * Reporting Agent — aggregate intelligence for dashboards, alerts and exports.
 * Pure SQL aggregation; the "insight of the day" compares the last 7 days with the
 * previous 7 so institutions see what is changing, not just totals.
 */
import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { ModuleType } from "@server/db/schema";

const DAY = 24 * 3600 * 1000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export interface Trend {
  value: number;
  previous: number;
  deltaPct: number | null;
}
const trend = (value: number, previous: number): Trend => ({ value, previous, deltaPct: previous === 0 ? null : Math.round(((value - previous) / previous) * 100) });

export async function commandStats() {
  const db = await getDb();
  const today = startOfToday();
  const yesterday = new Date(today.getTime() - DAY);
  const week = new Date(Date.now() - 7 * DAY);
  const prevWeek = new Date(Date.now() - 14 * DAY);

  const c = async (where: ReturnType<typeof and>) => (await db.select({ n: count() }).from(schema.interactions).where(where))[0].n;
  const activeUsersToday = (await db.select({ n: sql<number>`count(distinct ${schema.interactions.userId})::int` }).from(schema.interactions).where(gte(schema.interactions.createdAt, today)))[0].n;
  const activeUsersYesterday = (await db.select({ n: sql<number>`count(distinct ${schema.interactions.userId})::int` }).from(schema.interactions).where(and(gte(schema.interactions.createdAt, yesterday), lt(schema.interactions.createdAt, today))))[0].n;
  const voiceToday = await c(and(gte(schema.interactions.createdAt, today), eq(schema.interactions.channel, "voice")));
  const voiceYesterday = await c(and(gte(schema.interactions.createdAt, yesterday), lt(schema.interactions.createdAt, today), eq(schema.interactions.channel, "voice")));
  const openCases = (await db.select({ n: count() }).from(schema.cases).where(inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"])))[0].n;
  const openCasesLastWeek = (await db.select({ n: count() }).from(schema.cases).where(and(inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]), lt(schema.cases.createdAt, week))))[0].n;
  const critical = (await db.select({ n: count() }).from(schema.cases).where(and(eq(schema.cases.severity, "critical"), inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]))))[0].n;
  const criticalPrev = (await db.select({ n: count() }).from(schema.cases).where(and(eq(schema.cases.severity, "critical"), gte(schema.cases.createdAt, prevWeek), lt(schema.cases.createdAt, week))))[0].n;

  const perModule = async (m: ModuleType) => ({
    today: await c(and(gte(schema.interactions.createdAt, today), eq(schema.interactions.module, m))),
    week: await c(and(gte(schema.interactions.createdAt, week), eq(schema.interactions.module, m))),
    prevWeek: await c(and(gte(schema.interactions.createdAt, prevWeek), lt(schema.interactions.createdAt, week), eq(schema.interactions.module, m))),
  });
  const [health, agriculture, education] = await Promise.all([perModule("health"), perModule("agriculture"), perModule("education")]);
  const urgentHealth = (await db.select({ n: count() }).from(schema.cases).where(and(eq(schema.cases.module, "health"), inArray(schema.cases.severity, ["high", "critical"]), inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]))))[0].n;
  const agriAlerts = (await db.select({ n: count() }).from(schema.agricultureReports).where(and(eq(schema.agricultureReports.urgent, true), gte(schema.agricultureReports.createdAt, week))))[0].n;
  const eduTopics = (await db.select({ n: sql<number>`count(distinct ${schema.educationSessions.topic})::int` }).from(schema.educationSessions).where(gte(schema.educationSessions.createdAt, week)))[0].n;

  const languages = await db.select({ language: schema.interactions.language, n: count() }).from(schema.interactions).where(and(gte(schema.interactions.createdAt, prevWeek), isNotNull(schema.interactions.language))).groupBy(schema.interactions.language).orderBy(desc(count()));
  const provinces = await db.select({ province: schema.interactions.province, n: count() }).from(schema.interactions).where(and(gte(schema.interactions.createdAt, prevWeek), isNotNull(schema.interactions.province))).groupBy(schema.interactions.province).orderBy(desc(count())).limit(8);
  const totalInteractions = (await db.select({ n: count() }).from(schema.interactions))[0].n;
  const totalUsers = (await db.select({ n: count() }).from(schema.users))[0].n;

  return {
    activeUsersToday: trend(activeUsersToday, activeUsersYesterday),
    voiceInteractionsToday: trend(voiceToday, voiceYesterday),
    casesNeedingFollowUp: trend(openCases, openCasesLastWeek),
    criticalAlerts: trend(critical, criticalPrev),
    modules: {
      health: { ...health, urgent: urgentHealth },
      agriculture: { ...agriculture, alerts: agriAlerts },
      education: { ...education, topics: eduTopics },
    },
    languages: languages.map((l) => ({ language: l.language as string, count: l.n })),
    provinces: provinces.map((p) => ({ province: p.province as string, count: p.n })),
    totals: { interactions: totalInteractions, users: totalUsers },
  };
}

export async function recentActivity(limit = 8, module?: ModuleType) {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.interactions.id, module: schema.interactions.module, channel: schema.interactions.channel, intent: schema.interactions.intent, summary: schema.interactions.summary, understanding: schema.interactions.understanding, province: schema.interactions.province, severity: schema.interactions.severity, escalated: schema.interactions.escalationRequired, createdAt: schema.interactions.createdAt, status: schema.interactions.status, language: schema.interactions.language })
    .from(schema.interactions)
    .where(module ? eq(schema.interactions.module, module) : undefined)
    .orderBy(desc(schema.interactions.createdAt))
    .limit(limit);
  return rows;
}

/** Institution-facing alerts derived from data: clusters, critical cases, overdue follow-ups. */
export async function importantAlerts(limit = 6) {
  const db = await getDb();
  const week = new Date(Date.now() - 7 * DAY);
  const prevWeek = new Date(Date.now() - 14 * DAY);
  const alerts: Array<{ id: string; kind: "health" | "agriculture" | "education" | "case"; title: string; detail: string; at: Date; severity: "critical" | "high" | "medium" }> = [];

  const critical = await db.select().from(schema.cases).where(and(eq(schema.cases.severity, "critical"), inArray(schema.cases.status, ["open", "assigned", "escalated", "in_progress"]))).orderBy(desc(schema.cases.createdAt)).limit(3);
  for (const c of critical) alerts.push({ id: `case-${c.id}`, kind: "case", title: `Cas critique ${c.module === "health" ? "santé" : c.module === "agriculture" ? "agricole" : "éducation"}${c.province ? ` — ${c.province}` : ""}`, detail: c.title, at: c.createdAt, severity: "critical" });

  const healthNow = await db.select({ province: schema.healthTriageRecords.province, topic: schema.healthTriageRecords.topic, n: count() }).from(schema.healthTriageRecords).where(gte(schema.healthTriageRecords.createdAt, week)).groupBy(schema.healthTriageRecords.province, schema.healthTriageRecords.topic);
  const healthPrev = await db.select({ province: schema.healthTriageRecords.province, topic: schema.healthTriageRecords.topic, n: count() }).from(schema.healthTriageRecords).where(and(gte(schema.healthTriageRecords.createdAt, prevWeek), lt(schema.healthTriageRecords.createdAt, week))).groupBy(schema.healthTriageRecords.province, schema.healthTriageRecords.topic);
  for (const h of healthNow) {
    const prev = healthPrev.find((p) => p.province === h.province && p.topic === h.topic)?.n ?? 0;
    if (h.n >= 3 && h.n > prev * 1.3) alerts.push({ id: `health-${h.province}-${h.topic}`, kind: "health", title: `Hausse des demandes « ${TOPIC_FR[h.topic ?? ""] ?? h.topic} »${h.province ? ` dans la province ${h.province}` : ""}`, detail: `${h.n} demandes sur 7 jours (contre ${prev} la semaine précédente).`, at: new Date(), severity: h.n > prev * 2 ? "high" : "medium" });
  }
  const agri = await db.select({ province: schema.agricultureReports.province, issue: schema.agricultureReports.issueType, crop: schema.agricultureReports.cropType, n: count() }).from(schema.agricultureReports).where(and(gte(schema.agricultureReports.createdAt, week), inArray(schema.agricultureReports.issueType, ["crop_disease", "pest", "livestock_illness"]))).groupBy(schema.agricultureReports.province, schema.agricultureReports.issueType, schema.agricultureReports.cropType).orderBy(desc(count())).limit(3);
  for (const a of agri) if (a.n >= 2) alerts.push({ id: `agri-${a.province}-${a.issue}-${a.crop}`, kind: "agriculture", title: `Signalements ${ISSUE_FR[a.issue ?? ""] ?? a.issue} sur ${a.crop ?? "cultures"}${a.province ? ` — ${a.province}` : ""}`, detail: `${a.n} producteurs concernés cette semaine.`, at: new Date(), severity: a.n >= 5 ? "high" : "medium" });
  const edu = await db.select({ province: schema.educationSessions.province, subject: schema.educationSessions.subject, n: count() }).from(schema.educationSessions).where(and(gte(schema.educationSessions.createdAt, week), eq(schema.educationSessions.progressSignal, "needs_support"))).groupBy(schema.educationSessions.province, schema.educationSessions.subject).orderBy(desc(count())).limit(2);
  for (const e of edu) if (e.n >= 2) alerts.push({ id: `edu-${e.province}-${e.subject}`, kind: "education", title: `Hausse des demandes d'aide en ${SUBJECT_FR[e.subject ?? ""] ?? e.subject}${e.province ? ` au ${e.province}` : ""}`, detail: `${e.n} apprenants en difficulté repérés cette semaine.`, at: new Date(), severity: "medium" });

  return alerts.sort((a, b) => SEV[a.severity] - SEV[b.severity]).slice(0, limit);
}
const SEV = { critical: 0, high: 1, medium: 2 };

/** One data-backed recommendation for decision makers. */
export async function insightOfTheDay() {
  const db = await getDb();
  const week = new Date(Date.now() - 7 * DAY);
  const prevWeek = new Date(Date.now() - 14 * DAY);
  const now = await db.select({ topic: schema.healthTriageRecords.topic, provinces: sql<number>`count(distinct ${schema.healthTriageRecords.province})::int`, n: count() }).from(schema.healthTriageRecords).where(gte(schema.healthTriageRecords.createdAt, week)).groupBy(schema.healthTriageRecords.topic).orderBy(desc(count())).limit(1);
  if (now.length && now[0].n >= 3) {
    const prev = (await db.select({ n: count() }).from(schema.healthTriageRecords).where(and(gte(schema.healthTriageRecords.createdAt, prevWeek), lt(schema.healthTriageRecords.createdAt, week), eq(schema.healthTriageRecords.topic, now[0].topic ?? ""))))[0].n;
    const pct = prev === 0 ? null : Math.round(((now[0].n - prev) / prev) * 100);
    const topic = TOPIC_FR[now[0].topic ?? ""] ?? now[0].topic;
    return {
      headline: pct !== null && pct > 0 ? `Le système a détecté une augmentation de ${pct}% des demandes liées au ${topic} dans ${now[0].provinces} province(s) au cours des 7 derniers jours.` : `${now[0].n} demandes liées au ${topic} ont été traitées dans ${now[0].provinces} province(s) au cours des 7 derniers jours.`,
      recommendation: now[0].topic === "fever_malaria" ? "Renforcer la sensibilisation et la distribution de moustiquaires dans les zones à risque ; vérifier les stocks de tests rapides." : now[0].topic === "diarrhoea" ? "Rappeler les gestes de réhydratation (SRO) et vérifier l'accès à l'eau potable dans les zones concernées." : now[0].topic === "maternal_health" ? "Mobiliser les sages-femmes et rappeler les consultations prénatales." : "Partager cette tendance avec les équipes de santé de zone.",
      nextAction: "Notifier les équipes de santé locales et les partenaires.",
      basis: `${now[0].n} enregistrements de triage sur 7 jours`,
    };
  }
  const agri = await db.select({ issue: schema.agricultureReports.issueType, n: count() }).from(schema.agricultureReports).where(gte(schema.agricultureReports.createdAt, week)).groupBy(schema.agricultureReports.issueType).orderBy(desc(count())).limit(1);
  if (agri.length && agri[0].n >= 2) {
    return { headline: `${agri[0].n} signalements « ${ISSUE_FR[agri[0].issue ?? ""] ?? agri[0].issue} » ont été reçus cette semaine.`, recommendation: "Programmer une visite de terrain des agents agricoles dans les zones concernées.", nextAction: "Envoyer un message de prévention aux producteurs de la zone.", basis: `${agri[0].n} rapports agricoles sur 7 jours` };
  }
  return { headline: "Le volume d'interactions est encore faible : les tendances apparaîtront dès les premières centaines d'échanges.", recommendation: "Lancer les sessions de démonstration avec les agents de santé communautaires et les agents agricoles.", nextAction: "Créer les comptes des agents de terrain par province.", basis: "données insuffisantes" };
}

export async function moduleDashboard(module: ModuleType) {
  const db = await getDb();
  const week = new Date(Date.now() - 7 * DAY);
  const base = {
    openCases: await db.select().from(schema.cases).where(and(eq(schema.cases.module, module), inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]))).orderBy(desc(schema.cases.createdAt)).limit(20),
    overdue: (await db.select({ n: count() }).from(schema.cases).where(and(eq(schema.cases.module, module), inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]), lt(schema.cases.followUpDate, new Date()))))[0].n,
    byProvince: await db.select({ province: schema.interactions.province, n: count() }).from(schema.interactions).where(and(eq(schema.interactions.module, module), gte(schema.interactions.createdAt, week))).groupBy(schema.interactions.province).orderBy(desc(count())).limit(8),
  };
  if (module === "health") {
    const topics = await db.select({ topic: schema.healthTriageRecords.topic, n: count() }).from(schema.healthTriageRecords).where(gte(schema.healthTriageRecords.createdAt, week)).groupBy(schema.healthTriageRecords.topic).orderBy(desc(count()));
    const referrals = await db.select({ referral: schema.healthTriageRecords.referralStatus, n: count() }).from(schema.healthTriageRecords).where(gte(schema.healthTriageRecords.createdAt, week)).groupBy(schema.healthTriageRecords.referralStatus);
    const emergencies = (await db.select({ n: count() }).from(schema.healthTriageRecords).where(and(gte(schema.healthTriageRecords.createdAt, week), sql`jsonb_array_length(${schema.healthTriageRecords.emergencyFlags}) > 0`)))[0].n;
    const maternal = (await db.select({ n: count() }).from(schema.healthTriageRecords).where(and(gte(schema.healthTriageRecords.createdAt, week), eq(schema.healthTriageRecords.pregnancyStatus, "pregnant"))))[0].n;
    return { ...base, topics: topics.map((t) => ({ key: t.topic, label: TOPIC_FR[t.topic ?? ""] ?? t.topic, count: t.n })), referrals, emergencies, maternal };
  }
  if (module === "agriculture") {
    const crops = await db.select({ crop: schema.agricultureReports.cropType, n: count() }).from(schema.agricultureReports).where(gte(schema.agricultureReports.createdAt, week)).groupBy(schema.agricultureReports.cropType).orderBy(desc(count()));
    const issues = await db.select({ issue: schema.agricultureReports.issueType, n: count() }).from(schema.agricultureReports).where(gte(schema.agricultureReports.createdAt, week)).groupBy(schema.agricultureReports.issueType).orderBy(desc(count()));
    const urgent = (await db.select({ n: count() }).from(schema.agricultureReports).where(and(gte(schema.agricultureReports.createdAt, week), eq(schema.agricultureReports.urgent, true))))[0].n;
    return { ...base, crops, issues: issues.map((i) => ({ key: i.issue, label: ISSUE_FR[i.issue ?? ""] ?? i.issue, count: i.n })), urgent };
  }
  const subjects = await db.select({ subject: schema.educationSessions.subject, n: count() }).from(schema.educationSessions).where(gte(schema.educationSessions.createdAt, week)).groupBy(schema.educationSessions.subject).orderBy(desc(count()));
  const gaps = await db.select({ topic: schema.educationSessions.topic, n: count() }).from(schema.educationSessions).where(and(gte(schema.educationSessions.createdAt, week), eq(schema.educationSessions.progressSignal, "needs_support"))).groupBy(schema.educationSessions.topic).orderBy(desc(count())).limit(6);
  const ages = await db.select({ age: schema.educationSessions.learnerAgeGroup, n: count() }).from(schema.educationSessions).where(gte(schema.educationSessions.createdAt, week)).groupBy(schema.educationSessions.learnerAgeGroup);
  return { ...base, subjects: subjects.map((s) => ({ key: s.subject, label: SUBJECT_FR[s.subject ?? ""] ?? s.subject, count: s.n })), gaps, ages };
}

export async function adminStats() {
  const db = await getDb();
  const day = new Date(Date.now() - DAY);
  const week = new Date(Date.now() - 7 * DAY);
  const usersByRole = await db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role);
  const usage = await db.select({ capability: schema.aiUsageLogs.capability, calls: count(), cost: sql<number>`coalesce(sum(${schema.aiUsageLogs.estimatedCostUsd}),0)::float`, failures: sql<number>`sum(case when ${schema.aiUsageLogs.success} then 0 else 1 end)::int`, avgMs: sql<number>`coalesce(avg(${schema.aiUsageLogs.durationMs}),0)::int` }).from(schema.aiUsageLogs).where(gte(schema.aiUsageLogs.createdAt, week)).groupBy(schema.aiUsageLogs.capability);
  const failedTranscriptions = (await db.select({ n: count() }).from(schema.interactions).where(and(gte(schema.interactions.createdAt, week), eq(schema.interactions.errorMessage, "empty_transcript"))))[0].n;
  const lowConfidence = (await db.select({ n: count() }).from(schema.interactions).where(and(gte(schema.interactions.createdAt, week), lt(schema.interactions.confidence, 0.55))))[0].n;
  const escalations = (await db.select({ n: count() }).from(schema.cases).where(and(gte(schema.cases.createdAt, week), eq(schema.cases.status, "escalated"))))[0].n;
  const apiErrors = (await db.select({ n: count() }).from(schema.apiRequestLogs).where(and(gte(schema.apiRequestLogs.createdAt, day), gte(schema.apiRequestLogs.statusCode, 500))))[0].n;
  const apiCalls = (await db.select({ n: count(), avgMs: sql<number>`coalesce(avg(${schema.apiRequestLogs.durationMs}),0)::int` }).from(schema.apiRequestLogs).where(gte(schema.apiRequestLogs.createdAt, day)))[0];
  const feedback = (await db.select({ n: count(), avg: sql<number>`coalesce(avg(${schema.feedback.rating}),0)::float`, useful: sql<number>`sum(case when ${schema.feedback.useful} then 1 else 0 end)::int` }).from(schema.feedback))[0];
  const languages = await db.select({ language: schema.interactions.language, n: count() }).from(schema.interactions).where(isNotNull(schema.interactions.language)).groupBy(schema.interactions.language).orderBy(desc(count()));
  const recentErrors = await db.select().from(schema.apiRequestLogs).where(gte(schema.apiRequestLogs.statusCode, 500)).orderBy(desc(schema.apiRequestLogs.createdAt)).limit(10);
  const totalCost = usage.reduce((s, u) => s + Number(u.cost), 0);
  const interactionsWeek = (await db.select({ n: count() }).from(schema.interactions).where(gte(schema.interactions.createdAt, week)))[0].n;
  return { usersByRole, usage, failedTranscriptions, lowConfidence, escalations, apiErrors, apiCalls, feedback, languages, recentErrors, totalCost, interactionsWeek, costPerInteraction: interactionsWeek ? totalCost / interactionsWeek : 0 };
}

/** CSV exports for institutions. */
export async function exportCsv(type: "interactions" | "cases" | "health" | "agriculture" | "education" | "audit" | "usage", days = 30): Promise<string> {
  const db = await getDb();
  const since = new Date(Date.now() - days * DAY);
  let rows: Record<string, unknown>[] = [];
  switch (type) {
    case "interactions":
      rows = await db.select({ id: schema.interactions.id, date: schema.interactions.createdAt, module: schema.interactions.module, channel: schema.interactions.channel, language: schema.interactions.language, province: schema.interactions.province, intent: schema.interactions.intent, severity: schema.interactions.severity, risk: schema.interactions.riskScore, confidence: schema.interactions.confidence, escalated: schema.interactions.escalationRequired, status: schema.interactions.status, latencyMs: schema.interactions.latencyMs }).from(schema.interactions).where(gte(schema.interactions.createdAt, since)).orderBy(desc(schema.interactions.createdAt));
      break;
    case "cases":
      rows = await db.select({ id: schema.cases.id, date: schema.cases.createdAt, module: schema.cases.module, title: schema.cases.title, severity: schema.cases.severity, status: schema.cases.status, escalationLevel: schema.cases.escalationLevel, province: schema.cases.province, followUpDate: schema.cases.followUpDate, outcome: schema.cases.outcome }).from(schema.cases).where(gte(schema.cases.createdAt, since)).orderBy(desc(schema.cases.createdAt));
      break;
    case "health":
      rows = await db.select({ id: schema.healthTriageRecords.id, date: schema.healthTriageRecords.createdAt, province: schema.healthTriageRecords.province, topic: schema.healthTriageRecords.topic, ageGroup: schema.healthTriageRecords.ageGroup, pregnancy: schema.healthTriageRecords.pregnancyStatus, emergencyFlags: schema.healthTriageRecords.emergencyFlags, referral: schema.healthTriageRecords.referralStatus }).from(schema.healthTriageRecords).where(gte(schema.healthTriageRecords.createdAt, since));
      break;
    case "agriculture":
      rows = await db.select({ id: schema.agricultureReports.id, date: schema.agricultureReports.createdAt, province: schema.agricultureReports.province, crop: schema.agricultureReports.cropType, issue: schema.agricultureReports.issueType, urgent: schema.agricultureReports.urgent, confidence: schema.agricultureReports.confidence, diagnosis: schema.agricultureReports.aiDiagnosis }).from(schema.agricultureReports).where(gte(schema.agricultureReports.createdAt, since));
      break;
    case "education":
      rows = await db.select({ id: schema.educationSessions.id, date: schema.educationSessions.createdAt, province: schema.educationSessions.province, subject: schema.educationSessions.subject, topic: schema.educationSessions.topic, age: schema.educationSessions.learnerAgeGroup, level: schema.educationSessions.difficultyLevel, progress: schema.educationSessions.progressSignal }).from(schema.educationSessions).where(gte(schema.educationSessions.createdAt, since));
      break;
    case "audit":
      rows = await db.select({ id: schema.auditLogs.id, date: schema.auditLogs.createdAt, action: schema.auditLogs.action, actorRole: schema.auditLogs.actorRole, entityType: schema.auditLogs.entityType, entityId: schema.auditLogs.entityId, summary: schema.auditLogs.aiSummary }).from(schema.auditLogs).where(gte(schema.auditLogs.createdAt, since)).orderBy(desc(schema.auditLogs.createdAt));
      break;
    case "usage":
      rows = await db.select({ date: schema.aiUsageLogs.createdAt, capability: schema.aiUsageLogs.capability, inputTokens: schema.aiUsageLogs.inputTokens, outputTokens: schema.aiUsageLogs.outputTokens, audioSeconds: schema.aiUsageLogs.audioSeconds, costUsd: schema.aiUsageLogs.estimatedCostUsd, durationMs: schema.aiUsageLogs.durationMs, success: schema.aiUsageLogs.success }).from(schema.aiUsageLogs).where(gte(schema.aiUsageLogs.createdAt, since));
      break;
  }
  return toCsv(rows);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export const TOPIC_FR: Record<string, string> = {
  fever_malaria: "paludisme / fièvre",
  child_illness: "maladies de l'enfant",
  maternal_health: "santé maternelle",
  diarrhoea: "diarrhée",
  nutrition: "nutrition",
  vaccination: "vaccination",
  medication: "médicaments",
  injury_emergency: "urgences / blessures",
  respiratory: "respiratoire",
  other: "autre",
};
export const ISSUE_FR: Record<string, string> = {
  crop_disease: "maladie des cultures",
  pest: "ravageurs",
  soil: "sols",
  seed_selection: "semences",
  fertiliser: "engrais",
  livestock_illness: "maladie du bétail",
  planting_calendar: "calendrier cultural",
  harvest_storage: "récolte et stockage",
  weather: "météo",
  market_price: "prix du marché",
  other: "autre",
};
export const SUBJECT_FR: Record<string, string> = {
  maths: "mathématiques",
  french: "français",
  reading: "lecture",
  science: "sciences",
  history_geography: "histoire-géographie",
  civics: "éducation civique",
  exam_prep: "préparation aux examens",
  career: "orientation",
  parent_support: "accompagnement des parents",
  other: "autre",
};
