"use client";
import { useCallback, useEffect, useState } from "react";
import { Notice, Panel, TableShell, Td, Th, dateTimeFr, selectClass, textareaClass } from "../dashboard/Common";

/* The console the board actually uses: read the artefact, then sign it. */

interface Composition {
  requiredSeats: Record<string, number>;
  filledSeats: Record<string, number>;
  constituted: boolean;
  missing: string[];
}

interface Board {
  key: string;
  name: string;
  module: string;
  reviewCadenceDays: number;
  composition: Composition | null;
  mySeats: string[];
  members: Array<{ id: string; userId: string; seat: string; credential: string | null; appointedAt: string }>;
}

interface Artefact {
  kind: string;
  artefactId: string;
  version: string;
  title: string;
  module: string;
  digest: string;
  approved: boolean;
  reason: string;
  submissionId?: string;
  expiresAt?: string | null;
}

interface Submission {
  id: string;
  artefactKind: string;
  artefactId: string;
  artefactVersion: string;
  contentDigest: string;
  title: string;
  changeNote: string | null;
  status: string;
  submittedAt: string;
  expiresAt: string | null;
  quorum: { met: boolean; bySeat: Record<string, { required: number; approved: number }>; missing: string[]; rejectedBy: string[]; changesRequestedBy: string[] };
}

interface Detail {
  submission: Submission;
  quorum: Submission["quorum"];
  signoffs: Array<{ id: string; memberUserId: string; seat: string; decision: string; comment: string | null; signedAt: string }>;
  artefact: { digest: string; content: unknown } | null;
  stale: boolean;
}

const SEAT_FR: Record<string, string> = {
  physician: "Médecin",
  community_health_expert: "Expert en santé communautaire",
  agronomist: "Agronome",
  pedagogue: "Pédagogue",
  safeguarding_lead: "Référent protection",
};

const KIND_FR: Record<string, string> = {
  protocol_version: "Protocole",
  emergency_script: "Script fixe",
  kb_document: "Document de référence",
  system_prompt: "Invite système",
};

const REASON_FR: Record<string, string> = {
  approved: "Validé",
  never_submitted: "Jamais soumis",
  pending: "En attente de signatures",
  rejected: "Rejeté",
  changes_requested: "Modifications demandées",
  suspended: "Suspendu",
  content_changed: "Contenu modifié depuis la validation",
  expired: "Validation expirée",
  unknown_artefact: "Contenu introuvable",
};

const DECISION_FR: Record<string, string> = { approve: "Validation", reject: "Rejet", request_changes: "Modifications demandées" };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message ?? "Requête refusée.");
  return payload as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message ?? "Requête refusée.");
  return payload as T;
}

async function fetchAll(): Promise<{ boards: Board[]; artefacts: Artefact[]; submissions: Submission[] }> {
  const [b, a, s] = await Promise.all([
    getJson<{ boards: Board[] }>("/api/v1/review/boards"),
    getJson<{ artefacts: Artefact[] }>("/api/v1/review/artefacts"),
    getJson<{ submissions: Submission[] }>("/api/v1/review/submissions"),
  ]);
  return { boards: b.boards, artefacts: a.artefacts, submissions: s.submissions };
}

