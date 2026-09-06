"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES } from "@shared/types";
import { FieldLabel, Notice, inputClass, selectClass } from "../dashboard/Common";

const DOMAINS = [
  { value: "general", label: "Général" },
  { value: "health", label: "Santé" },
  { value: "agriculture", label: "Agriculture" },
  { value: "education", label: "Éducation" },
];

export function LexiconForm({ defaultRegion }: { defaultRegion: string | null }) {
  const router = useRouter();
  const [language, setLanguage] = useState("ln");
  const [term, setTerm] = useState("");
  const [meaningFr, setMeaningFr] = useState("");
  const [domain, setDomain] = useState("general");
  const [region, setRegion] = useState(defaultRegion ?? "");
  const [pronunciation, setPronunciation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/v1/language/lexicon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          term: term.trim(),
          meaningFr: meaningFr.trim(),
          domain,
          region: region.trim() || undefined,
          pronunciation: pronunciation.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de l'ajout (${res.status}).`);
      setDone(`« ${term.trim()} » ajouté au lexique.`);
      setTerm("");
      setMeaningFr("");
      setPronunciation("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'ajout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-5">
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="health">{done}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="lx-lang">Langue</FieldLabel>
          <select id="lx-lang" className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="lx-domain">Domaine</FieldLabel>
          <select id="lx-domain" className={selectClass} value={domain} onChange={(e) => setDomain(e.target.value)}>
            {DOMAINS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="lx-term">Terme local</FieldLabel>
        <input id="lx-term" className={inputClass} required maxLength={160} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Mot ou expression tel qu'il est dit" />
      </div>

      <div>
        <FieldLabel htmlFor="lx-meaning">Sens en français</FieldLabel>
        <input id="lx-meaning" className={inputClass} required maxLength={240} value={meaningFr} onChange={(e) => setMeaningFr(e.target.value)} placeholder="Signification précise" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="lx-region">Région</FieldLabel>
          <input id="lx-region" className={inputClass} maxLength={120} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Province ou territoire" />
        </div>
        <div>
          <FieldLabel htmlFor="lx-pron">Prononciation</FieldLabel>
          <input id="lx-pron" className={inputClass} maxLength={160} value={pronunciation} onChange={(e) => setPronunciation(e.target.value)} placeholder="Indice de prononciation" />
        </div>
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={busy || term.trim().length === 0 || meaningFr.trim().length === 0}>
        {busy ? "Ajout…" : "Ajouter au lexique"}
      </button>
    </form>
  );
}
