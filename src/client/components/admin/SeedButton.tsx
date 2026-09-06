"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "../dashboard/Common";

export function SeedButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/seed", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) throw new Error((payload as { error?: { message?: string } } | null)?.error?.message ?? `Échec du chargement (${res.status}).`);
      const counts = payload && typeof payload === "object" ? Object.entries(payload).filter(([, v]) => typeof v === "number") : [];
      setMessage(counts.length ? `Données de démonstration chargées : ${counts.map(([k, v]) => `${k} ${v}`).join(" · ")}.` : "Données de démonstration chargées.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du chargement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-5">
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="health">{message}</Notice>}
      <p className="text-[13px] leading-relaxed text-ink-2">
        Charge le jeu de données de démonstration (comptes, interactions, cas, référentiels) dans une base vide. Sans effet si les données sont déjà présentes.
      </p>
      <button type="button" className="btn btn-ghost w-full" onClick={run} disabled={busy}>
        {busy ? "Chargement…" : "Charger les données de démonstration"}
      </button>
    </div>
  );
}
