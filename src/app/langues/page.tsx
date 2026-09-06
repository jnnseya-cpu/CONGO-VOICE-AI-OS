import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { languageProficiency } from "@server/ai/agents/learning";
import { PageHeader } from "@client/components/ui";
import { ReviewQueue } from "@client/components/languages/ReviewQueue";
import { LexiconForm } from "@client/components/languages/LexiconForm";
import { AccessNotice, LANGUAGE_FR, MODULE_FR, Panel, TableShell, Td, Th, dateFr, fmt } from "@client/components/dashboard/Common";
import { IconDownload, IconLanguage } from "@client/components/icons";

export const metadata = { title: "Langues & Apprentissage" };
export const dynamic = "force-dynamic";

const LEVEL_TONE: Record<string, string> = {
  débutant: "tag-warn",
  intermédiaire: "tag-case",
  avancé: "tag-health",
  natif: "tag-health",
};

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-muted">{label}</span>
        <span className="text-[12.5px] font-semibold tabular-nums text-ink">{value} %</span>
      </div>
      <div className="mt-1 h-[6px] w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

export default async function LanguagesPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/langues");
  if (!hasPermission(session.role, "language:review"))
    return <AccessNotice title="Langues & Apprentissage" hint="La relecture linguistique est confiée aux agents de terrain locuteurs natifs, aux partenaires et aux administrations." />;

  const db = await getDb();
  const [proficiency, lexicon] = await Promise.all([
    languageProficiency(),
    db.select().from(schema.languageLexicon).orderBy(desc(schema.languageLexicon.usageCount), desc(schema.languageLexicon.createdAt)).limit(50),
  ]);

  const canExport = hasPermission(session.role, "language:export");

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Langues & Apprentissage"
        subtitle="La plateforme apprend le lingala, le kikongo, le swahili, le tshiluba et le français local à partir de chaque conversation et de vos corrections."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {proficiency.map((p) => (
          <div key={p.language} className="card space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="icon-tile h-8 w-8 bg-brand-soft text-brand">
                  <IconLanguage size={16} />
                </span>
                <span className="text-[14px] font-semibold text-ink">{LANGUAGE_FR[p.language]}</span>
              </span>
              <span className={`tag ${LEVEL_TONE[p.level] ?? "tag-muted"}`}>{p.level}</span>
            </div>
            <div className="space-y-2">
              <Meter label="Écoute" value={p.listening} color="#1d4ed8" />
              <Meter label="Compréhension" value={p.understanding} color="#15803d" />
              <Meter label="Parole" value={p.speaking} color="#7c3aed" />
            </div>
            <ul className="space-y-1 border-t border-line pt-2 text-[11.5px] text-muted">
              <li className="flex justify-between">
                <span>Échantillons (30 j)</span>
                <span className="font-semibold tabular-nums text-ink-2">{fmt(p.samples)}</span>
              </li>
              <li className="flex justify-between">
                <span>Vérifiés</span>
                <span className="font-semibold tabular-nums text-ink-2">{fmt(p.verified)}</span>
              </li>
              <li className="flex justify-between">
                <span>Lexique</span>
                <span className="font-semibold tabular-nums text-ink-2">{fmt(p.lexicon)}</span>
              </li>
            </ul>
            {canExport && (
              <a href={`/api/v1/language/export?language=${p.language}`} className="btn btn-ghost h-9 w-full text-[12.5px]">
                <IconDownload size={14} /> Exporter le corpus
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <Panel title="File de relecture" hint="Échantillons signalés par les citoyens et transcriptions à faible confiance, les plus urgents d'abord.">
          <ReviewQueue />
        </Panel>

        <div className="space-y-4">
          <Panel title="Ajouter un terme au lexique" hint="Les termes vérifiés sont injectés dans la compréhension dès la conversation suivante.">
            <LexiconForm defaultRegion={session.province ?? null} />
          </Panel>

          {canExport && (
            <Panel title="Jeux de données" hint="Paires audio / transcription vérifiées, au format JSONL, pour l'entraînement des modèles de parole.">
              <ul className="divide-y divide-line">
                <li>
                  <a href="/api/v1/language/export" className="flex items-center gap-2 px-5 py-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">
                    <IconDownload size={15} /> Toutes les langues
                  </a>
                </li>
                {proficiency.map((p) => (
                  <li key={p.language}>
                    <a href={`/api/v1/language/export?language=${p.language}`} className="flex items-center gap-2 px-5 py-3 text-[13.5px] font-medium text-ink hover:bg-surface-2">
                      <IconDownload size={15} /> {LANGUAGE_FR[p.language]}
                      <span className="ml-auto text-[12px] text-muted">{fmt(p.verified + p.corrected)} échantillons</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Lexique local" hint="Termes vérifiés utilisés pour comprendre et répondre dans la langue du citoyen.">
        <TableShell
          head={
            <>
              <Th>Terme</Th>
              <Th>Langue</Th>
              <Th>Sens en français</Th>
              <Th>Domaine</Th>
              <Th>Région</Th>
              <Th className="text-right">Utilisations</Th>
              <Th>Ajouté le</Th>
            </>
          }
          empty={lexicon.length === 0}
        >
          {lexicon.map((l) => (
            <tr key={l.id} className="hover:bg-surface-2">
              <Td className="font-medium text-ink">
                {l.term}
                {l.pronunciation && <span className="ml-2 text-[12px] text-muted">[{l.pronunciation}]</span>}
              </Td>
              <Td>
                <span className="tag tag-case">{LANGUAGE_FR[l.language] ?? l.language}</span>
              </Td>
              <Td>{l.meaningFr}</Td>
              <Td>{MODULE_FR[l.domain] ?? l.domain}</Td>
              <Td>{l.region ?? "—"}</Td>
              <Td className="text-right tabular-nums">{fmt(l.usageCount)}</Td>
              <Td className="whitespace-nowrap">{dateFr(l.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </Panel>
    </div>
  );
}
