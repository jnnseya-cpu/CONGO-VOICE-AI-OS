"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROVINCES } from "@shared/types";
import { FieldLabel, Notice, inputClass, selectClass, textareaClass } from "../dashboard/Common";

const MODULES = [
  { value: "health", label: "Santé" },
  { value: "agriculture", label: "Agriculture" },
  { value: "education", label: "Éducation" },
  { value: "general", label: "Général" },
];

const SEVERITIES = [
  { value: "low", label: "Faible — information" },
  { value: "medium", label: "Modéré — à traiter sous 24 h" },
  { value: "high", label: "Élevé — à traiter aujourd'hui" },
  { value: "critical", label: "Critique — prise en charge immédiate" },
];

export function NewCaseForm({ modules, defaultProvince, citizen = false }: { modules: string[]; defaultProvince: string | null; citizen?: boolean }) {
  const router = useRouter();
  const [module, setModule] = useState(modules[0] ?? "general");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState(citizen ? "medium" : "medium");
  const [province, setProvince] = useState(defaultProvince ?? "");
  const [notes, setNotes] = useState("");
  const [escalate, setEscalate] = useState(citizen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = MODULES.filter((m) => modules.includes(m.value));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, title: title.trim(), severity, province: province || undefined, notes: notes.trim() || undefined, escalate }),
      });
      const payload = (await res.json().catch(() => null)) as { case?: { id: string }; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de la création (${res.status}).`);
      if (payload?.case?.id) router.push(`/cas/${payload.case.id}`);
      else router.push("/cas");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {error && <Notice tone="danger">{error}</Notice>}

      {options.length > 1 && (
        <div>
          <FieldLabel htmlFor="nc-module">Module</FieldLabel>
          <select id="nc-module" className={selectClass} value={module} onChange={(e) => setModule(e.target.value)}>
            {options.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <FieldLabel htmlFor="nc-title">{citizen ? "Votre demande en une phrase" : "Intitulé du cas"}</FieldLabel>
        <input id="nc-title" className={inputClass} required minLength={3} maxLength={240} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={citizen ? "Ex. Je souhaite parler à un agent de santé au sujet de mon enfant" : "Ex. Enfant de 3 ans, fièvre depuis 4 jours — Kimbanseke"} />
      </div>

      {!citizen && (
        <div>
          <FieldLabel htmlFor="nc-severity">Gravité</FieldLabel>
          <select id="nc-severity" className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] text-muted">La gravité fixe l&apos;horloge de prise en charge : 15 min (critique), 4 h (élevé), 24 h (modéré).</p>
        </div>
      )}

      <div>
        <FieldLabel htmlFor="nc-province">Province</FieldLabel>
        <select id="nc-province" className={selectClass} value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">Non renseignée</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel htmlFor="nc-notes">{citizen ? "Précisions (facultatif)" : "Contexte et observations"}</FieldLabel>
        <textarea id="nc-notes" className={textareaClass} rows={5} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={citizen ? "Dites en quelques mots ce dont vous voulez parler." : "Éléments recueillis lors de l'appel ou de la visite, personnes présentes, actions déjà menées."} />
      </div>

      {!citizen && (
        <label className="flex items-start gap-2.5 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
          <span className="text-[13px] leading-snug text-ink-2">
            Escalader immédiatement vers le superviseur
            <span className="block text-[11.5px] text-muted">À cocher lorsqu&apos;une intervention dépasse votre périmètre.</span>
          </span>
        </label>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy || title.trim().length < 3}>
        {busy ? "Envoi…" : citizen ? "Demander à être rappelé" : "Créer le cas"}
      </button>
    </form>
  );
}
