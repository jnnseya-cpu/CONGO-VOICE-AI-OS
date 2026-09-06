"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FieldLabel, Notice, inputClass, selectClass } from "../dashboard/Common";

export interface ReportOption {
  type: string;
  name: string;
  cadence: string;
  windowDays: number;
  defaultFormat: string;
}

const FORMATS = [
  { value: "pdf", label: "PDF — document imprimable" },
  { value: "xlsx", label: "Excel (XLSX) — tableau de données" },
  { value: "csv", label: "CSV — données brutes" },
];

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export function ReportRequestForm({ options }: { options: ReportOption[] }) {
  const router = useRouter();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [type, setType] = useState(options[0]?.type ?? "");
  const [format, setFormat] = useState(options[0]?.defaultFormat ?? "pdf");
  const [from, setFrom] = useState(isoDaysAgo(options[0]?.windowDays ?? 30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/report-jobs", { method: "OPTIONS" })
      .then((r) => !cancelled && setAvailable(r.status !== 404))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function pickType(next: string) {
    setType(next);
    const meta = options.find((o) => o.type === next);
    if (meta) {
      setFormat(meta.defaultFormat);
      setFrom(isoDaysAgo(meta.windowDays));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/v1/report-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format, period: { from: new Date(from).toISOString(), to: new Date(to).toISOString() } }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de la demande (${res.status}).`);
      setDone("Demande enregistrée : le rapport apparaîtra dans la liste ci-dessous dès qu'il sera prêt.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la demande.");
    } finally {
      setBusy(false);
    }
  }

  if (available === null) return <div className="p-5 text-[13px] text-muted">Vérification du service de génération…</div>;

  if (!available)
    return (
      <div className="p-5">
        <Notice tone="warn">
          Le service de génération de rapports (PDF, Excel) n&apos;est pas activé sur cette instance. Les exports CSV ci-dessus restent disponibles immédiatement.
        </Notice>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="health">{done}</Notice>}
      <div>
        <FieldLabel htmlFor="rp-type">Type de rapport</FieldLabel>
        <select id="rp-type" className={selectClass} value={type} onChange={(e) => pickType(e.target.value)}>
          {options.map((o) => (
            <option key={o.type} value={o.type}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel htmlFor="rp-format">Format</FieldLabel>
        <select id="rp-format" className={selectClass} value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="rp-from">Du</FieldLabel>
          <input id="rp-from" type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="rp-to">Au</FieldLabel>
          <input id="rp-to" type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Envoi…" : "Demander le rapport"}
      </button>
      <p className="text-[11.5px] leading-snug text-muted">
        Chaque rapport produit est horodaté, tracé au journal d&apos;audit et expire au bout de sept jours.
      </p>
    </form>
  );
}
