import Link from "next/link";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { REPORT_CATALOGUE, REPORT_TYPES, SUPPRESSION_NOTE } from "@server/reports/types";
import { PageHeader } from "@client/components/ui";
import { ReportRequestForm } from "@client/components/reports/ReportRequestForm";
import { AccessNotice, Panel, TableShell, Td, Th, dateTimeFr, fmt } from "@client/components/dashboard/Common";
import { IconChart, IconDownload, IconFile, IconGraduation, IconHeart, IconLeaf, IconShield } from "@client/components/icons";

export const metadata = { title: "Rapports & Analyses" };
export const dynamic = "force-dynamic";

const CSV_EXPORTS = [
  { type: "interactions", label: "Interactions", hint: "Toutes les conversations : module, canal, langue, province, risque, confiance, latence.", icon: <IconChart size={18} />, tone: "bg-brand-soft text-brand" },
  { type: "cases", label: "Cas", hint: "Dossiers ouverts : gravité, statut, escalade, province, échéance, résultat.", icon: <IconFile size={18} />, tone: "bg-warn-soft text-warn" },
  { type: "health", label: "Triage santé", hint: "Motifs, tranche d'âge, grossesse, signes de danger, orientation.", icon: <IconHeart size={18} />, tone: "bg-health-soft text-health" },
  { type: "agriculture", label: "Signalements agricoles", hint: "Culture, problème, urgence, diagnostic et confiance.", icon: <IconLeaf size={18} />, tone: "bg-agri-soft text-agri" },
  { type: "education", label: "Sessions éducatives", hint: "Matière, notion, âge, niveau et signal de progression.", icon: <IconGraduation size={18} />, tone: "bg-edu-soft text-edu" },
  { type: "audit", label: "Journal d'audit", hint: "Actions, acteurs, entités et résumés — traçabilité complète.", icon: <IconShield size={18} />, tone: "bg-brand-soft text-brand" },
  { type: "usage", label: "Consommation IA", hint: "Appels aux modèles, jetons, secondes audio, coût et durée.", icon: <IconChart size={18} />, tone: "bg-edu-soft text-edu" },
];

const STATUS_FR: Record<string, string> = { queued: "En file", running: "En cours", ready: "Prêt", failed: "Échec" };

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/rapports");
  if (!hasPermission(session.role, "report:export"))
    return <AccessNotice title="Rapports & Analyses" hint="L'export de données est réservé aux administrations et aux ONG partenaires du programme." />;

  const db = await getDb();
  const jobs = await db.select().from(schema.reports).orderBy(desc(schema.reports.createdAt)).limit(12);

  const options = REPORT_TYPES.map((t) => ({
    type: t,
    name: REPORT_CATALOGUE[t].name,
    cadence: REPORT_CATALOGUE[t].cadence,
    windowDays: REPORT_CATALOGUE[t].windowDays,
    defaultFormat: REPORT_CATALOGUE[t].defaultFormat,
  }));

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Rapports & Analyses"
        subtitle="Exports immédiats au format CSV, rapports institutionnels sur demande et définitions publiées de chaque indicateur."
        actions={
          <Link href="/tableau-de-bord" className="btn btn-ghost">
            Tableau de bord
          </Link>
        }
      />

      <Panel title="Exports immédiats (CSV)" hint="Ouvrables dans Excel ou LibreOffice. Période par défaut : 30 jours.">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {CSV_EXPORTS.map((e) => (
            <div key={e.type} className="card flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2.5">
                <span className={`icon-tile h-9 w-9 ${e.tone}`}>{e.icon}</span>
                <span className="text-[14px] font-semibold text-ink">{e.label}</span>
              </div>
              <p className="text-[12.5px] leading-snug text-muted">{e.hint}</p>
              <div className="mt-auto flex flex-wrap gap-2">
                {[7, 30, 90].map((d) => (
                  <a key={d} href={`/api/v1/reports/${e.type}?days=${d}`} className="btn btn-ghost h-9 px-3 text-[12.5px]">
                    <IconDownload size={14} /> {d} j
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Panel title="Demander un rapport" hint="Rapports institutionnels du programme : PDF, Excel ou CSV, sur la période de votre choix.">
          <ReportRequestForm options={options} />
        </Panel>

        <Panel title="Rapports demandés" hint="Douze dernières demandes, tous utilisateurs confondus.">
          <TableShell
            head={
              <>
                <Th>Rapport</Th>
                <Th>Format</Th>
                <Th>Période</Th>
                <Th>Statut</Th>
                <Th>Demandé le</Th>
                <Th />
              </>
            }
            empty={jobs.length === 0}
          >
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-surface-2">
                <Td className="font-medium text-ink">{REPORT_CATALOGUE[j.type as keyof typeof REPORT_CATALOGUE]?.name ?? j.type}</Td>
                <Td className="uppercase">{j.format}</Td>
                <Td className="whitespace-nowrap">{j.period ? `${j.period.from.slice(0, 10)} → ${j.period.to.slice(0, 10)}` : "—"}</Td>
                <Td>
                  <span className={`tag ${j.status === "ready" ? "tag-health" : j.status === "failed" ? "tag-danger" : "tag-warn"}`}>{STATUS_FR[j.status] ?? j.status}</span>
                </Td>
                <Td className="whitespace-nowrap">{dateTimeFr(j.createdAt)}</Td>
                <Td className="text-right">
                  {j.status === "ready" ? (
                    <a href={`/api/v1/report-jobs/${j.id}/download`} className="link">
                      Télécharger
                    </a>
                  ) : j.error ? (
                    <span className="text-[12px] text-danger">{j.error.slice(0, 60)}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </TableShell>
          {jobs.length > 0 && <p className="border-t border-line px-5 py-3 text-[12px] text-muted">{fmt(jobs.length)} demande(s) affichée(s). Les fichiers expirent sept jours après leur génération.</p>}
        </Panel>
      </div>

      <Panel title="Définitions des rapports" hint="Ce que chaque rapport contient, pour qui il est produit et sur quels dénominateurs il repose.">
        <div className="divide-y divide-line">
          {REPORT_TYPES.map((t) => {
            const meta = REPORT_CATALOGUE[t];
            return (
              <details key={t} className="group px-5 py-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[14px] font-semibold text-ink marker:content-['']">
                  {meta.name}
                  <span className="tag tag-muted">{meta.cadence === "daily" ? "Quotidien" : meta.cadence === "weekly" ? "Hebdomadaire" : meta.cadence === "monthly" ? "Mensuel" : "Trimestriel"}</span>
                  <span className="tag tag-case">{meta.windowDays} j</span>
                  <span className="ml-auto text-[12px] font-medium text-brand group-open:hidden">Voir</span>
                </summary>
                <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink-2">
                  <p>{meta.purpose}</p>
                  <p className="text-[12.5px] text-muted">Destinataires : {meta.audience}.</p>
                  <div>
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Définitions</div>
                    <ul className="mt-1 space-y-1">
                      {meta.definitions.map((d) => (
                        <li key={d.term}>
                          <span className="font-semibold text-ink">{d.term}</span> — {d.meaning}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Dénominateurs</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {meta.denominators.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-muted">{SUPPRESSION_NOTE}</p>
      </Panel>
    </div>
  );
}
