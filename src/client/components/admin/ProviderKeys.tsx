"use client";
import { useCallback, useEffect, useState } from "react";
import { FieldLabel, Notice, Panel, dateTimeFr, inputClass } from "../dashboard/Common";

/**
 * Where an administrator wires the vendors.
 *
 * The page shows, per credential, whether it is set and where it comes from —
 * never the value. A secret is displayed as its last four characters, because
 * that is enough to tell "the key I pasted" from "some other key" and useless to
 * anyone reading over a shoulder.
 */

type Group = "ai" | "sms" | "voice" | "whatsapp" | "routing";

interface Credential {
  name: string;
  group: Group;
  label: string;
  purpose: string;
  secret: boolean;
  /** Present when the value is one of a short list, e.g. which SMS operator to use. */
  options?: readonly string[];
  source: "console" | "deployment" | "none";
  hint: string | null;
  updatedAt: string | null;
}

interface Payload {
  credentials: Credential[];
  active: { llm: string[]; stt: string[]; tts: string[]; offlineMode: boolean; refusedByResidency: string[] };
  note: string;
}

const GROUPS: Array<{ id: Group; title: string; hint: string }> = [
  { id: "ai", title: "Intelligence artificielle", hint: "Sans aucune de ces clés, la plateforme continue de fonctionner sur ses règles hors ligne : les signes de danger, les protocoles et les scripts d'urgence ne dépendent d'aucun fournisseur." },
  { id: "sms", title: "SMS et USSD", hint: "Nécessaire pour qu'une escalade atteigne réellement un agent, et pour que la réponse d'une session USSD arrive par SMS." },
  { id: "voice", title: "Serveur vocal", hint: "Appels entrants et rappels sortants. Le jeton sert aussi à vérifier la signature des appels entrants." },
  { id: "whatsapp", title: "WhatsApp", hint: "Messages entrants et sortants sur le canal le plus utilisé en ville." },
  {
    id: "routing",
    title: "Routage des canaux",
    hint:
      "Chaque canal demande deux choses avant d'envoyer : quel opérateur, et ses identifiants. Tant que l'opérateur reste « log », le message est écrit dans le journal au lieu d'être envoyé — même si la clé est enregistrée ci-dessus.",
  },
];

const SOURCE_FR: Record<Credential["source"], { text: string; tone: string }> = {
  console: { text: "définie ici", tone: "bg-ok-soft text-ok" },
  deployment: { text: "définie par le déploiement", tone: "bg-brand-soft text-brand" },
  none: { text: "absente", tone: "bg-surface-2 text-muted" },
};

async function load(): Promise<Payload> {
  const res = await fetch("/api/v1/admin/providers");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message ?? "Clés indisponibles.");
  return payload as Payload;
}

export function ProviderKeys() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      load()
        .then((p) => {
          setData(p);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Clés indisponibles.")),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((p) => !cancelled && setData(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Clés indisponibles."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(name: string) {
    const value = (drafts[name] ?? "").trim();
    if (!value) return;
    setBusy(name);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/v1/admin/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, value }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error?.message ?? "Enregistrement refusé.");
      setDrafts((d) => ({ ...d, [name]: "" }));
      setDone(`${name} enregistrée.`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Enregistrement refusé.");
    } finally {
      setBusy(null);
    }
  }

  async function clear(name: string) {
    setBusy(name);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/v1/admin/providers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error?.message ?? "Retrait refusé.");
      setDone(`${name} retirée. La valeur du déploiement s'applique de nouveau si elle existe.`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Retrait refusé.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Clés des fournisseurs" hint="Intelligence artificielle, SMS, voix et WhatsApp. Une clé saisie ici est chiffrée et n'est jamais réaffichée.">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="brand">{done}</Notice> : null}

      {data === null && !error ? <p className="px-5 py-4 text-[13.5px] text-muted">Chargement…</p> : null}

      {data ? (
        <div className="space-y-5 px-5 pb-5">
          <div className="rounded-[10px] bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            <p>{data.note}</p>
            <p className="mt-2">
              Actuellement utilisé — compréhension&nbsp;: <strong>{data.active.llm.join(", ") || "aucun"}</strong> · transcription&nbsp;:{" "}
              <strong>{data.active.stt.join(", ") || "aucune"}</strong> · voix&nbsp;: <strong>{data.active.tts.join(", ") || "voix du téléphone"}</strong>
              {data.active.offlineMode ? " · mode hors ligne : la plateforme répond sur ses règles, sans aucun fournisseur." : null}
            </p>
            {data.active.refusedByResidency.length > 0 ? (
              <p className="mt-2 text-warn">
                Refusé par la politique de résidence des données&nbsp;: {data.active.refusedByResidency.join(", ")}. La clé est définie mais ne sera pas utilisée.
              </p>
            ) : null}
          </div>

          {GROUPS.map((group) => {
            const rows = data.credentials.filter((c) => c.group === group.id);
            if (rows.length === 0) return null;
            return (
              <section key={group.id}>
                <h3 className="text-[14px] font-semibold text-ink">{group.title}</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{group.hint}</p>
                <ul className="mt-3 space-y-3">
                  {rows.map((row) => {
                    const source = SOURCE_FR[row.source];
                    return (
                      <li key={row.name} className="rounded-[10px] border border-line p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-semibold text-ink">{row.label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${source.tone}`}>{source.text}</span>
                          {row.hint ? <span className="font-mono text-[12px] text-muted">{row.hint}</span> : null}
                          {row.updatedAt ? <span className="text-[11.5px] text-muted-2">{dateTimeFr(row.updatedAt)}</span> : null}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{row.purpose}</p>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <div className="min-w-[240px] flex-1">
                            <FieldLabel htmlFor={`cred-${row.name}`}>{row.options ? "Opérateur" : row.secret ? "Nouvelle valeur (non réaffichée)" : "Valeur"}</FieldLabel>
                            {row.options ? (
                              /* A closed list, so a misspelling cannot become an
                                 alert channel that silently writes to the log. */
                              <select
                                id={`cred-${row.name}`}
                                className={inputClass}
                                value={drafts[row.name] ?? ""}
                                onChange={(e) => setDrafts((d) => ({ ...d, [row.name]: e.target.value }))}
                              >
                                <option value="">Choisir…</option>
                                {row.options.map((o) => (
                                  <option key={o} value={o}>
                                    {o === "log" ? "log — ne pas envoyer, journaliser seulement" : o}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                id={`cred-${row.name}`}
                                className={inputClass}
                                type={row.secret ? "password" : "text"}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={row.secret ? "Collez la clé" : "Saisissez la valeur"}
                                value={drafts[row.name] ?? ""}
                                onChange={(e) => setDrafts((d) => ({ ...d, [row.name]: e.target.value }))}
                              />
                            )}
                          </div>
                          <button type="button" className="btn btn-primary" disabled={busy === row.name || !(drafts[row.name] ?? "").trim()} onClick={() => save(row.name)}>
                            {busy === row.name ? "…" : "Enregistrer"}
                          </button>
                          {row.source === "console" ? (
                            <button type="button" className="btn btn-ghost" disabled={busy === row.name} onClick={() => clear(row.name)}>
                              Retirer
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <p className="text-[12.5px] leading-relaxed text-muted">
            Ne sont pas gérés ici, et ne doivent pas l&apos;être&nbsp;: la clé de chiffrement des données, le secret de session, le secret du planificateur, les jetons
            d&apos;amorçage et de récupération, et le secret du fournisseur d&apos;identité. Chacun protège cette console elle-même et se change dans le déploiement.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
