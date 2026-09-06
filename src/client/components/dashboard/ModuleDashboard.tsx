/**
 * Module command view (health / agriculture / education) — server component.
 * Reads the reporting agent directly; the health province table applies the
 * k-anonymity rule (cells under 10 are never published).
 */
import Link from "next/link";
import { moduleDashboard } from "@/lib/ai/agents/reporting";
import type { ModuleType } from "@/lib/db/schema";
import { PageHeader } from "../ui";
import {
  BarList,
  MODULE_FR,
  Panel,
  SeverityBadge,
  StatTile,
  StatusBadge,
  TableShell,
  Td,
  Th,
  dueIn,
  fmt,
  kAnon,
  nowMs,
  since,
} from "./Common";
import { IconAlert, IconBriefcase, IconGraduation, IconHeart, IconLeaf, IconUsers } from "../icons";

const REFERRAL_FR: Record<string, string> = {
  none: "Aucune orientation",
  advised: "Conseil donné",
  referred: "Orienté vers un centre",
  emergency: "Urgence",
  self_care: "Autosoins",
  follow_up: "Suivi programmé",
};

const AGE_FR: Record<string, string> = {
  child: "Enfant",
  adolescent: "Adolescent",
  adult: "Adulte",
  primaire: "Primaire",
  secondaire: "Secondaire",
  adulte: "Adulte",
};

const META: Record<string, { title: string; subtitle: string; tone: "health" | "agri" | "edu"; icon: React.ReactNode }> = {
  health: {
    title: "Tableau de bord Santé",
    subtitle: "Motifs de triage, orientations, urgences et santé maternelle sur les 7 derniers jours.",
    tone: "health",
    icon: <IconHeart size={16} />,
  },
  agriculture: {
    title: "Tableau de bord Agriculture",
    subtitle: "Cultures concernées, problèmes signalés et urgences sur les 7 derniers jours.",
    tone: "agri",
    icon: <IconLeaf size={16} />,
  },
  education: {
    title: "Tableau de bord Éducation",
    subtitle: "Matières demandées, notions à renforcer et profils d'apprenants sur les 7 derniers jours.",
    tone: "edu",
    icon: <IconGraduation size={16} />,
  },
};

