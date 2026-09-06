import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { BroadcastForm } from "@client/components/notifications/BroadcastForm";
import { AccessNotice, Notice, Panel, ROLE_FR, dateTimeFr, fmt } from "@client/components/dashboard/Common";

export const metadata = { title: "Diffuser un message" };
export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/notifications/envoyer");
  if (!hasPermission(session.role, "notification:broadcast"))
    return <AccessNotice title="Diffusion de messages" hint="La diffusion de messages programme est réservée aux administrations et aux administrateurs de la plateforme." back="/notifications" />;

  const db = await getDb();
  const [audience, recent] = await Promise.all([
    db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role).orderBy(desc(count())),
    db.select().from(schema.notifications).where(eq(schema.notifications.type, "broadcast")).orderBy(desc(schema.notifications.createdAt)).limit(8),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader
        title="Diffuser un message"
        subtitle="Message programme envoyé à un rôle, éventuellement limité à une province."
        actions={
          <Link href="/notifications" className="btn btn-ghost">
            Retour aux notifications
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Panel title="Composer" hint="Le message part immédiatement et est enregistré au journal d'audit.">
          <BroadcastForm />
        </Panel>

        <div className="space-y-4">
          <Panel title="Audience potentielle" hint="Comptes enregistrés par rôle, toutes provinces confondues.">
            <ul className="divide-y divide-line">
              {audience.map((a) => (
                <li key={a.role} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span className="text-ink-2">{ROLE_FR[a.role] ?? a.role}</span>
                  <span className="font-semibold tabular-nums text-ink">{fmt(a.n)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div>
            <Notice tone="warn">Un message de diffusion ne doit contenir aucune donnée personnelle : il peut s&apos;afficher sur un écran verrouillé partagé.</Notice>
          </div>

          <Panel title="Dernières diffusions">
            <ul className="divide-y divide-line">
              {recent.length === 0 && <li className="px-5 py-6 text-[13px] text-muted">Aucune diffusion enregistrée.</li>}
              {recent.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="text-[13px] font-medium text-ink">{r.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted">{dateTimeFr(r.createdAt)}</div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
