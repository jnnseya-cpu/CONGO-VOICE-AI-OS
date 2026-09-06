import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission, moduleScopeFor } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { NewCaseForm } from "@client/components/cases/NewCaseForm";
import { Notice, Panel } from "@client/components/dashboard/Common";
import { IconPhone } from "@client/components/icons";

export const metadata = { title: "Nouveau cas" };
export const dynamic = "force-dynamic";

const TYPE_FR: Record<string, string> = {
  cs: "Centre de santé",
  hgr: "Hôpital général de référence",
  veterinary: "Poste vétérinaire",
  extension_office: "Inspection agricole",
  school: "École",
  call_centre: "Centre d'appel",
};

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ humain?: string }> }) {
  const { humain } = await searchParams;
  const session = await getSession();
  const citizenRequest = humain === "1";

  if (!session) redirect(`/connexion?next=${encodeURIComponent(citizenRequest ? "/cas/nouveau?humain=1" : "/cas/nouveau")}`);

  const canWrite = hasPermission(session.role, "case:write");
  const scope = moduleScopeFor(session.role);
  const modules = scope ?? ["health", "agriculture", "education", "general"];

  if (citizenRequest && !canWrite) {
    const db = await getDb();
    const services = await db
      .select()
      .from(schema.serviceDirectory)
      .where(and(eq(schema.serviceDirectory.active, true), session.province ? eq(schema.serviceDirectory.province, session.province) : undefined))
      .limit(8);
    return (
      <div className="mx-auto max-w-[720px] space-y-4">
        <PageHeader title="Parler à une personne" subtitle="Un humain reste toujours joignable. Voici comment être mis en relation." />
        <Panel title="Comment être rappelé">
          <div className="space-y-3 p-5 text-[13.5px] leading-relaxed text-ink-2">
            <p>
              Depuis n&apos;importe quelle conversation, dites simplement « je veux parler à une personne ». Le système ouvre un cas et alerte l&apos;agent compétent de votre zone (agent de santé, agent agricole ou enseignant selon le sujet).
            </p>
            <p>
              Si votre situation est urgente — difficulté à respirer, convulsions, saignement, impossibilité de boire, blessure grave — rendez-vous immédiatement au centre de santé le plus proche sans attendre le rappel.
            </p>
            <Notice tone="brand">Le service est gratuit. Vos échanges ne sont partagés qu&apos;avec les agents autorisés de votre zone.</Notice>
            <Link href="/sante#parler" className="btn btn-primary">
              Ouvrir une conversation
            </Link>
          </div>
        </Panel>
        <Panel title="Services de votre zone" hint={session.province ? `Province : ${session.province}` : "Renseignez votre province dans les paramètres pour voir les services proches."}>
          {services.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted">Aucun service enregistré pour votre zone. Le centre de santé le plus proche reste votre premier recours.</p>
          ) : (
            <ul className="divide-y divide-line">
              {services.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="icon-tile mt-0.5 h-8 w-8 bg-brand-soft text-brand">
                    <IconPhone size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink">{s.name}</div>
                    <div className="text-[12px] text-muted">
                      {TYPE_FR[s.type] ?? s.type}
                      {s.territory ? ` · ${s.territory}` : ""}
                      {s.phone ? ` · ${s.phone}` : " · numéro non vérifié"}
                    </div>
                    {s.notes && <p className="mt-0.5 text-[12px] text-muted">{s.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-[720px] space-y-4">
        <PageHeader title="Nouveau cas" subtitle="La création de cas est réservée aux agents." />
        <Panel title="Vous souhaitez parler à une personne ?">
          <div className="space-y-3 p-5 text-[13.5px] leading-relaxed text-ink-2">
            <p>Votre profil ne permet pas d&apos;ouvrir un cas directement, mais vous pouvez demander à être mis en relation avec un agent.</p>
            <Link href="/cas/nouveau?humain=1" className="btn btn-primary">
              Parler à une personne
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <PageHeader
        title={citizenRequest ? "Demande de contact humain" : "Nouveau cas"}
        subtitle={citizenRequest ? "Cette demande ouvre un cas et alerte l'agent compétent de la zone." : "À utiliser après un appel, une visite de terrain ou un signalement reçu hors plateforme."}
        actions={
          <Link href="/cas" className="btn btn-ghost">
            Retour à la file
          </Link>
        }
      />
      <Panel title={citizenRequest ? "Demande" : "Informations du cas"} hint="Tout cas créé est horodaté, attribué à une file et journalisé.">
        <NewCaseForm modules={modules} defaultProvince={session.province ?? null} citizen={citizenRequest} />
      </Panel>
    </div>
  );
}