function readable(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

export function ReviewBoardConsole({ canSubmit }: { canSubmit: boolean }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [artefacts, setArtefacts] = useState<Artefact[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seat, setSeat] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(
    () =>
      fetchAll()
        .then((d) => {
          setBoards(d.boards);
          setArtefacts(d.artefacts);
          setSubmissions(d.submissions);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Comité indisponible.")),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((d) => {
        if (cancelled) return;
        setBoards(d.boards);
        setArtefacts(d.artefacts);
        setSubmissions(d.submissions);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Comité indisponible."));
    return () => {
      cancelled = true;
    };
  }, []);

  const mySeats = boards?.flatMap((b) => b.mySeats) ?? [];

  async function openSubmission(id: string) {
    setError(null);
    setDone(null);
    try {
      const detail = await getJson<Detail>(`/api/v1/review/submissions/${id}`);
      setOpen(detail);
      setSeat(mySeats[0] ?? "");
      setComment("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Soumission indisponible.");
    }
  }

  async function submit(artefact: Artefact) {
    const board = boards?.find((b) => b.module === artefact.module);
    if (!board) return setError(`Aucun comité pour le module ${artefact.module}.`);
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/v1/review/submissions", { boardKey: board.key, kind: artefact.kind, artefactId: artefact.artefactId });
      setDone(`${artefact.title} soumis à ${board.name}.`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Soumission impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sign(decision: "approve" | "reject" | "request_changes") {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/v1/review/submissions/${open.submission.id}/signoffs`, {
        seat,
        decision,
        comment: comment || undefined,
        // The digest the reviewer had on screen: signing a stale page is refused.
        contentDigest: open.submission.contentDigest,
      });
      setDone(`${DECISION_FR[decision]} enregistrée.`);
      await load();
      await openSubmission(open.submission.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Signature refusée.");
    } finally {
      setBusy(false);
    }
  }

  async function suspendOpen() {
    if (!open || !comment.trim()) return setError("Indiquez le motif de la suspension.");
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/v1/review/submissions/${open.submission.id}/suspend`, { reason: comment });
      setDone("Contenu suspendu. Il ne sera plus utilisé pour évaluer une situation.");
      await load();
      await openSubmission(open.submission.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Suspension refusée.");
    } finally {
      setBusy(false);
    }
  }

  const unsigned = artefacts?.filter((a) => !a.approved) ?? [];
  const signed = artefacts?.filter((a) => a.approved) ?? [];

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="health">{done}</Notice>}

      <Panel title="Comités" hint="Un comité ne peut rien valider tant que ses sièges ne sont pas pourvus.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(boards ?? []).map((b) => (
            <div key={b.key} className="rounded-[14px] border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-ink">{b.name}</div>
                <span className={`tag ${b.composition?.constituted ? "tag-health" : "tag-warn"}`}>
                  {b.composition?.constituted ? "Constitué" : "Incomplet"}
                </span>
              </div>
              <dl className="mt-3 space-y-1 text-[13px]">
                {Object.entries(b.composition?.requiredSeats ?? {}).map(([s, required]) => (
                  <div key={s} className="flex justify-between gap-2">
                    <dt className="text-muted">{SEAT_FR[s] ?? s}</dt>
                    <dd className="tabular-nums font-medium text-ink">
                      {b.composition?.filledSeats?.[s] ?? 0} / {required}
                    </dd>
                  </div>
                ))}
              </dl>
              {b.mySeats.length > 0 && (
                <p className="mt-3 text-[12.5px] text-muted">
                  Vous y siégez comme : {b.mySeats.map((s) => SEAT_FR[s] ?? s).join(", ")}.
                </p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Contenus à valider"
        hint={`${unsigned.length} en attente · ${signed.length} validés. Rien de clinique n'est utilisé pour évaluer une situation sans validation.`}
      >
        <TableShell
          label="Contenus soumis à validation"
          head={
            <>
              <Th>Contenu</Th>
              <Th>Type</Th>
              <Th>Version</Th>
              <Th>État</Th>
              <Th className="text-right">Action</Th>
            </>
          }
          empty={artefacts !== null && artefacts.length === 0}
        >
          {(artefacts ?? []).map((a) => {
            const submission = submissions?.find((s) => s.artefactKind === a.kind && s.artefactId === a.artefactId && s.contentDigest === a.digest);
            return (
              <tr key={`${a.kind}:${a.artefactId}`}>
                <Td>
                  <span className="font-medium text-ink">{a.title}</span>
                  <span className="block text-[12px] text-muted">{a.artefactId}</span>
                </Td>
                <Td>{KIND_FR[a.kind] ?? a.kind}</Td>
                <Td className="tabular-nums">{a.version}</Td>
                <Td>
                  <span className={`tag ${a.approved ? "tag-health" : a.reason === "pending" ? "tag-muted" : "tag-warn"}`}>
                    {REASON_FR[a.reason] ?? a.reason}
                  </span>
                </Td>
                <Td className="text-right">
                  {submission ? (
                    <button type="button" className="btn btn-ghost" onClick={() => void openSubmission(submission.id)}>
                      Examiner
                    </button>
                  ) : canSubmit ? (
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void submit(a)}>
                      Soumettre
                    </button>
                  ) : (
                    <span className="text-[12.5px] text-muted">Non soumis</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </TableShell>
      </Panel>

      {open && (
        <Panel
          title={open.submission.title}
          hint={`${KIND_FR[open.submission.artefactKind] ?? open.submission.artefactKind} · version ${open.submission.artefactVersion} · soumis le ${dateTimeFr(open.submission.submittedAt)}`}
        >
          {open.stale && (
            <Notice tone="warn">
              Le contenu a changé depuis cette soumission. Les signatures ci-dessous ne s&apos;appliquent pas à ce qui serait utilisé aujourd&apos;hui.
            </Notice>
          )}
          {open.submission.changeNote && <p className="mb-3 text-[13.5px] text-ink-2">{open.submission.changeNote}</p>}

          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">Contenu soumis</h3>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Contenu soumis à validation"
                className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-line bg-surface-2 p-3 text-[12px] leading-snug text-ink-2"
              >
                {readable(open.artefact?.content ?? "Contenu introuvable.")}
              </pre>
              <p className="mt-1 text-[11.5px] text-muted">Empreinte : {open.submission.contentDigest.slice(0, 16)}…</p>
            </div>

            <div>
              <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">Quorum</h3>
              <dl className="space-y-1 text-[13px]">
                {Object.entries(open.quorum.bySeat).map(([s, q]) => (
                  <div key={s} className="flex justify-between gap-2">
                    <dt className="text-muted">{SEAT_FR[s] ?? s}</dt>
                    <dd className={`tabular-nums font-medium ${q.approved >= q.required ? "text-health" : "text-ink"}`}>
                      {q.approved} / {q.required}
                    </dd>
                  </div>
                ))}
              </dl>

              <h3 className="mb-1 mt-4 text-[12px] font-bold uppercase tracking-wide text-muted">Signatures</h3>
              {open.signoffs.length === 0 ? (
                <p className="text-[13px] text-muted">Aucune signature pour l&apos;instant.</p>
              ) : (
                <ul className="space-y-1 text-[13px]">
                  {open.signoffs.map((s) => (
                    <li key={s.id} className="rounded-[10px] border border-line bg-white px-3 py-2">
                      <span className="font-medium text-ink">{DECISION_FR[s.decision] ?? s.decision}</span>
                      <span className="text-muted"> — {SEAT_FR[s.seat] ?? s.seat}, {dateTimeFr(s.signedAt)}</span>
                      {s.comment && <span className="mt-0.5 block text-muted">{s.comment}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {mySeats.length === 0 ? (
            <Notice tone="brand">Vous ne siégez à aucun comité : la lecture est possible, la signature ne l&apos;est pas.</Notice>
          ) : (
            <div className="rounded-[14px] border border-line bg-surface-2 p-4">
              <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                <div>
                  <label htmlFor="rb-seat" className="mb-1 block text-[12.5px] font-medium text-ink-2">
                    Je signe au titre de
                  </label>
                  <select id="rb-seat" className={selectClass} value={seat} onChange={(e) => setSeat(e.target.value)}>
                    {mySeats.map((s) => (
                      <option key={s} value={s}>
                        {SEAT_FR[s] ?? s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rb-comment" className="mb-1 block text-[12.5px] font-medium text-ink-2">
                    Commentaire (obligatoire pour un rejet ou une suspension)
                  </label>
                  <textarea id="rb-comment" className={textareaClass} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" disabled={busy || !seat} onClick={() => void sign("approve")}>
                  Valider
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy || !seat || !comment.trim()} onClick={() => void sign("request_changes")}>
                  Demander des modifications
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy || !seat || !comment.trim()} onClick={() => void sign("reject")}>
                  Rejeter
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy || !comment.trim()} onClick={() => void suspendOpen()}>
                  Suspendre immédiatement
                </button>
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Il faut le quorum du comité pour valider. Un seul membre suffit pour suspendre.
              </p>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
