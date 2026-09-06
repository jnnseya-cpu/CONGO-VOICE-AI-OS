import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { adminStats } from "@server/ai/agents/reporting";
import { PageHeader } from "@client/components/ui";
import { StatusPanel } from "@client/components/admin/StatusPanel";
import { ConfigEditor } from "@client/components/admin/ConfigEditor";
import { SeedButton } from "@client/components/admin/SeedButton";
import { AccessNotice, BarList, LANGUAGE_FR, Panel, ROLE_FR, SHARE_COLORS, ShareBar, StatTile, TableShell, Td, Th, dateTimeFr, fmt } from "@client/components/dashboard/Common";
import { IconAlert, IconChart, IconClock, IconMic, IconShield, IconUsers } from "@client/components/icons";

export const metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

const CAPABILITY_FR: Record<string, string> = {
  llm: "Compréhension et rédaction",
  json: "Réponses structurées",
  transcribe: "Transcription",
  synthesize: "Synthèse vocale",
  translate: "Traduction",
  vision: "Analyse d'image",
  embed: "Indexation",
};

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/admin");
  if (!hasPermission(session.role, "dashboard:admin"))
    return <AccessNotice title="Console d'administration" hint="Cette console est réservée aux administrateurs de la plateforme. Les administrations gouvernementales disposent du tableau de bord national et des rapports." />;

  const stats = await adminStats();
  const canConfig = hasPermission(session.role, "admin:config");
  const feedbackAvg = stats.feedback.avg ? Number(stats.feedback.avg).toFixed(1) : "—";

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Console d'administration"
        subtitle="État technique, consommation, qualité et configuration de la plateforme."
        actions={
          <>
            <Link href="/admin/utilisateurs" className="btn btn-ghost">
              Utilisateurs
            </Link>
            <Link href="/admin/audit" className="btn btn-primary">
              Journal d&apos;audit
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Coût IA (7 jours)" value={`${stats.totalCost.toFixed(2)} $`} hint={`${stats.costPerInteraction.toFixed(4)} $ par interaction · ${fmt(stats.interactionsWeek)} interactions`} icon={<IconChart size={16} />} tone="edu" />
        <StatTile label="Erreurs serveur (24 h)" value={fmt(stats.apiErrors)} hint={`${fmt(stats.apiCalls.n)} requêtes · ${fmt(stats.apiCalls.avgMs)} ms en moyenne`} icon={<IconAlert size={16} />} tone={stats.apiErrors > 0 ? "danger" : "muted"} />
        <StatTile label="Escalades (7 jours)" value={fmt(stats.escalations)} hint={`${fmt(stats.lowConfidence)} interactions à faible confiance`} icon={<IconClock size={16} />} tone="warn" />
        <StatTile label="Satisfaction" value={feedbackAvg === "—" ? "—" : `${feedbackAvg}/5`} hint={`${fmt(stats.feedback.n)} avis · ${fmt(stats.feedback.useful)} jugés utiles`} icon={<IconUsers size={16} />} tone="health" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-4">
          <Panel title="Consommation par capacité" hint="Appels aux modèles sur 7 jours, coût estimé et latence moyenne.">
            <TableShell
              head={
                <>
                  <Th>Capacité</Th>
                  <Th className="text-right">Appels</Th>
                  <Th className="text-right">Échecs</Th>
                  <Th className="text-right">Latence</Th>
                  <Th className="text-right">Coût</Th>
                </>
              }
              empty={stats.usage.length === 0}
            >
              {stats.usage.map((u) => (
                <tr key={u.capability} className="hover:bg-surface-2">
                  <Td className="font-medium text-ink">{CAPABILITY_FR[u.capability] ?? u.capability}</Td>
                  <Td className="text-right tabular-nums">{fmt(u.calls)}</Td>
                  <Td className={`text-right tabular-nums ${u.failures > 0 ? "font-semibold text-danger" : ""}`}>{fmt(u.failures)}</Td>
                  <Td className="text-right tabular-nums">{fmt(u.avgMs)} ms</Td>
                  <Td className="text-right tabular-nums">{Number(u.cost).toFixed(4)} $</Td>
                </tr>
              ))}
            </TableShell>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Qualité de compréhension" hint="7 derniers jours.">
              <ul className="divide-y divide-line text-[13px]">
                <li className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-ink-2">Transcriptions vides</span>
                  <span className={`font-semibold tabular-nums ${stats.failedTranscriptions > 0 ? "text-danger" : "text-ink"}`}>{fmt(stats.failedTranscriptions)}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-ink-2">Interactions à faible confiance</span>
                  <span className="font-semibold tabular-nums text-ink">{fmt(stats.lowConfidence)}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-ink-2">Escalades ouvertes</span>
                  <span className="font-semibold tabular-nums text-ink">{fmt(stats.escalations)}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="text-ink-2">Latence API moyenne (24 h)</span>
                  <span className="font-semibold tabular-nums text-ink">{fmt(stats.apiCalls.avgMs)} ms</span>
                </li>
              </ul>
            </Panel>

            <Panel title="Langues des interactions" hint="Depuis l'origine.">
              <ShareBar rows={stats.languages.map((l, i) => ({ label: LANGUAGE_FR[l.language ?? ""] ?? String(l.language), value: l.n, color: SHARE_COLORS[i % SHARE_COLORS.length] }))} />
            </Panel>
          </div>

          <Panel title="Dernières erreurs serveur" hint="Dix dernières réponses en erreur (code 500 et plus).">
            <TableShell
              head={
                <>
                  <Th>Horodatage</Th>
                  <Th>Méthode</Th>
                  <Th>Chemin</Th>
                  <Th className="text-right">Code</Th>
                  <Th>Message</Th>
                </>
              }
              empty={stats.recentErrors.length === 0}
            >
              {stats.recentErrors.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <Td className="whitespace-nowrap">{dateTimeFr(e.createdAt)}</Td>
                  <Td className="font-mono text-[12px]">{e.method}</Td>
                  <Td className="font-mono text-[12px]">{e.path}</Td>
                  <Td className="text-right font-semibold text-danger">{e.statusCode}</Td>
                  <Td className="max-w-[280px] truncate">{e.error ?? "—"}</Td>
                </tr>
              ))}
            </TableShell>
          </Panel>
        </div>

        <div className="space-y-4">
          <StatusPanel />

          <Panel title="Comptes par rôle" action={<Link href="/admin/utilisateurs" className="link">Gérer</Link>}>
            <BarList rows={stats.usersByRole.map((u) => ({ label: ROLE_FR[u.role] ?? u.role, value: u.n }))} tone="brand" />
          </Panel>

          {canConfig && <ConfigEditor />}

          {canConfig && (
            <Panel title="Données de démonstration">
              <SeedButton />
            </Panel>
          )}

          <Panel title="Repères">
            <ul className="divide-y divide-line text-[13px]">
              <li className="flex items-center gap-2 px-5 py-3">
                <IconShield size={15} className="shrink-0 text-brand" />
                <span className="text-ink-2">Toute action d&apos;administration est journalisée et horodatée.</span>
              </li>
              <li className="flex items-center gap-2 px-5 py-3">
                <IconMic size={15} className="shrink-0 text-brand" />
                <span className="text-ink-2">Aucun nom de fournisseur ni clé d&apos;accès n&apos;est exposé aux clients.</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
