"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FieldLabel, Notice, Panel, inputClass, selectClass, textareaClass } from "../dashboard/Common";

const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  open_emergency: "Urgence ouverte",
  assigned: "Attribué",
  acknowledged: "Accusé de réception",
  in_progress: "En cours",
  needs_follow_up: "Suivi requis",
  reassigned: "Réattribué",
  escalated: "Escaladé",
  escalated_up: "Escalade superviseur",
  resolved: "Résolu",
  closed: "Clos",
  cancelled: "Annulé",
  duplicate: "Doublon",
};

const OUTCOMES = [
  "Orienté vers un centre de santé",
  "Rétabli / résolu",
  "Conseil suffisant",
  "Visite de terrain effectuée",
  "Traitement appliqué",
  "Sans changement",
  "Citoyen injoignable",
];

const REACHABILITY = [
  { value: "reached", label: "Citoyen joint" },
  { value: "reached_by_proxy", label: "Joint par un proche" },
  { value: "not_reached", label: "Non joint" },
  { value: "refused", label: "A refusé" },
  { value: "unknown", label: "Inconnu" },
];

const DECISIONS = [
  { value: "no_follow_up", label: "Pas de suivi" },
  { value: "follow_up_scheduled", label: "Suivi programmé" },
  { value: "referred", label: "Orienté" },
  { value: "monitoring", label: "Sous surveillance" },
  { value: "handed_over", label: "Transmis à un partenaire" },
];

const SEVERITY_LEVELS = [
  { value: "0", label: "0 — Autosoins" },
  { value: "1", label: "1 — Surveillance" },
  { value: "2", label: "2 — Centre sous 24 h" },
  { value: "3", label: "3 — Centre aujourd'hui" },
  { value: "4", label: "4 — Urgence immédiate" },
];

interface Props {
  caseId: string;
  status: string;
  severityLevel: number;
  acknowledged: boolean;
  assignedToMe: boolean;
  allowedStatuses: string[];
  extendedStatuses: string[];
  canWrite: boolean;
  canEscalate: boolean;
  canAssign: boolean;
  myId: string;
}

type Feature = "acknowledge" | "transitions" | "risk-overrides" | "follow-ups";

