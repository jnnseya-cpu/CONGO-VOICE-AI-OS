import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission, moduleScopeFor } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { CHANNEL_FR, LANGUAGE_FR, ModuleBadge, Panel, SeverityBadge, dateTimeFr, nowMs, since } from "@client/components/dashboard/Common";
import { IconMessage, IconMic } from "@client/components/icons";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date) {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  if (dayKey(d) === dayKey(today)) return "Aujourd'hui";
  if (dayKey(d) === dayKey(yesterday)) return "Hier";
  return DAY_FORMAT.format(d);
}

interface Row {
  id: string;
  module: string;
  channel: string;
  language: string | null;
  province: string | null;
  transcript: string | null;
  originalInput: string | null;
  understanding: string | null;
  summary: string | null;
  severity: string | null;
  escalated: boolean;
  createdAt: Date;
}

function group(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const key = dayKey(r.createdAt);
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return Array.from(map.entries());
}

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/messages");

  const db = await getDb();
  const columns = {
    id: schema.interactions.id,
    module: schema.interactions.module,
    channel: schema.interactions.channel,
    language: schema.interactions.language,
    province: schema.interactions.province,
    transcript: schema.interactions.transcript,
    originalInput: schema.interactions.originalInput,
    understanding: schema.interactions.understanding,
    summary: schema.interactions.summary,
    severity: schema.interactions.severity,
    escalated: schema.interactions.escalationRequired,
    createdAt: schema.interactions.createdAt,
  };

  const mine = await db.select(columns).from(schema.interactions).where(eq(schema.interactions.userId, session.userId)).orderBy(desc(schema.interactions.createdAt)).limit(60);

  const institutional = hasPermission(session.role, "case:read");
  const scope = moduleScopeFor(session.role);
  const escalated = institutional
    ? await db
        .select(columns)
        .from(schema.interactions)
        .where(and(eq(schema.interactions.escalationRequired, true), scope ? inArray(schema.interactions.module, scope) : undefined))
        .orderBy(desc(schema.interactions.createdAt))
        .limit(12)
    : [];

  const now = nowMs();
  const days = group(mine as Row[]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader
        title="Messages"
        subtitle="Vos conversations avec la plateforme, regroupées par jour. Tout est enregistré et consultable."
        actions={
          <Link href="/sante#parler" className="btn btn-primary">
            <IconMic size={16} /> Nouvelle conversation
          </Link>
        }
      />

      <div className={institutional ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]" : ""}>
        <div className="space-y-4">
          {days.length === 0 && (
            <Panel title="Vos conversations">
              <div className="px-5 py-10 text-center">
                <span className="icon-tile mx-auto h-11 w-11 bg-brand-soft text-brand">
                  <IconMessage size={20} />
                </span>
                <p className="mt-3 text-[13.5px] font-semibold text-ink">Aucune conversation pour l&apos;instant.</p>
                <p className="mt-1 text-[13px] text-muted">Posez votre première question en santé, agriculture ou éducation — dans votre langue.</p>
                <Link href="/sante#parler" className="btn btn-primary mt-4 inline-flex">
                  Parler maintenant
                </Link>
              </div>
            </Panel>
          )}

          {days.map(([key, rows]) => (
            <Panel key={key} title={dayLabel(rows[0].createdAt)} hint={`${rows.length} échange(s)`}>
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/historique/${r.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-2">
                      <ModuleBadge module={r.module} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{r.transcript ?? r.originalInput ?? "Conversation"}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted">
                          {(r.understanding ?? r.summary ?? "").replace(/^\[[^\]]+\]\s*/, "") || `${CHANNEL_FR[r.channel] ?? r.channel} · ${LANGUAGE_FR[r.language ?? "fr"] ?? ""}`}
                        </span>
                      </span>
                      {r.escalated && <span className="tag tag-danger shrink-0">Suivi humain</span>}
                      <span className="shrink-0 text-[12px] text-muted">{r.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>

        {institutional && (
          <Panel title="Conversations escaladées" hint={scope ? `Module ${scope[0] === "health" ? "santé" : scope[0] === "agriculture" ? "agriculture" : "éducation"} — dans votre périmètre.` : "Tous modules — dans votre périmètre."}>
            <ul className="divide-y divide-line">
              {escalated.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-muted">Aucune conversation escaladée.</li>}
              {escalated.map((r) => (
                <li key={r.id}>
                  <Link href={`/historique/${r.id}`} className="block px-5 py-3 hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <ModuleBadge module={r.module} />
                      <SeverityBadge severity={r.severity} />
                      <span className="ml-auto text-[11.5px] text-muted">{since(r.createdAt, now)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink">{r.transcript ?? r.originalInput ?? "—"}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {r.province ?? "Province non renseignée"} · {dateTimeFr(r.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-3">
              <Link href="/cas" className="link">
                Ouvrir la file des cas
              </Link>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
