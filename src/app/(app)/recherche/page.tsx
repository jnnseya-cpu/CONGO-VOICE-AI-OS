import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission, moduleScopeFor } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { CHANNEL_FR, LANGUAGE_FR, ModuleBadge, Panel, SeverityBadge, StatusBadge, dateTimeFr, inputClass, nowMs, since } from "@client/components/dashboard/Common";
import { IconSearch } from "@client/components/icons";

export const metadata = { title: "Recherche" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/recherche");

  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const institutional = hasPermission(session.role, "case:read");
  const readAll = hasPermission(session.role, "interaction:read_all");
  const scope = moduleScopeFor(session.role);
  const now = nowMs();

  let interactions: Array<typeof schema.interactions.$inferSelect> = [];
  let cases: Array<typeof schema.cases.$inferSelect> = [];

  if (query.length >= 2) {
    const db = await getDb();
    const like = `%${query}%`;
    interactions = await db
      .select()
      .from(schema.interactions)
      .where(
        and(
          readAll ? undefined : eq(schema.interactions.userId, session.userId),
          or(
            sql`${schema.interactions.transcript} ILIKE ${like}`,
            sql`${schema.interactions.originalInput} ILIKE ${like}`,
            sql`${schema.interactions.translationFr} ILIKE ${like}`,
            sql`${schema.interactions.understanding} ILIKE ${like}`,
            sql`${schema.interactions.summary} ILIKE ${like}`,
          ),
        ),
      )
      .orderBy(desc(schema.interactions.createdAt))
      .limit(30);

    if (institutional) {
      cases = await db
        .select()
        .from(schema.cases)
        .where(and(scope ? inArray(schema.cases.module, scope) : undefined, or(sql`${schema.cases.title} ILIKE ${like}`, sql`${schema.cases.notes} ILIKE ${like}`, sql`${schema.cases.outcome} ILIKE ${like}`)))
        .orderBy(desc(schema.cases.createdAt))
        .limit(30);
    }
  }

  const total = interactions.length + cases.length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader
        title="Recherche"
        subtitle={
          query.length >= 2
            ? `${total} résultat(s) pour « ${query} »${readAll ? "" : institutional ? " — vos conversations et les cas de votre périmètre" : " — dans vos conversations"}.`
            : "Retrouvez une conversation ou un cas à partir de quelques mots."
        }
      />

      <Panel>
        <form action="/recherche" method="get" className="flex flex-wrap items-center gap-2 p-5">
          <label htmlFor="q" className="sr-only">
            Mots à rechercher
          </label>
          <input id="q" name="q" defaultValue={query} className={`${inputClass} min-w-[240px] flex-1`} placeholder="Ex. fièvre enfant, chenilles maïs, fractions…" autoFocus />
          <button type="submit" className="btn btn-primary h-10">
            <IconSearch size={16} /> Rechercher
          </button>
        </form>
      </Panel>

      {query.length > 0 && query.length < 2 && (
        <Panel>
          <p className="px-5 py-8 text-center text-[13px] text-muted">Saisissez au moins deux caractères.</p>
        </Panel>
      )}

      {query.length >= 2 && (
        <>
          <Panel title="Conversations" hint={readAll ? "Toutes les conversations de la plateforme." : "Vos conversations."}>
            <ul className="divide-y divide-line">
              {interactions.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Aucune conversation ne correspond à cette recherche.</li>}
              {interactions.map((r) => (
                <li key={r.id}>
                  <Link href={`/historique/${r.id}`} className="block px-5 py-3.5 hover:bg-surface-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ModuleBadge module={r.module} />
                      <span className="tag tag-muted">{CHANNEL_FR[r.channel] ?? r.channel}</span>
                      {r.language && <span className="tag tag-muted">{LANGUAGE_FR[r.language]}</span>}
                      {r.escalationRequired && <span className="tag tag-danger">Suivi humain</span>}
                      <span className="ml-auto text-[11.5px] text-muted">{since(r.createdAt, now)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-snug text-ink">{r.transcript ?? r.originalInput ?? "—"}</p>
                    {(r.understanding ?? r.summary) && <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{(r.understanding ?? r.summary ?? "").replace(/^\[[^\]]+\]\s*/, "")}</p>}
                    <p className="mt-0.5 text-[11.5px] text-muted-2">
                      {r.province ?? "Province non renseignée"} · {dateTimeFr(r.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          {institutional && (
            <Panel title="Cas" hint={scope ? "Cas de votre module." : "Tous modules."}>
              <ul className="divide-y divide-line">
                {cases.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Aucun cas ne correspond à cette recherche.</li>}
                {cases.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cas/${c.id}`} className="block px-5 py-3.5 hover:bg-surface-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ModuleBadge module={c.module} />
                        <SeverityBadge severity={c.severity} />
                        <StatusBadge status={c.status} />
                        <span className="ml-auto text-[11.5px] text-muted">{since(c.createdAt, now)}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{c.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted-2">
                        {c.province ?? "Province non renseignée"} · {dateTimeFr(c.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
