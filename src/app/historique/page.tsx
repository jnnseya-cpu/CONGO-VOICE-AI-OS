import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { getDb, schema } from "@server/db/client";
import { PageHeader, Badge, EmptyState } from "@client/components/ui";

export const metadata = { title: "Mon historique" };
export const dynamic = "force-dynamic";

const TONE = { health: "health", agriculture: "agri", education: "edu", general: "case" } as const;

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) return <div className="mx-auto max-w-[900px]"><PageHeader title="Mon historique" /><EmptyState title="Connectez-vous ou commencez une conversation pour voir votre historique." /></div>;
  const db = await getDb();
  const rows = await db.select().from(schema.interactions).where(eq(schema.interactions.userId, session.userId)).orderBy(desc(schema.interactions.createdAt)).limit(50);
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="Mon historique" subtitle="Toutes vos conversations sont enregistrées et consultables ici." />
      <div className="card divide-y divide-line">
        {rows.length === 0 && <div className="p-5"><EmptyState title="Aucune conversation pour l'instant." /></div>}
        {rows.map((r) => (
          <Link key={r.id} href={`/historique/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
            <Badge tone={TONE[r.module]}>{r.module === "health" ? "Santé" : r.module === "agriculture" ? "Agriculture" : r.module === "education" ? "Éducation" : "Accueil"}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.transcript ?? r.originalInput ?? "—"}</span>
            <span className="text-xs text-muted">{r.createdAt.toLocaleString("fr-FR")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
