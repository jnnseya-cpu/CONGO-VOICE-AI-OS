import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { count, desc, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import type { Role } from "@server/db/schema";
import { PageHeader } from "@client/components/ui";
import { CreateUserForm, RoleFilter } from "@client/components/admin/UserAdmin";
import { AccessNotice, LANGUAGE_FR, Panel, ROLE_FR, TableShell, Td, Th, dateFr, fmt, nowMs, since } from "@client/components/dashboard/Common";

export const metadata = { title: "Utilisateurs" };
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["citizen", "chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/admin/utilisateurs");
  if (!hasPermission(session.role, "user:manage"))
    return <AccessNotice title="Gestion des utilisateurs" hint="La création et la gestion des comptes sont réservées aux administrateurs de la plateforme." back="/admin" />;

  const { role } = await searchParams;
  const filter = ROLES.includes(role as Role) ? (role as Role) : null;

  const db = await getDb();
  const [rows, byRole, total] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(filter ? eq(schema.users.role, filter) : undefined)
      .orderBy(desc(schema.users.createdAt))
      .limit(100),
    db.select({ role: schema.users.role, n: count() }).from(schema.users).groupBy(schema.users.role),
    db.select({ n: count() }).from(schema.users),
  ]);

  const now = nowMs();

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Utilisateurs"
        subtitle={`${fmt(total[0].n)} comptes enregistrés — agents de terrain, partenaires et citoyens.`}
        actions={
          <Link href="/admin" className="btn btn-ghost">
            Retour à l&apos;administration
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {ROLES.map((r) => (
          <Link key={r} href={filter === r ? "/admin/utilisateurs" : `/admin/utilisateurs?role=${r}`} className={`card card-hover p-3 ${filter === r ? "border-brand" : ""}`}>
            <div className="text-[20px] font-bold leading-none tabular-nums text-ink">{fmt(byRole.find((b) => b.role === r)?.n ?? 0)}</div>
            <div className="mt-1 text-[11.5px] leading-snug text-muted">{ROLE_FR[r]}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel title="Comptes" hint="Cent comptes les plus récents.">
          <Suspense fallback={<div className="h-[62px] border-b border-line" />}>
            <RoleFilter />
          </Suspense>
          <TableShell
            head={
              <>
                <Th>Nom</Th>
                <Th>Téléphone</Th>
                <Th>Rôle</Th>
                <Th>Langue</Th>
                <Th>Province</Th>
                <Th>Créé le</Th>
                <Th>Dernière activité</Th>
              </>
            }
            empty={rows.length === 0}
          >
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-surface-2">
                <Td className="font-medium text-ink">{u.name ?? (u.isAnonymous ? "Compte anonyme" : "—")}</Td>
                <Td className="font-mono text-[12px]">{u.phone ?? "—"}</Td>
                <Td>
                  <span className="tag tag-case">{ROLE_FR[u.role] ?? u.role}</span>
                </Td>
                <Td>{LANGUAGE_FR[u.languagePreference] ?? u.languagePreference}</Td>
                <Td>{u.province ?? "—"}</Td>
                <Td className="whitespace-nowrap">{dateFr(u.createdAt)}</Td>
                <Td className="whitespace-nowrap">{u.lastActivityAt ? since(u.lastActivityAt, now) : "—"}</Td>
              </tr>
            ))}
          </TableShell>
        </Panel>

        <Panel title="Créer un compte" hint="Le compte est immédiatement actif et journalisé.">
          <CreateUserForm defaultProvince={session.province ?? null} />
        </Panel>
      </div>
    </div>
  );
}
