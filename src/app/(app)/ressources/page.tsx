import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { getDb, schema } from "@server/db/client";
import { ensureKnowledgeLoaded } from "@server/ai/knowledge";
import { HEALTH_PROTOCOLS } from "@server/ai/protocols/definitions";
import { PageHeader } from "@client/components/ui";
import { LANGUAGE_FR, MODULE_FR, ModuleBadge, Panel, TableShell, Td, Th, dateFr, fmt } from "@client/components/dashboard/Common";
import { IconBook, IconLeaf, IconShield } from "@client/components/icons";

export const metadata = { title: "Ressources" };
export const dynamic = "force-dynamic";

const GRADE_HINT: Record<string, string> = {
  A: "Preuve forte (recommandation nationale ou internationale)",
  B: "Preuve modérée",
  C: "Consensus d'experts",
  D: "Information générale",
};

const STATUS_FR: Record<string, string> = {
  draft: "Brouillon",
  review: "En relecture",
  approved: "Approuvé",
  canary: "Test",
  active: "Actif",
  retired: "Retiré",
};

function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default async function ResourcesPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/ressources");

  const db = await getDb();
  // The reference library ships as files under content/kb and is indexed on first use.
  await ensureKnowledgeLoaded().catch(() => undefined);
  const [docs, protocolRows, calendars, prices, stories] = await Promise.all([
    db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.status, "approved")).orderBy(schema.kbDocuments.module, schema.kbDocuments.title).limit(60),
    db.select().from(schema.protocolVersions).orderBy(desc(schema.protocolVersions.createdAt)).limit(30),
    db.select().from(schema.plantingCalendars).orderBy(schema.plantingCalendars.province, schema.plantingCalendars.crop).limit(40),
    db.select().from(schema.marketPrices).orderBy(desc(schema.marketPrices.observedAt)).limit(25),
    db.select().from(schema.stories).orderBy(desc(schema.stories.createdAt)).limit(20),
  ]);

  const protocols = protocolRows.length
    ? protocolRows.map((p) => ({ id: p.id, title: p.title, module: p.module as string, version: p.version, status: p.status as string, approvedBy: p.approvedBy as string | null, createdAt: p.createdAt as Date | null }))
    : HEALTH_PROTOCOLS.map((p) => ({ id: p.id, title: p.title, module: p.module as string, version: p.version, status: "active", approvedBy: null, createdAt: null }));
  const fromCode = protocolRows.length === 0;

  const byModule = ["health", "agriculture", "education", "general"].map((m) => ({ module: m, docs: docs.filter((d) => d.module === m) })).filter((g) => g.docs.length > 0);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader
        title="Centre de ressources"
        subtitle="Documents de référence, protocoles approuvés, calendriers culturaux, prix des marchés et récits de lecture — les sources sur lesquelles la plateforme s'appuie."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Documents de référence", value: docs.length, icon: <IconBook size={16} />, tone: "bg-brand-soft text-brand" },
          { label: "Protocoles enregistrés", value: protocols.length, icon: <IconShield size={16} />, tone: "bg-health-soft text-health" },
          { label: "Calendriers culturaux", value: calendars.length, icon: <IconLeaf size={16} />, tone: "bg-agri-soft text-agri" },
          { label: "Récits de lecture", value: stories.length, icon: <IconBook size={16} />, tone: "bg-edu-soft text-edu" },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3 p-4">
            <span className={`icon-tile h-9 w-9 ${s.tone}`}>{s.icon}</span>
            <div>
              <div className="text-[20px] font-bold leading-none tabular-nums text-ink">{fmt(s.value)}</div>
              <div className="mt-1 text-[12px] text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {byModule.length === 0 ? (
        <Panel title="Documents de référence">
          <p className="px-5 py-8 text-center text-[13px] text-muted">Aucun document approuvé n&apos;est encore chargé dans la base de connaissances.</p>
        </Panel>
      ) : (
        byModule.map((g) => (
          <Panel key={g.module} title={`Base de connaissances — ${MODULE_FR[g.module]}`} hint="Documents approuvés, cités par le système lorsqu'il répond.">
            <div className="divide-y divide-line">
              {g.docs.map((d) => (
                <details key={d.id} className="px-5 py-4">
                  <summary className="cursor-pointer marker:content-['']">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{d.title}</span>
                      <ModuleBadge module={d.module} />
                      <span className="tag tag-muted">v{d.version}</span>
                      <span className="tag tag-case" title={GRADE_HINT[d.evidenceGrade] ?? ""}>
                        Niveau de preuve {d.evidenceGrade}
                      </span>
                    </span>
                    <span className="mt-1 block text-[12px] text-muted">
                      {d.authority} · {d.geography} · {LANGUAGE_FR[d.language] ?? d.language} · référence {d.docId}
                      {d.reviewDate ? ` · à revoir le ${dateFr(d.reviewDate)}` : ""}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-2 border-l-2 border-line pl-4">
                    {paragraphs(d.body).map((p, i) => (
                      <p key={i} className="text-[13.5px] leading-relaxed text-ink-2">
                        {p}
                      </p>
                    ))}
                    {d.source && <p className="text-[12px] text-muted">Source : {d.source}</p>}
                  </div>
                </details>
              ))}
            </div>
          </Panel>
        ))
      )}

      <Panel title="Protocoles" hint="Versions de protocoles enregistrées : la conduite à tenir est du code, jamais une décision du modèle.">
        <TableShell
          head={
            <>
              <Th>Protocole</Th>
              <Th>Module</Th>
              <Th>Version</Th>
              <Th>Statut</Th>
              <Th>Approuvé par</Th>
              <Th>Enregistré le</Th>
            </>
          }
          empty={protocols.length === 0}
        >
          {protocols.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2">
              <Td className="font-medium text-ink">{p.title}</Td>
              <Td>
                <ModuleBadge module={p.module} />
              </Td>
              <Td className="tabular-nums">{p.version}</Td>
              <Td>
                <span className={`tag ${p.status === "active" || p.status === "approved" ? "tag-health" : "tag-muted"}`}>{STATUS_FR[p.status] ?? p.status}</span>
              </Td>
              <Td>{p.approvedBy ?? "—"}</Td>
              <Td className="whitespace-nowrap">{p.createdAt ? dateFr(p.createdAt) : "—"}</Td>
            </tr>
          ))}
        </TableShell>
        {fromCode && <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Ces protocoles sont chargés depuis le code du programme : ils sont déterministes et versionnés avec l&apos;application. Aucune version n&apos;a encore été publiée en base.</p>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Calendriers culturaux" hint="Fenêtres de semis par province et par culture.">
          {calendars.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Aucun calendrier cultural chargé pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-line">
              {calendars.map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{c.crop}</span>
                    <span className="tag tag-agri">{c.province}</span>
                    <span className="ml-auto text-[11.5px] text-muted">v{c.version}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {c.sowWindows.map((w, i) => (
                      <span key={i} className="tag tag-muted">
                        {w.label} : {w.from} → {w.to}
                      </span>
                    ))}
                  </div>
                  {c.notes && <p className="mt-1 text-[12.5px] leading-snug text-muted">{c.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Prix des marchés" hint="Dernières observations enregistrées, en francs congolais.">
          {prices.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Aucun relevé de prix disponible pour l&apos;instant.</p>
          ) : (
            <TableShell
              head={
                <>
                  <Th>Marché</Th>
                  <Th>Produit</Th>
                  <Th className="text-right">Prix (CDF)</Th>
                  <Th>Unité</Th>
                  <Th>Relevé le</Th>
                </>
              }
            >
              {prices.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2">
                  <Td className="font-medium text-ink">{p.market}</Td>
                  <Td>{p.commodity}</Td>
                  <Td className="text-right font-semibold tabular-nums text-ink">{fmt(p.priceCdf)}</Td>
                  <Td>{p.unit}</Td>
                  <Td className="whitespace-nowrap">{dateFr(p.observedAt)}</Td>
                </tr>
              ))}
            </TableShell>
          )}
        </Panel>
      </div>

      <Panel title="Récits et lectures" hint="Textes courts utilisés pour l'apprentissage de la lecture, dans les cinq langues du programme.">
        {stories.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">Aucun récit chargé pour l&apos;instant.</p>
        ) : (
          <div className="divide-y divide-line">
            {stories.map((s) => (
              <details key={s.id} className="px-5 py-4">
                <summary className="cursor-pointer marker:content-['']">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{s.title}</span>
                    <span className="tag tag-edu">{LANGUAGE_FR[s.language] ?? s.language}</span>
                    <span className="tag tag-muted">{s.level}</span>
                  </span>
                </summary>
                <div className="mt-3 space-y-2 border-l-2 border-line pl-4">
                  {paragraphs(s.body).map((p, i) => (
                    <p key={i} className="text-[13.5px] leading-relaxed text-ink-2">
                      {p}
                    </p>
                  ))}
                  <p className="text-[12px] text-muted">Licence : {s.licence}</p>
                </div>
              </details>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
