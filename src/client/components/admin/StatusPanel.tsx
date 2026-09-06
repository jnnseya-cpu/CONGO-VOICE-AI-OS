"use client";
import { useEffect, useState } from "react";
import { Notice, Panel } from "../dashboard/Common";

interface Status {
  ai: { llm: string[]; stt: string[]; tts: string[]; offlineMode: boolean };
  database: string;
  storage: string;
  notifications: { sms: string; whatsapp: string; email: string };
  version: string;
}

const ROW_LABEL: Record<string, string> = {
  llm: "Compréhension et rédaction",
  stt: "Transcription de la parole",
  tts: "Synthèse vocale",
};

export function StatusPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/status")
      .then(async (r) => {
        const payload = await r.json();
        if (!r.ok) throw new Error(payload?.error?.message ?? "Statut indisponible.");
        if (!cancelled) setStatus(payload as Status);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Statut indisponible."));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel title="État de la plateforme" hint="Chaînes de traitement actives, base de données et stockage.">
      <div className="space-y-3 p-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {!status && !error && <p className="text-[13px] text-muted">Chargement…</p>}
        {status && (
          <>
            {status.ai.offlineMode && <Notice tone="warn">Mode hors ligne : la plateforme fonctionne avec le moteur interne de secours, sans service externe.</Notice>}
            <ul className="divide-y divide-line rounded-xl border border-line">
              {(["llm", "stt", "tts"] as const).map((k) => (
                <li key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-[13px] text-ink-2">{ROW_LABEL[k]}</span>
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {status.ai[k].length === 0 && <span className="tag tag-danger">Aucune chaîne</span>}
                    {status.ai[k].map((p, i) => (
                      <span key={p} className={`tag ${i === 0 ? "tag-health" : "tag-muted"}`}>
                        {p}
                        {i === 0 ? " · principal" : " · secours"}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-ink-2">Base de données</span>
                <span className="tag tag-case">{status.database === "postgresql" ? "PostgreSQL géré" : "Embarquée"}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-ink-2">Stockage des fichiers</span>
                <span className="tag tag-case">{status.storage}</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-ink-2">Notifications</span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  <span className="tag tag-muted">SMS : {status.notifications.sms}</span>
                  <span className="tag tag-muted">WhatsApp : {status.notifications.whatsapp}</span>
                  <span className="tag tag-muted">E-mail : {status.notifications.email}</span>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-ink-2">Version</span>
                <span className="text-[13px] font-semibold text-ink">{status.version}</span>
              </li>
            </ul>
            <p className="text-[11.5px] leading-snug text-muted">Seules les clés internes des chaînes de traitement sont affichées : aucun nom de fournisseur, aucune clé d&apos;accès ne quitte le serveur.</p>
          </>
        )}
      </div>
    </Panel>
  );
}
