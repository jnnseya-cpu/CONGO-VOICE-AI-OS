import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader, Badge } from "@client/components/ui";
import type { FinalAnswer } from "@shared/types";

export const dynamic = "force-dynamic";

export default async function InteractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  const db = await getDb();
  const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, id));
  if (!row) notFound();
  if (row.userId !== session.userId && !hasPermission(session.role, "case:read")) notFound();
  const structured = (row.structured ?? {}) as { answer?: FinalAnswer; answerLocalised?: FinalAnswer };
  const a = structured.answerLocalised ?? structured.answer;
  const rows: Array<[string, string | null | undefined]> = [
    ["Ce qui a été dit", row.transcript ?? row.originalInput],
    ["Traduction (français)", row.translationFr],
    ["Compréhension", row.understanding],
    ["Réponse", row.response],
    ["Résumé enregistré", row.summary],
  ];
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Détail de la conversation" subtitle={`${row.createdAt.toLocaleString("fr-FR")} · ${row.language ?? "—"} · ${row.province ?? "—"}`} />
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone="case">{row.module}</Badge>
          {row.severity && <Badge tone={row.severity === "critical" || row.severity === "high" ? "danger" : row.severity === "medium" ? "warn" : "health"}>Risque {row.severity}</Badge>}
          {row.escalationRequired && <Badge tone="case">Escaladé</Badge>}
          {row.confidence !== null && <Badge tone="muted">Confiance {Math.round((row.confidence ?? 0) * 100)}%</Badge>}
          <Badge tone="muted">{row.status}</Badge>
        </div>
        {rows.map(([label, value]) => value ? (
          <div key={label}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
            <p className="mt-1 text-[14px] leading-relaxed text-ink">{value}</p>
          </div>
        ) : null)}
        {a?.escalation.required && <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">Suivi humain : {a.escalation.to} — {a.escalation.reason}</p>}
        {row.caseId && <a href={`/cas/${row.caseId}`} className="link">Voir le cas associé →</a>}
      </div>
    </div>
  );
}