export function CaseActions(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [available, setAvailable] = useState<Record<Feature, boolean> | null>(null);

  const [status, setStatus] = useState(props.allowedStatuses[0] ?? "");
  const [statusNote, setStatusNote] = useState("");
  const [reason, setReason] = useState("");
  const [overrideLevel, setOverrideLevel] = useState(String(props.severityLevel));
  const [overrideReason, setOverrideReason] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState("sms");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [actionTaken, setActionTaken] = useState("");
  const [reachability, setReachability] = useState("reached");
  const [decision, setDecision] = useState("no_follow_up");

  useEffect(() => {
    let cancelled = false;
    const base = `/api/v1/cases/${props.caseId}`;
    const features: Feature[] = ["acknowledge", "transitions", "risk-overrides", "follow-ups"];
    Promise.all(
      features.map(async (f) => {
        try {
          const r = await fetch(`${base}/${f}`, { method: "OPTIONS" });
          return [f, r.status !== 404] as const;
        } catch {
          return [f, false] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setAvailable(Object.fromEntries(entries) as Record<Feature, boolean>);
    });
    return () => {
      cancelled = true;
    };
  }, [props.caseId]);

  async function call(key: string, url: string, method: string, body?: unknown, successMessage?: string) {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de l'opération (${res.status}).`);
      setDone(successMessage ?? "Modification enregistrée.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'opération.");
    } finally {
      setBusy(null);
    }
  }

  const base = `/api/v1/cases/${props.caseId}`;
  const options = available?.transitions ? props.extendedStatuses : props.allowedStatuses;
  const current = options.includes(status) ? status : (options[0] ?? "");
  const closing = current === "closed";
  const disabled = !props.canWrite;

  if (!props.canWrite && !props.canEscalate) {
    return (
      <Panel title="Actions">
        <div className="p-5">
          <Notice tone="brand">Votre profil permet de consulter ce cas mais pas de le modifier.</Notice>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Actions" hint="Chaque action est enregistrée dans l'historique du cas et dans le journal d'audit.">
      <div className="space-y-4 p-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {done && <Notice tone="health">{done}</Notice>}

        <div className="flex flex-wrap gap-2">
          {available?.acknowledge && !props.acknowledged && (
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => call("ack", `${base}/acknowledge`, "POST", {}, "Accusé de réception enregistré.")}>
              {busy === "ack" ? "…" : "Accuser réception"}
            </button>
          )}
          {props.canAssign && !props.assignedToMe && (
            <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => call("assign", base, "PATCH", { assignTo: props.myId }, "Cas attribué.")}>
              {busy === "assign" ? "…" : "M'attribuer ce cas"}
            </button>
          )}
        </div>

        {options.length > 0 && !disabled && (
          <div className="rounded-xl border border-line p-4">
            <FieldLabel htmlFor="case-status">Changer le statut</FieldLabel>
            <select id="case-status" className={selectClass} value={current} onChange={(e) => setStatus(e.target.value)}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
            <textarea className={`${textareaClass} mt-2`} rows={2} placeholder="Motif ou précision (obligatoire pour certaines transitions)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
            {closing && (
              <div className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3">
                <p className="text-[12px] text-muted">La clôture exige un résultat, l&apos;action menée, la joignabilité du citoyen et la décision de suivi.</p>
                <div>
                  <FieldLabel htmlFor="case-outcome">Résultat</FieldLabel>
                  <select id="case-outcome" className={selectClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="case-action">Action menée</FieldLabel>
                  <input id="case-action" className={inputClass} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="Ex. visite à domicile et orientation au centre de santé" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="case-reach">Joignabilité</FieldLabel>
                    <select id="case-reach" className={selectClass} value={reachability} onChange={(e) => setReachability(e.target.value)}>
                      {REACHABILITY.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="case-decision">Décision de suivi</FieldLabel>
                    <select id="case-decision" className={selectClass} value={decision} onChange={(e) => setDecision(e.target.value)}>
                      {DECISIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary mt-3 w-full"
              disabled={busy !== null || !current}
              onClick={() =>
                available?.transitions
                  ? call("status", `${base}/transitions`, "POST", { to: current, note: statusNote || undefined, reason: statusNote || undefined, ...(closing ? { outcome, actionTaken, citizenReachability: reachability, followUpDecision: decision } : {}) }, "Statut mis à jour.")
                  : call("status", base, "PATCH", { status: current, note: statusNote || undefined, ...(closing ? { outcome } : {}) }, "Statut mis à jour.")
              }
            >
              {busy === "status" ? "…" : "Appliquer le changement"}
            </button>
          </div>
        )}

        {props.canEscalate && (
          <div className="rounded-xl border border-line p-4">
            <FieldLabel htmlFor="case-escalate">Escalader le cas</FieldLabel>
            <textarea id="case-escalate" className={textareaClass} rows={2} placeholder="Motif de l'escalade" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button type="button" className="btn btn-ghost mt-2 w-full border-danger text-danger" disabled={busy !== null || reason.trim().length < 10} onClick={() => call("esc", `${base}/escalate`, "POST", { reason: reason.trim() }, "Cas escaladé.")}>
              {busy === "esc" ? "…" : "Escalader"}
            </button>
            <p className="mt-1 text-[11.5px] text-muted">Motif d&apos;au moins 10 caractères. L&apos;escalade relève le niveau d&apos;attention et redémarre l&apos;horloge.</p>
          </div>
        )}

        {available?.["risk-overrides"] && !disabled && (
          <div className="rounded-xl border border-line p-4">
            <FieldLabel htmlFor="case-override">Corriger la gravité</FieldLabel>
            <select id="case-override" className={selectClass} value={overrideLevel} onChange={(e) => setOverrideLevel(e.target.value)}>
              {SEVERITY_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <textarea className={`${textareaClass} mt-2`} rows={2} placeholder="Motif écrit (obligatoire, 10 caractères minimum)" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            <button
              type="button"
              className="btn btn-ghost mt-2 w-full"
              disabled={busy !== null || overrideReason.trim().length < 10}
              onClick={() => call("override", `${base}/risk-overrides`, "POST", { severityLevel: Number(overrideLevel), reason: overrideReason.trim() }, "Gravité corrigée.")}
            >
              {busy === "override" ? "…" : "Enregistrer la correction"}
            </button>
            <p className="mt-1 text-[11.5px] text-muted">Toute correction de la gravité produite par le système est tracée avec son motif.</p>
          </div>
        )}

        {!disabled && (
          <div className="rounded-xl border border-line p-4">
            <FieldLabel htmlFor="case-followup">Programmer un suivi</FieldLabel>
            <input id="case-followup" type="datetime-local" className={inputClass} value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
            {available?.["follow-ups"] && (
              <select className={`${selectClass} mt-2`} value={followUpChannel} onChange={(e) => setFollowUpChannel(e.target.value)} aria-label="Canal du suivi">
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="in_app">Application</option>
              </select>
            )}
            <button
              type="button"
              className="btn btn-ghost mt-2 w-full"
              disabled={busy !== null || !followUpAt}
              onClick={() =>
                available?.["follow-ups"]
                  ? call("follow", `${base}/follow-ups`, "POST", { scheduledFor: new Date(followUpAt).toISOString(), channel: followUpChannel }, "Suivi programmé.")
                  : call("follow", base, "PATCH", { followUpDate: new Date(followUpAt).toISOString() }, "Suivi programmé.")
              }
            >
              {busy === "follow" ? "…" : "Programmer"}
            </button>
          </div>
        )}

        {!disabled && (
          <div className="rounded-xl border border-line p-4">
            <FieldLabel htmlFor="case-note">Ajouter une note</FieldLabel>
            <textarea id="case-note" className={textareaClass} rows={3} placeholder="Observation, appel passé, information reçue du citoyen…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn btn-primary mt-2 w-full" disabled={busy !== null || note.trim().length < 3} onClick={() => call("note", base, "PATCH", { note: note.trim() }, "Note ajoutée.").then(() => setNote(""))}>
              {busy === "note" ? "…" : "Enregistrer la note"}
            </button>
          </div>
        )}

        {available && !available.acknowledge && !available.transitions && !available["risk-overrides"] && !available["follow-ups"] && (
          <p className="text-[11.5px] leading-snug text-muted">
            Accusé de réception, transitions détaillées, corrections de gravité et suivis programmés ne sont pas activés sur cette instance : les actions correspondantes sont masquées.
          </p>
        )}
      </div>
    </Panel>
  );
}
