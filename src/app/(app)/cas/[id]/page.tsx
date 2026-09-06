import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission, moduleScopeFor } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { permittedTransitions } from "@server/ai/agents/workflow";
import type { CaseStatus } from "@server/db/schema";
import type { FinalAnswer } from "@shared/types";
import { PageHeader } from "@client/components/ui";
import { CaseActions } from "@client/components/cases/CaseActions";
import {
  AccessNotice,
  CHANNEL_FR,
  LANGUAGE_FR,
  MODULE_FR,
  Notice,
  Panel,
  SEVERITY_FR,
  SeverityBadge,
  StatusBadge,
  dateTimeFr,
  dueIn,
  fmt,
  nowMs,
  since,
} from "@client/components/dashboard/Common";
import { IconAlert, IconFile, IconVolume } from "@client/components/icons";

export const metadata = { title: "Cas" };
export const dynamic = "force-dynamic";

/** Statuses the current PATCH /api/v1/cases/[id] contract accepts. */
const PATCH_STATUSES: CaseStatus[] = ["open", "assigned", "in_progress", "escalated", "resolved", "closed"];

const EVENT_FR: Record<string, string> = {
  created: "Cas ouvert",
  assigned: "Attribution",
  status_changed: "Changement de statut",
  escalated: "Escalade",
  note: "Note",
  reminder: "Rappel",
  merged: "Fusion",
  override: "Correction de gravité",
  follow_up: "Suivi",
};

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/connexion?next=/cas/${id}`);
  if (!hasPermission(session.role, "case:read")) return <AccessNotice title="Cas" hint="Le suivi des cas est réservé aux agents de terrain, aux ONG partenaires et aux administrations." />;

  const db = await getDb();
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
  if (!c) notFound();
  const scope = moduleScopeFor(session.role);
  if (scope && !scope.includes(c.module))
    return <AccessNotice title="Cas hors de votre périmètre" hint={`Ce cas relève du module ${MODULE_FR[c.module].toLowerCase()} ; votre profil ne couvre que le module ${MODULE_FR[scope[0]].toLowerCase()}.`} back="/cas" />;

  const [events, interactionRows, assigneeRows, followUps, risk] = await Promise.all([
    db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, c.id)).orderBy(asc(schema.caseEvents.createdAt)),
    c.interactionId ? db.select().from(schema.interactions).where(eq(schema.interactions.id, c.interactionId)) : Promise.resolve([]),
    c.assignedTo ? db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, c.assignedTo)) : Promise.resolve([]),
    db.select().from(schema.followUps).where(eq(schema.followUps.caseId, c.id)).orderBy(desc(schema.followUps.scheduledFor)).limit(5),
    db.select().from(schema.riskAssessments).where(eq(schema.riskAssessments.caseId, c.id)).orderBy(desc(schema.riskAssessments.createdAt)).limit(1),
  ]);

  const interaction = interactionRows[0] ?? null;
  const assignee = assigneeRows[0] ?? null;
  const structured = (interaction?.structured ?? {}) as { answer?: FinalAnswer; answerLocalised?: FinalAnswer };
  const answer = structured.answer ?? structured.answerLocalised ?? null;
  const now = nowMs();
  const sla = dueIn(c.slaDueAt, now);
  const attachments = (interaction?.attachmentIds ?? []) as string[];
  const riskRow = risk[0] ?? null;

  const allowed = permittedTransitions(c.status).map((s) => s.to);
  const allowedStatuses = allowed.filter((s) => PATCH_STATUSES.includes(s));

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title={c.title}
        subtitle={`${MODULE_FR[c.module]} · ${c.province ?? "province non renseignée"}${c.territory ? ` · ${c.territory}` : ""} · ouvert ${since(c.createdAt, now).toLowerCase()}`}
        actions={
          <Link href="/cas" className="btn btn-ghost">
            Retour à la file
          </Link>
        }
      />

      {(c.severity === "critical" || c.severity === "high" || c.safeguarding) && (
        <Notice tone="danger">
          <strong>Niveau de risque {SEVERITY_FR[c.severity].toLowerCase()}</strong> — niveau {c.severityLevel} sur 4.{" "}
          {c.severityLevel >= 4
            ? "Prise en charge immédiate attendue : contactez le citoyen et le centre de santé le plus proche."
            : "Prise en charge attendue le jour même."}
          {c.safeguarding && " Ce cas comporte un signalement de protection : appliquez la procédure de sauvegarde."}
        </Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <Panel title="État du cas">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 sm:grid-cols-3">
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Statut</dt>
                <dd className="mt-1">
                  <StatusBadge status={c.status} />
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Gravité</dt>
                <dd className="mt-1">
                  <SeverityBadge severity={c.severity} />
                </dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Échéance (SLA)</dt>
                <dd className={`mt-1 text-[13.5px] font-semibold ${sla.late ? "text-danger" : "text-ink"}`}>{c.slaDueAt ? sla.label : "Sans horloge"}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Responsable</dt>
                <dd className="mt-1 text-[13.5px] text-ink">{assignee?.name ?? "Non attribué"}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Accusé de réception</dt>
                <dd className="mt-1 text-[13.5px] text-ink">{c.acknowledgedAt ? dateTimeFr(c.acknowledgedAt) : "En attente"}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Niveau d&apos;escalade</dt>
                <dd className="mt-1 text-[13.5px] text-ink">{c.escalationLevel > 0 ? `Niveau ${c.escalationLevel}` : "Aucune"}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">File</dt>
                <dd className="mt-1 truncate text-[13.5px] text-ink">{c.queue ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Suivi prévu</dt>
                <dd className="mt-1 text-[13.5px] text-ink">{c.followUpDate ? dateTimeFr(c.followUpDate) : "—"}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Résultat</dt>
                <dd className="mt-1 text-[13.5px] text-ink">{c.outcome ?? "—"}</dd>
              </div>
            </dl>
            {c.overriddenSeverityLevel !== null && c.overrideReason && (
              <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
                Gravité corrigée par un agent (niveau {c.overriddenSeverityLevel}) — motif : {c.overrideReason}
              </div>
            )}
          </Panel>

          <Panel title="Ce que le citoyen a dit" hint={interaction ? `${CHANNEL_FR[interaction.channel] ?? interaction.channel} · ${LANGUAGE_FR[interaction.language ?? "fr"] ?? "—"} · ${dateTimeFr(interaction.createdAt)}` : undefined}>
            {!interaction ? (
              <p className="px-5 py-6 text-[13px] text-muted">Ce cas a été ouvert manuellement : aucune conversation n&apos;y est rattachée.</p>
            ) : (
              <div className="space-y-4 p-5">
                {interaction.audioFileId && (
                  <div className="rounded-xl border border-line bg-surface-2 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink-2">
                      <IconVolume size={15} /> Enregistrement d&apos;origine
                    </div>
                    <audio controls preload="none" className="w-full" src={`/api/v1/files/${interaction.audioFileId}`} />
                  </div>
                )}
                <div>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Transcription d&apos;origine</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink">{interaction.transcript ?? interaction.originalInput ?? "—"}</p>
                </div>
                {interaction.translationFr && (
                  <div>
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Traduction française</div>
                    <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{interaction.translationFr}</p>
                  </div>
                )}
                {interaction.confidence !== null && (
                  <p className="text-[12px] text-muted">
                    Confiance de compréhension : {Math.round((interaction.confidence ?? 0) * 100)} %{interaction.confidence < 0.55 ? " — vérifiez le contenu avec le citoyen." : ""}
                  </p>
                )}
                {attachments.length > 0 && (
                  <div>
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Pièces jointes</div>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {attachments.map((a, i) => (
                        <li key={a}>
                          <a href={`/api/v1/files/${a}`} className="btn btn-ghost h-9 text-[12.5px]" target="_blank" rel="noreferrer">
                            <IconFile size={15} /> Pièce {i + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>

          {answer && (
            <Panel title="Résumé IA" hint="Compréhension et orientation produites par le système ; les règles de risque sont déterministes.">
              <div className="space-y-3 p-5">
                <div>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Ce que le système a compris</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink">{answer.understanding}</p>
                </div>
                <div>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Orientation donnée</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink">{answer.action}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <SeverityBadge severity={answer.risk.level} />
                  <span className="tag tag-muted">Score {Math.round(answer.risk.score * 100)} %</span>
                  <span className="tag tag-muted">Confiance {Math.round(answer.confidence.score * 100)} %</span>
                  {answer.risk.flags.map((f) => (
                    <span key={f} className="tag tag-warn">
                      {f}
                    </span>
                  ))}
                </div>
                {riskRow && (
                  <p className="text-[12px] text-muted">
                    Règles déclenchées ({riskRow.rulePackVersion}) : {riskRow.triggeredRules.length ? riskRow.triggeredRules.join(", ") : "aucune"}.
                  </p>
                )}
              </div>
            </Panel>
          )}

          {c.notes && (
            <Panel title="Notes du dossier">
              <p className="whitespace-pre-line p-5 text-[13.5px] leading-relaxed text-ink-2">{c.notes}</p>
            </Panel>
          )}

          <Panel title="Historique" hint="Toutes les actions effectuées sur ce cas, dans l'ordre chronologique.">
            <ol className="divide-y divide-line">
              {events.length === 0 && <li className="px-5 py-6 text-[13px] text-muted">Aucun évènement enregistré.</li>}
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-3">
                  <span className="icon-tile mt-0.5 h-7 w-7 bg-brand-soft text-brand">
                    <IconAlert size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-ink">{EVENT_FR[e.type] ?? e.type}</span>
                      {e.fromValue && e.toValue && (
                        <span className="text-[12px] text-muted">
                          {e.fromValue} → {e.toValue}
                        </span>
                      )}
                      <span className="ml-auto text-[11.5px] text-muted-2">{dateTimeFr(e.createdAt)}</span>
                    </div>
                    {e.note && <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{e.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <CaseActions
            caseId={c.id}
            status={c.status}
            severityLevel={c.severityLevel}
            acknowledged={!!c.acknowledgedAt}
            assignedToMe={c.assignedTo === session.userId}
            allowedStatuses={allowedStatuses}
            extendedStatuses={allowed}
            canWrite={hasPermission(session.role, "case:write")}
            canEscalate={hasPermission(session.role, "case:escalate")}
            canAssign={hasPermission(session.role, "case:assign")}
            myId={session.userId}
          />

          {followUps.length > 0 && (
            <Panel title="Suivis programmés">
              <ul className="divide-y divide-line">
                {followUps.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-ink">{dateTimeFr(f.scheduledFor)}</span>
                      <span className="tag tag-muted">{CHANNEL_FR[f.channel] ?? f.channel}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {f.status === "captured" ? `Réponse recueillie : ${f.outcome ?? "—"}` : f.status === "cancelled" ? "Annulé" : f.status === "unreachable" ? "Citoyen injoignable" : "Programmé"}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Références">
            <ul className="divide-y divide-line text-[13px]">
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Identifiant</span>
                <span className="font-mono text-[12px] text-ink">{c.id.slice(0, 8)}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Version</span>
                <span className="tabular-nums text-ink">{fmt(c.version)}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-muted">Créé le</span>
                <span className="text-ink">{dateTimeFr(c.createdAt)}</span>
              </li>
              {interaction && (
                <li className="px-5 py-2.5">
                  <Link href={`/historique/${interaction.id}`} className="link">
                    Voir la conversation complète
                  </Link>
                </li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
