"use client";
import { useEffect, useState } from "react";
import { Notice } from "../dashboard/Common";

/**
 * Data rights: access and erasure requests. The endpoint is optional on this
 * instance — when it is absent the controls are hidden and the offline
 * procedure is shown instead.
 */
export function DataRights() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/data-requests", { method: "OPTIONS" })
      .then((r) => !cancelled && setAvailable(r.status !== 404))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function request(type: "access" | "erasure") {
    setBusy(type);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, method: "button" }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de la demande (${res.status}).`);
      setMessage(type === "access" ? "Demande d'accès enregistrée : vous recevrez vos données dans les délais légaux." : "Demande d'effacement enregistrée : elle sera traitée par le responsable des données.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la demande.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 p-5 text-[13.5px] leading-relaxed text-ink-2">
      <p>
        Vous pouvez à tout moment demander une copie de vos données ou leur effacement. Les enregistrements liés à un cas encore ouvert sont conservés jusqu&apos;à sa clôture, pour votre sécurité.
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="health">{message}</Notice>}
      {available === null && <p className="text-[12.5px] text-muted">Vérification du service…</p>}
      {available === true && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => request("access")}>
            {busy === "access" ? "…" : "Demander une copie de mes données"}
          </button>
          <button type="button" className="btn btn-ghost border-danger text-danger" disabled={busy !== null} onClick={() => request("erasure")}>
            {busy === "erasure" ? "…" : "Demander l'effacement"}
          </button>
        </div>
      )}
      {available === false && (
        <Notice tone="brand">
          Les demandes en ligne ne sont pas encore activées sur cette instance. Adressez votre demande à l&apos;agent qui vous suit ou au centre d&apos;appel national : elle sera enregistrée et traitée dans les mêmes délais.
        </Notice>
      )}
    </div>
  );
}
