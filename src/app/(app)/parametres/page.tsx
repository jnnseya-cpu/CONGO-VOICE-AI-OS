import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { SettingsForm } from "@client/components/settings/SettingsForm";
import { DataRights } from "@client/components/settings/DataRights";
import { LANGUAGE_FR, Panel, ROLE_FR, dateTimeFr, fmt } from "@client/components/dashboard/Common";
import { IconShield } from "@client/components/icons";

export const metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

const DATA_REQUEST_STATUS_FR: Record<string, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  completed: "Traitée",
  rejected: "Refusée",
  on_hold: "En attente",
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/parametres");

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));
  const interactions = (await db.select({ n: count() }).from(schema.interactions).where(eq(schema.interactions.userId, session.userId)))[0].n;
  const requests = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.userId, session.userId)).orderBy(desc(schema.dataRequests.createdAt)).limit(5);

  const isAdmin = hasPermission(session.role, "dashboard:admin") || hasPermission(session.role, "admin:config") || hasPermission(session.role, "user:manage");

  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Paramètres" subtitle="Votre profil, votre langue, vos consentements et vos droits sur vos données." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="space-y-4">
          <Panel title="Profil et préférences" hint="Ces informations orientent les réponses et le suivi humain.">
            <SettingsForm
              initial={{
                name: user?.name ?? "",
                language: user?.languagePreference ?? session.language,
                province: user?.province ?? "",
                territory: user?.territory ?? "",
                consent: (user?.consentStatus ?? "granted") === "granted",
              }}
            />
          </Panel>

          <Panel title="Vos droits sur vos données">
            <DataRights />
            {requests.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px]">
                    <span className="tag tag-case">{r.type === "access" ? "Accès" : "Effacement"}</span>
                    <span className={`tag ${r.status === "completed" ? "tag-health" : r.status === "rejected" ? "tag-danger" : "tag-warn"}`}>{DATA_REQUEST_STATUS_FR[r.status] ?? r.status}</span>
                    <span className="text-muted">Demandée le {dateTimeFr(r.createdAt)}</span>
                    <span className="ml-auto text-muted">Échéance {dateTimeFr(r.dueAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Votre compte">
            <ul className="divide-y divide-line text-[13px]">
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Rôle</span>
                <span className="font-medium text-ink">{ROLE_FR[session.role] ?? session.role}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Téléphone</span>
                <span className="font-medium text-ink">{user?.phone ?? "—"}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Langue</span>
                <span className="font-medium text-ink">{LANGUAGE_FR[user?.languagePreference ?? session.language]}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Conversations</span>
                <span className="font-medium tabular-nums text-ink">{fmt(interactions)}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Compte créé le</span>
                <span className="font-medium text-ink">{dateTimeFr(user?.createdAt)}</span>
              </li>
            </ul>
          </Panel>

          <Panel title="Code PIN">
            <div className="space-y-2 p-5 text-[13px] leading-relaxed text-ink-2">
              <p>Votre code PIN à quatre chiffres protège votre compte. Il est stocké sous forme chiffrée : personne, pas même un administrateur, ne peut le lire.</p>
              <p className="text-[12.5px] text-muted">Pour le remplacer, contactez l&apos;agent qui vous a enregistré ou le centre d&apos;appel national. Ne communiquez jamais votre PIN par SMS.</p>
            </div>
          </Panel>

          {isAdmin && (
            <Panel title="Administration">
              <div className="space-y-2 p-5">
                <p className="text-[13px] leading-relaxed text-ink-2">Vous disposez de droits d&apos;administration sur cette plateforme.</p>
                <Link href="/admin" className="btn btn-primary w-full">
                  <IconShield size={16} /> Ouvrir la console d&apos;administration
                </Link>
              </div>
            </Panel>
          )}

          <Panel title="Confidentialité">
            <p className="p-5 text-[13px] leading-relaxed text-ink-2">
              Vos échanges sont conservés de façon sécurisée et ne sont partagés qu&apos;avec les agents autorisés de votre zone. Le service oriente et informe : il ne remplace ni un médecin, ni un agronome, ni un enseignant.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