export async function ModuleDashboard({ module }: { module: Exclude<ModuleType, "general"> }) {
  const d = await moduleDashboard(module);
  const meta = META[module];
  const now = nowMs();
  const anonymise = module === "health";

  const provinceRows = d.byProvince.map((p) => ({
    label: p.province ?? "Non renseignée",
    value: p.n,
    display: anonymise ? kAnon(p.n) : fmt(p.n),
  }));

  const topRows =
    "topics" in d
      ? d.topics.map((t) => ({ label: String(t.label ?? t.key ?? "Autre"), value: t.count }))
      : "issues" in d
        ? d.issues.map((i) => ({ label: String(i.label ?? i.key ?? "Autre"), value: i.count }))
        : d.subjects.map((s) => ({ label: String(s.label ?? s.key ?? "Autre"), value: s.count }));

  const secondRows =
    "referrals" in d
      ? d.referrals.map((r) => ({ label: REFERRAL_FR[r.referral ?? ""] ?? r.referral ?? "Non renseigné", value: r.n }))
      : "crops" in d
        ? d.crops.map((c) => ({ label: c.crop ?? "Culture non précisée", value: c.n }))
        : d.gaps.map((g) => ({ label: g.topic ?? "Notion non précisée", value: g.n }));

  const thirdRows = "ages" in d ? d.ages.map((a) => ({ label: AGE_FR[a.age ?? ""] ?? a.age ?? "Non renseigné", value: a.n })) : [];

  const tiles =
    "emergencies" in d
      ? [
          { label: "Signes de danger (7 j)", value: fmt(d.emergencies), hint: "Chaque signe déclenche une alerte humaine.", tone: "danger" as const },
          { label: "Suivis de grossesse", value: fmt(d.maternal), hint: "Enregistrements de triage marqués « enceinte ».", tone: "health" as const },
        ]
      : "urgent" in d
        ? [{ label: "Signalements urgents (7 j)", value: fmt(d.urgent), hint: "Foyers à confirmer par une visite de terrain.", tone: "danger" as const }]
        : [{ label: "Apprenants en difficulté", value: fmt(d.gaps.reduce((s, g) => s + g.n, 0)), hint: "Sessions signalant un besoin d'appui.", tone: "warn" as const }];

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        actions={
          <>
            <Link href={`/cas?module=${module}`} className="btn btn-ghost">
              File des cas
            </Link>
            <Link href="/tableau-de-bord" className="btn btn-primary">
              Vue nationale
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cas actifs" value={fmt(d.openCases.length)} hint={`Module ${MODULE_FR[module].toLowerCase()}`} icon={<IconBriefcase size={16} />} tone={meta.tone} href={`/cas?module=${module}`} />
        <StatTile label="Suivis en retard" value={fmt(d.overdue)} hint="Cas dont la date de suivi est dépassée." icon={<IconAlert size={16} />} tone={d.overdue > 0 ? "danger" : "muted"} />
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} hint={t.hint} tone={t.tone} icon={meta.icon} />
        ))}
        <StatTile label="Provinces actives" value={fmt(d.byProvince.filter((p) => p.province).length)} hint="Provinces ayant produit au moins une interaction sur 7 jours." icon={<IconUsers size={16} />} tone="brand" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={module === "health" ? "Motifs de triage" : module === "agriculture" ? "Problèmes signalés" : "Matières demandées"} hint="7 derniers jours.">
          <BarList rows={topRows} tone={meta.tone === "health" ? "health" : meta.tone === "agri" ? "agri" : "edu"} />
        </Panel>
        <Panel title={module === "health" ? "Orientations" : module === "agriculture" ? "Cultures concernées" : "Notions à renforcer"} hint="7 derniers jours.">
          <BarList rows={secondRows} tone="brand" />
        </Panel>
      </div>

      {thirdRows.length > 0 && (
        <Panel title="Profils d'apprenants" hint="Répartition par tranche d'âge sur 7 jours.">
          <BarList rows={thirdRows} tone="edu" />
        </Panel>
      )}

      <Panel
        title="Activité par province"
        hint={anonymise ? "7 derniers jours. Règle d'anonymat : tout effectif inférieur à 10 est masqué (« < 10 »)." : "7 derniers jours."}
      >
        <BarList rows={provinceRows} tone={meta.tone === "health" ? "health" : meta.tone === "agri" ? "agri" : "edu"} />
      </Panel>

      <Panel title="Cas ouverts" hint="Vingt cas actifs les plus récents du module." action={<Link href={`/cas?module=${module}`} className="link">Ouvrir la file</Link>}>
        <TableShell
          head={
            <>
              <Th>Cas</Th>
              <Th>Gravité</Th>
              <Th>Statut</Th>
              <Th>Province</Th>
              <Th>Échéance</Th>
              <Th>Ouvert</Th>
            </>
          }
          empty={d.openCases.length === 0}
        >
          {d.openCases.map((c) => {
            const due = dueIn(c.slaDueAt ?? c.followUpDate, now);
            return (
              <tr key={c.id} className="hover:bg-surface-2">
                <Td className="max-w-[320px]">
                  <Link href={`/cas/${c.id}`} className="font-medium text-ink hover:text-brand">
                    <span className="line-clamp-2">{c.title}</span>
                  </Link>
                </Td>
                <Td>
                  <SeverityBadge severity={c.severity} />
                </Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td>{c.province ?? "—"}</Td>
                <Td className={due.late ? "font-semibold text-danger" : ""}>{due.label}</Td>
                <Td>{since(c.createdAt, now)}</Td>
              </tr>
            );
          })}
        </TableShell>
      </Panel>
    </div>
  );
}
