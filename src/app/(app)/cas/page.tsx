import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission, moduleScopeFor } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import type { CaseStatus, ModuleType, Severity } from "@server/db/schema";
import { PageHeader } from "@client/components/ui";
import { CaseFilters } from "@client/components/cases/CaseFilters";
import { AccessNotice, MODULE_FR, Panel, SeverityBadge, StatTile, StatusBadge, TableShell, Td, Th, dueIn, fmt, nowMs, since } from "@client/components/dashboard/Common";
import { IconAlert, IconBriefcase, IconClock, IconPlus } from "@client/components/icons";

export const metadata = { title: "Cas & Suivi" };
export const dynamic = "force-dynamic";

const ACTIVE: CaseStatus[] = ["open", "open_emergency", "assigned", "acknowledged", "in_progress", "needs_follow_up", "reassigned", "escalated", "escalated_up"];
const ALL_STATUSES: CaseStatus[] = [...ACTIVE, "resolved", "closed", "cancelled", "duplicate"];
const ALL_MODULES: ModuleType[] = ["health", "agriculture", "education", "general"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/cas");
  if (!hasPermission(session.role, "case:read"))
    return <AccessNotice title="File des cas" hint="La file des cas est réservée aux agents de terrain, aux ONG partenaires et aux administrations. Vos propres échanges restent consultables dans « Messages »." />;

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) ?? "";
  const status = ALL_STATUSES.includes(one("status") as CaseStatus) ? (one("status") as CaseStatus) : null;
  const moduleParam = ALL_MODULES.includes(one("module") as ModuleType) ? (one("module") as ModuleType) : null;
  const severity = SEVERITIES.includes(one("severity") as Severity) ? (one("severity") as Severity) : null;
  const mine = one("mine") === "1";

  const scope = moduleScopeFor(session.role);
  const modules = scope ?? ALL_MODULES;

  const db = await getDb();
  const where = and(
    scope ? inArray(schema.cases.module, scope) : undefined,
    moduleParam ? eq(schema.cases.module, moduleParam) : undefined,
    status ? eq(schema.cases.status, status) : inArray(schema.cases.status, ACTIVE),
    severity ? eq(schema.cases.severity, severity) : undefined,
    mine ? eq(schema.cases.assignedTo, session.userId) : undefined,
  );

  const rows = await db.select().from(schema.cases).where(where).orderBy(desc(schema.cases.severity), desc(schema.cases.createdAt)).limit(100);
  const total = (await db.select({ n: count() }).from(schema.cases).where(where))[0].n;

  const assigneeIds = Array.from(new Set(rows.map((r) => r.assignedTo).filter((v): v is string => !!v)));
  const assignees = assigneeIds.length
    ? await db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(inArray(schema.users.id, assigneeIds))
    : [];
  const nameOf = (id: string | null) => (id ? (assignees.find((a) => a.id === id)?.name ?? "Agent") : null);

  const now = nowMs();
  const critical = rows.filter((r) => r.severity === "critical").length;
  const late = rows.filter((r) => r.slaDueAt && r.slaDueAt.getTime() < now).length;
  const unassigned = rows.filter((r) => !r.assignedTo).length;

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Cas & Suivi"
        subtitle={scope ? `File du module ${MODULE_FR[scope[0]].toLowerCase()} — un cas, un responsable, une échéance.` : "Tous les modules — un cas, un responsable, une échéance."}
        actions={
          hasPermission(session.role, "case:write") ? (
            <Link href="/cas/nouveau" className="btn btn-primary">
              <IconPlus size={16} /> Nouveau cas
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cas affichés" value={fmt(total)} hint="Selon les filtres appliqués." icon={<IconBriefcase size={16} />} tone="brand" />
        <StatTile label="Cas critiques" value={fmt(critical)} hint="Gravité 4 : prise en charge sous 15 minutes." icon={<IconAlert size={16} />} tone={critical > 0 ? "danger" : "muted"} />
        <StatTile label="Hors délai" value={fmt(late)} hint="Échéance de prise en charge dépassée." icon={<IconClock size={16} />} tone={late > 0 ? "warn" : "muted"} />
        <StatTile label="Sans responsable" value={fmt(unassigned)} hint="À attribuer à un agent." icon={<IconBriefcase size={16} />} tone={unassigned > 0 ? "warn" : "muted"} />
      </div>

      <Panel>
        <Suspense fallback={<div className="h-[62px] border-b border-line" />}>
          <CaseFilters modules={modules} />
        </Suspense>
        <TableShell
          head={
            <>
              <Th>Cas</Th>
              <Th>Gravité</Th>
              <Th>Statut</Th>
              <Th>Échéance</Th>
              <Th>Province</Th>
              <Th>Responsable</Th>
              <Th className="text-right">Escalade</Th>
              <Th>Ouvert</Th>
            </>
          }
          empty={rows.length === 0}
        >
          {rows.map((c) => {
            const due = dueIn(c.slaDueAt, now);
            return (
              <tr key={c.id} className="hover:bg-surface-2">
                <Td className="max-w-[340px]">
                  <Link href={`/cas/${c.id}`} className="block font-medium text-ink hover:text-brand">
                    <span className="line-clamp-2">{c.title}</span>
                  </Link>
                  <span className="mt-0.5 block text-[11.5px] text-muted">{MODULE_FR[c.module]}</span>
                </Td>
                <Td>
                  <SeverityBadge severity={c.severity} />
                </Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td className={due.late ? "whitespace-nowrap font-semibold text-danger" : "whitespace-nowrap"}>{c.slaDueAt ? due.label : "—"}</Td>
                <Td>{c.province ?? "—"}</Td>
                <Td>{nameOf(c.assignedTo) ?? <span className="text-muted">Non attribué</span>}</Td>
                <Td className="text-right tabular-nums">{c.escalationLevel > 0 ? `Niveau ${c.escalationLevel}` : "—"}</Td>
                <Td className="whitespace-nowrap">{since(c.createdAt, now)}</Td>
              </tr>
            );
          })}
        </TableShell>
        {rows.length >= 100 && <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">100 premiers cas affichés — affinez les filtres pour réduire la liste.</p>}
      </Panel>
    </div>
  );
}
