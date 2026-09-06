import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { commandStats, importantAlerts, adminStats } from "@server/ai/agents/reporting";
import { PageHeader } from "@client/components/ui";
import {
  AccessNotice,
  BarList,
  LANGUAGE_FR,
  ModuleBadge,
  MODULE_FR,
  Panel,
  SHARE_COLORS,
  ShareBar,
  SeverityBadge,
  StatTile,
  StatusBadge,
  Td,
  Th,
  TableShell,
  dueIn,
  fmt,
  nowMs,
  since,
  todayLabelFr,
} from "@client/components/dashboard/Common";
import { IconAlert, IconBriefcase, IconChart, IconFlame, IconGraduation, IconLeaf, IconHeart, IconMic, IconUsers } from "@client/components/icons";

export const metadata = { title: "Tableau de bord" };
export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;
const ACTIVE = ["open", "open_emergency", "assigned", "acknowledged", "in_progress", "needs_follow_up", "reassigned", "escalated", "escalated_up"] as const;

async function govData() {
  const db = await getDb();
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = new Date(now.getTime() - 7 * DAY);
  const month = new Date(now.getTime() - 30 * DAY);

  const distinct = async (from: Date) =>
    (await db.select({ n: sql<number>`count(distinct ${schema.interactions.userId})::int` }).from(schema.interactions).where(gte(schema.interactions.createdAt, from)))[0].n;

  const [activeDay, activeWeek, activeMonth] = await Promise.all([distinct(today), distinct(week), distinct(month)]);

  const byModule = await db
    .select({ module: schema.interactions.module, n: count() })
    .from(schema.interactions)
    .where(gte(schema.interactions.createdAt, week))
    .groupBy(schema.interactions.module)
    .orderBy(desc(count()));

  const escalations = (await db.select({ n: count() }).from(schema.cases).where(and(gte(schema.cases.createdAt, week), inArray(schema.cases.status, ["escalated", "escalated_up"]))))[0].n;

  const criticalUnack = await db
    .select()
    .from(schema.cases)
    .where(and(inArray(schema.cases.severity, ["critical", "high"]), inArray(schema.cases.status, [...ACTIVE]), isNull(schema.cases.acknowledgedAt)))
    .orderBy(desc(schema.cases.severity), schema.cases.slaDueAt)
    .limit(6);

  const overdue = await db
    .select()
    .from(schema.cases)
    .where(and(inArray(schema.cases.status, [...ACTIVE]), isNotNull(schema.cases.followUpDate), lt(schema.cases.followUpDate, now)))
    .orderBy(schema.cases.followUpDate)
    .limit(6);

  const overdueCount = (await db.select({ n: count() }).from(schema.cases).where(and(inArray(schema.cases.status, [...ACTIVE]), isNotNull(schema.cases.followUpDate), lt(schema.cases.followUpDate, now))))[0].n;

  const slaBreached = (await db.select({ n: count() }).from(schema.cases).where(and(inArray(schema.cases.status, [...ACTIVE]), isNotNull(schema.cases.slaDueAt), lt(schema.cases.slaDueAt, now))))[0].n;

  const provinceRows = await db
    .select({
      province: schema.interactions.province,
      total: count(),
      health: sql<number>`sum(case when ${schema.interactions.module} = 'health' then 1 else 0 end)::int`,
      agriculture: sql<number>`sum(case when ${schema.interactions.module} = 'agriculture' then 1 else 0 end)::int`,
      education: sql<number>`sum(case when ${schema.interactions.module} = 'education' then 1 else 0 end)::int`,
      escalated: sql<number>`sum(case when ${schema.interactions.escalationRequired} then 1 else 0 end)::int`,
    })
    .from(schema.interactions)
    .where(and(gte(schema.interactions.createdAt, month), isNotNull(schema.interactions.province)))
    .groupBy(schema.interactions.province)
    .orderBy(desc(count()))
    .limit(15);

  const recent = await db
    .select({
      id: schema.interactions.id,
      module: schema.interactions.module,
      channel: schema.interactions.channel,
      language: schema.interactions.language,
      province: schema.interactions.province,
      summary: schema.interactions.summary,
      understanding: schema.interactions.understanding,
      severity: schema.interactions.severity,
      escalated: schema.interactions.escalationRequired,
      createdAt: schema.interactions.createdAt,
    })
    .from(schema.interactions)
    .orderBy(desc(schema.interactions.createdAt))
    .limit(12);

  return { activeDay, activeWeek, activeMonth, byModule, escalations, criticalUnack, overdue, overdueCount, slaBreached, provinceRows, recent };
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/tableau-de-bord");

  if (!hasPermission(session.role, "dashboard:gov")) {
    if (hasPermission(session.role, "dashboard:health")) redirect("/tableau-de-bord/sante");
    if (hasPermission(session.role, "dashboard:agri")) redirect("/tableau-de-bord/agriculture");
    if (hasPermission(session.role, "dashboard:edu")) redirect("/tableau-de-bord/education");
    return <AccessNotice title="Tableau de bord réservé aux institutions" hint="Ce tableau de bord est destiné aux agents de terrain, aux ONG partenaires et aux administrations. Votre historique personnel reste accessible depuis « Messages »." />;
  }

  const canSeeCost = hasPermission(session.role, "dashboard:admin");
  const [stats, data, alerts, admin] = await Promise.all([
    commandStats().catch(() => null),
    govData(),
    importantAlerts(8).catch(() => []),
    canSeeCost ? adminStats().catch(() => null) : Promise.resolve(null),
  ]);
  const now = nowMs();

  const moduleRows = data.byModule.map((m) => ({ label: MODULE_FR[m.module] ?? m.module, value: m.n }));
  const languageRows = (stats?.languages ?? []).map((l, i) => ({ label: LANGUAGE_FR[l.language] ?? l.language, value: l.count, color: SHARE_COLORS[i % SHARE_COLORS.length] }));
  const provinceBars = data.provinceRows.slice(0, 8).map((p) => ({ label: p.province ?? "Non renseignée", value: p.total, sub: `${fmt(p.health)} santé · ${fmt(p.agriculture)} agriculture · ${fmt(p.education)} éducation` }));

  const todo = [
    ...data.criticalUnack.map((c) => ({ id: `c-${c.id}`, href: `/cas/${c.id}`, kind: "Cas non pris en charge", title: c.title, meta: `${MODULE_FR[c.module]} · ${c.province ?? "province non renseignée"} · ouvert ${since(c.createdAt, now).toLowerCase()}`, tone: "danger" as const, severity: c.severity })),
    ...data.overdue.map((c) => ({ id: `f-${c.id}`, href: `/cas/${c.id}`, kind: "Suivi en retard", title: c.title, meta: `${MODULE_FR[c.module]} · échéance ${dueIn(c.followUpDate, now).label}`, tone: "warn" as const, severity: c.severity })),
    ...alerts.slice(0, 4).map((a) => ({ id: `a-${a.id}`, href: "/tableau-de-bord#alertes", kind: "Nouvelle alerte", title: a.title, meta: a.detail, tone: a.severity === "critical" ? ("danger" as const) : ("warn" as const), severity: a.severity === "medium" ? "medium" : a.severity })),
  ];

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Tableau de bord national"
        subtitle={`Activité de la plateforme, charge des équipes et alertes — ${todayLabelFr()}.`}
        actions={
          <>
            <Link href="/cas" className="btn btn-ghost">
              File des cas
            </Link>
            <Link href="/rapports" className="btn btn-primary">
              Rapports
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Citoyens actifs aujourd'hui" value={fmt(data.activeDay)} hint={`${fmt(data.activeWeek)} sur 7 jours · ${fmt(data.activeMonth)} sur 30 jours`} icon={<IconUsers size={16} />} tone="brand" />
        <StatTile label="Interactions vocales aujourd'hui" value={fmt(stats?.voiceInteractionsToday.value ?? 0)} hint={`${fmt(stats?.totals.interactions ?? 0)} interactions enregistrées au total`} icon={<IconMic size={16} />} tone="health" />
        <StatTile label="Escalades (7 jours)" value={fmt(data.escalations)} hint={`${fmt(data.slaBreached)} cas hors délai · ${fmt(data.overdueCount)} suivis en retard`} icon={<IconAlert size={16} />} tone="danger" href="/cas?status=escalated" />
        {canSeeCost ? (
          <StatTile label="Coût par interaction" value={`${(admin?.costPerInteraction ?? 0).toFixed(3)} $`} hint={`${(admin?.totalCost ?? 0).toFixed(2)} $ sur 7 jours · ${fmt(admin?.interactionsWeek ?? 0)} interactions`} icon={<IconChart size={16} />} tone="edu" href="/admin" />
        ) : (
          <StatTile label="Cas ouverts" value={fmt(stats?.casesNeedingFollowUp.value ?? 0)} hint={`${fmt(stats?.criticalAlerts.value ?? 0)} cas critiques en attente`} icon={<IconBriefcase size={16} />} tone="warn" href="/cas" />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <Panel title="À traiter aujourd'hui" hint="Cas critiques sans accusé de réception, suivis en retard et alertes détectées par le système.">
            {todo.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">Rien d&apos;urgent : tous les cas critiques ont été pris en charge et aucun suivi n&apos;est en retard.</p>
            ) : (
              <ul className="divide-y divide-line">
                {todo.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2">
                      <span className={`icon-tile mt-0.5 h-8 w-8 ${item.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                        {item.tone === "danger" ? <IconAlert size={16} /> : <IconFlame size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{item.kind}</span>
                          <SeverityBadge severity={item.severity} />
                        </span>
                        <span className="mt-0.5 block truncate text-[13.5px] font-medium text-ink">{item.title}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted">{item.meta}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Interactions par module" hint="7 derniers jours.">
              <BarList rows={moduleRows} tone="brand" />
            </Panel>
            <Panel title="Répartition par langue" hint="14 derniers jours.">
              <ShareBar rows={languageRows} />
            </Panel>
          </div>

          <Panel title="Classement des provinces" hint="Interactions sur 30 jours." action={<Link href="#cartes" className="link">Voir le tableau complet</Link>}>
            <BarList rows={provinceBars} tone="agri" />
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { key: "health", label: "Santé", href: "/tableau-de-bord/sante", icon: <IconHeart size={16} />, tone: "health" as const, today: stats?.modules.health.today ?? 0, week: stats?.modules.health.week ?? 0, prev: stats?.modules.health.prevWeek ?? 0, extraLabel: "cas urgents", extra: stats?.modules.health.urgent ?? 0 },
              { key: "agriculture", label: "Agriculture", href: "/tableau-de-bord/agriculture", icon: <IconLeaf size={16} />, tone: "agri" as const, today: stats?.modules.agriculture.today ?? 0, week: stats?.modules.agriculture.week ?? 0, prev: stats?.modules.agriculture.prevWeek ?? 0, extraLabel: "signalements urgents", extra: stats?.modules.agriculture.alerts ?? 0 },
              { key: "education", label: "Éducation", href: "/tableau-de-bord/education", icon: <IconGraduation size={16} />, tone: "edu" as const, today: stats?.modules.education.today ?? 0, week: stats?.modules.education.week ?? 0, prev: stats?.modules.education.prevWeek ?? 0, extraLabel: "sujets distincts", extra: stats?.modules.education.topics ?? 0 },
            ].map((m) => {
              const delta = m.prev === 0 ? null : Math.round(((m.week - m.prev) / m.prev) * 100);
              return (
                <Link key={m.key} href={m.href} className="card card-hover block p-4">
                  <div className="flex items-center gap-2">
                    <span className={`icon-tile h-8 w-8 ${m.tone === "health" ? "bg-health-soft text-health" : m.tone === "agri" ? "bg-agri-soft text-agri" : "bg-edu-soft text-edu"}`}>{m.icon}</span>
                    <span className="text-[13.5px] font-semibold text-ink">{m.label}</span>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-[24px] font-bold leading-none tabular-nums text-ink">{fmt(m.week)}</span>
                    <span className="pb-0.5 text-[12px] text-muted">sur 7 jours</span>
                    {delta !== null && <span className={`pb-0.5 text-[12px] font-semibold ${delta >= 0 ? "text-ok" : "text-danger"}`}>{delta >= 0 ? "+" : ""}{delta}%</span>}
                  </div>
                  <p className="mt-2 text-[12px] text-muted">
                    {fmt(m.today)} aujourd&apos;hui · {fmt(m.extra)} {m.extraLabel}
                  </p>
                </Link>
              );
            })}
          </div>

          <Panel id="cartes" title="Carte des provinces (tableau)" hint="Substitut tabulaire de la carte : activité par province sur 30 jours, tous modules confondus.">
            <TableShell
              head={
                <>
                  <Th>Province</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Santé</Th>
                  <Th className="text-right">Agriculture</Th>
                  <Th className="text-right">Éducation</Th>
                  <Th className="text-right">Escalades</Th>
                  <Th>Part</Th>
                </>
              }
              empty={data.provinceRows.length === 0}
            >
              {data.provinceRows.map((p) => {
                const max = data.provinceRows[0]?.total || 1;
                return (
                  <tr key={p.province ?? "none"} className="hover:bg-surface-2">
                    <Td className="font-medium text-ink">{p.province ?? "Non renseignée"}</Td>
                    <Td className="text-right font-semibold tabular-nums text-ink">{fmt(p.total)}</Td>
                    <Td className="text-right tabular-nums">{fmt(p.health)}</Td>
                    <Td className="text-right tabular-nums">{fmt(p.agriculture)}</Td>
                    <Td className="text-right tabular-nums">{fmt(p.education)}</Td>
                    <Td className="text-right tabular-nums">{fmt(p.escalated)}</Td>
                    <Td className="w-[160px]">
                      <span className="block h-[7px] w-full overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(3, Math.round((p.total / max) * 100))}%` }} />
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </TableShell>
          </Panel>

          <Panel id="activite" title="Activité récente" hint="Douze dernières interactions, tous canaux confondus." action={<Link href="/cas" className="link">File des cas</Link>}>
            <ul className="divide-y divide-line">
              {data.recent.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Aucune interaction enregistrée.</li>}
              {data.recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/historique/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <ModuleBadge module={r.module} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{(r.understanding ?? r.summary ?? "Interaction enregistrée").replace(/^\[[^\]]+\]\s*/, "")}</span>
                    {r.escalated && <span className="tag tag-danger shrink-0">Escaladé</span>}
                    <span className="hidden shrink-0 text-[12px] text-muted sm:inline">{r.province ?? "—"}</span>
                    <span className="shrink-0 text-[12px] text-muted">{since(r.createdAt, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel id="alertes" title="Alertes du système" hint="Détections déterministes : cas critiques, hausses de motifs, foyers agricoles.">
            <ul className="divide-y divide-line">
              {alerts.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Aucune alerte active.</li>}
              {alerts.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-start gap-2">
                    <span className={`icon-tile mt-0.5 h-7 w-7 ${a.severity === "critical" ? "bg-danger-soft text-danger" : a.severity === "high" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand"}`}>
                      <IconAlert size={14} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium leading-snug text-ink">{a.title}</div>
                      <div className="mt-0.5 text-[12px] leading-snug text-muted">{a.detail}</div>
                      <div className="mt-1 text-[11.5px] text-muted-2">{since(a.at, now)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Charge des équipes" hint="Cas actifs par statut.">
            <CaseLoad />
          </Panel>

          <Panel title="Accès rapides">
            <ul className="divide-y divide-line">
              {[
                { href: "/cas?mine=1", label: "Mes cas assignés" },
                { href: "/cas?severity=critical", label: "Cas critiques" },
                { href: "/rapports", label: "Exports et rapports" },
                { href: "/langues", label: "Qualité des langues" },
                { href: "/notifications/envoyer", label: "Diffuser un message" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block px-5 py-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

async function CaseLoad() {
  const db = await getDb();
  const rows = await db
    .select({ status: schema.cases.status, n: count() })
    .from(schema.cases)
    .where(inArray(schema.cases.status, [...ACTIVE]))
    .groupBy(schema.cases.status)
    .orderBy(desc(count()));
  if (rows.length === 0) return <p className="px-5 py-6 text-[13px] text-muted">Aucun cas actif.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.status} className="flex items-center justify-between gap-3 px-5 py-2.5">
          <StatusBadge status={r.status} />
          <Link href={`/cas?status=${r.status}`} className="text-[14px] font-semibold tabular-nums text-ink hover:text-brand">
            {fmt(r.n)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
