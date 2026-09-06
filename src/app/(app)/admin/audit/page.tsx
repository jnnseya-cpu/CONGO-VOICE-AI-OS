import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { AuditFilters } from "@client/components/admin/AuditFilters";
import { AccessNotice, Panel, ROLE_FR, StatTile, TableShell, Td, Th, dateTimeFr, daysAgo, fmt } from "@client/components/dashboard/Common";
import { IconDownload, IconShield } from "@client/components/icons";

export const metadata = { title: "Journal d'audit" };
export const dynamic = "force-dynamic";

const AUDIT_EXPORT = `/api/v1/reports/${"audit"}?days=30`;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entityType?: string; entityId?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/admin/audit");
  if (!hasPermission(session.role, "audit:read"))
    return <AccessNotice title="Journal d'audit" hint="La consultation du journal d'audit est réservée aux administrations et aux administrateurs de la plateforme." back="/admin" />;

  const sp = await searchParams;
  const db = await getDb();
  const where = and(
    sp.action ? eq(schema.auditLogs.action, sp.action) : undefined,
    sp.entityType ? eq(schema.auditLogs.entityType, sp.entityType) : undefined,
    sp.entityId ? eq(schema.auditLogs.entityId, sp.entityId) : undefined,
  );

  const day = daysAgo(1);
  const [rows, total, todayCount, actionsRaw, typesRaw] = await Promise.all([
    db.select().from(schema.auditLogs).where(where).orderBy(desc(schema.auditLogs.createdAt)).limit(100),
    db.select({ n: count() }).from(schema.auditLogs).where(where),
    db.select({ n: count() }).from(schema.auditLogs).where(gte(schema.auditLogs.createdAt, day)),
    db.select({ action: schema.auditLogs.action }).from(schema.auditLogs).groupBy(schema.auditLogs.action).orderBy(schema.auditLogs.action),
    db.select({ t: schema.auditLogs.entityType }).from(schema.auditLogs).where(isNotNull(schema.auditLogs.entityType)).groupBy(schema.auditLogs.entityType).orderBy(schema.auditLogs.entityType),
  ]);

  const actions = actionsRaw.map((a) => a.action);
  const entityTypes = typesRaw.map((t) => t.t).filter((t): t is string => !!t);
  const chained = rows.filter((r) => r.hash).length;

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Journal d'audit"
        subtitle="Chaque action sensible est enregistrée avec son auteur, son horodatage et son empreinte de chaînage."
        actions={
          <>
            <a href={AUDIT_EXPORT} className="btn btn-ghost">
              <IconDownload size={16} /> Export CSV
            </a>
            <Link href="/admin" className="btn btn-primary">
              Administration
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Entrées affichées" value={fmt(total[0].n)} hint="Selon les filtres appliqués." icon={<IconShield size={16} />} tone="brand" />
        <StatTile label="Dernières 24 heures" value={fmt(todayCount[0].n)} hint="Actions enregistrées sur la journée." icon={<IconShield size={16} />} tone="health" />
        <StatTile label="Entrées chaînées" value={`${fmt(chained)} / ${fmt(rows.length)}`} hint="Empreinte de chaînage présente : toute modification serait détectable." icon={<IconShield size={16} />} tone="edu" />
      </div>

      <Panel>
        <Suspense fallback={<div className="h-[62px] border-b border-line" />}>
          <AuditFilters actions={actions} entityTypes={entityTypes} />
        </Suspense>
        <TableShell
          head={
            <>
              <Th>Horodatage</Th>
              <Th>Action</Th>
              <Th>Acteur</Th>
              <Th>Entité</Th>
              <Th>Résumé</Th>
              <Th>Empreinte</Th>
            </>
          }
          empty={rows.length === 0}
        >
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-2">
              <Td className="whitespace-nowrap">{dateTimeFr(r.createdAt)}</Td>
              <Td className="font-mono text-[12px] font-semibold text-ink">{r.action}</Td>
              <Td>{r.actorRole ? (ROLE_FR[r.actorRole] ?? r.actorRole) : "Système"}</Td>
              <Td className="font-mono text-[12px]">
                {r.entityType ?? "—"}
                {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
              </Td>
              <Td className="max-w-[320px]">
                <span className="line-clamp-2">{r.aiSummary ?? (r.afterValue ? JSON.stringify(r.afterValue).slice(0, 120) : "—")}</span>
              </Td>
              <Td className="font-mono text-[11px] text-muted">{r.hash ? r.hash.slice(0, 10) : "—"}</Td>
            </tr>
          ))}
        </TableShell>
        {rows.length >= 100 && <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">100 entrées les plus récentes affichées — affinez les filtres pour remonter plus loin.</p>}
      </Panel>
    </div>
  );
}
