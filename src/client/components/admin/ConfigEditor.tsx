"use client";
import { useCallback, useEffect, useState } from "react";
import { FieldLabel, Notice, Panel, dateTimeFr, inputClass, textareaClass } from "../dashboard/Common";

interface ConfigRow {
  key: string;
  value: unknown;
  description?: string | null;
  updatedAt?: string | null;
}

async function fetchConfig(): Promise<ConfigRow[]> {
  const res = await fetch("/api/v1/admin/config");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message ?? "Configuration indisponible.");
  return (payload.config ?? []) as ConfigRow[];
}

export function ConfigEditor() {
  const [rows, setRows] = useState<ConfigRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetchConfig()
        .then(setRows)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Configuration indisponible.")),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchConfig()
      .then((r) => !cancelled && setRows(r))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Configuration indisponible."));
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(row: ConfigRow) {
    setKey(row.key);
    setValue(JSON.stringify(row.value ?? null, null, 2));
    setDone(null);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    let parsed: unknown;
    try {
      parsed = value.trim() === "" ? null : JSON.parse(value);
    } catch {
      setError("La valeur doit être du JSON valide (nombre, texte entre guillemets, objet ou liste).");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim(), value: parsed }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error?.message ?? "Échec de l'enregistrement.");
      setDone(`Clé « ${key.trim()} » enregistrée.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Configuration d'exécution" hint="Seuils, indicateurs et messages modifiables sans redéploiement. Chaque modification est auditée.">
      <div className="divide-y divide-line">
        <div className="max-h-[320px] overflow-y-auto">
          {rows === null && <p className="px-5 py-5 text-[13px] text-muted">Chargement…</p>}
          {rows?.length === 0 && <p className="px-5 py-5 text-[13px] text-muted">Aucune clé de configuration enregistrée.</p>}
          <ul className="divide-y divide-line">
            {rows?.map((r) => (
              <li key={r.key} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[12.5px] font-semibold text-ink">{r.key}</div>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[12px] leading-snug text-muted">{JSON.stringify(r.value)}</pre>
                  {r.updatedAt && <div className="mt-0.5 text-[11px] text-muted-2">Modifiée le {dateTimeFr(r.updatedAt)}</div>}
                </div>
                <button type="button" className="btn btn-ghost h-8 shrink-0 px-3 text-[12.5px]" onClick={() => edit(r)}>
                  Modifier
                </button>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={save} className="space-y-3 p-5">
          {error && <Notice tone="danger">{error}</Notice>}
          {done && <Notice tone="health">{done}</Notice>}
          <div>
            <FieldLabel htmlFor="cfg-key">Clé</FieldLabel>
            <input id="cfg-key" className={`${inputClass} font-mono`} value={key} onChange={(e) => setKey(e.target.value)} placeholder="ex. risk.low_confidence_threshold" maxLength={96} required />
          </div>
          <div>
            <FieldLabel htmlFor="cfg-value">Valeur (JSON)</FieldLabel>
            <textarea id="cfg-value" className={`${textareaClass} font-mono`} rows={5} value={value} onChange={(e) => setValue(e.target.value)} placeholder={'0.55  ·  "texte"  ·  { "actif": true }'} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy || key.trim().length === 0}>
            {busy ? "Enregistrement…" : "Enregistrer la clé"}
          </button>
        </form>
      </div>
    </Panel>
  );
}
