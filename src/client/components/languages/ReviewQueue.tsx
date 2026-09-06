"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@shared/types";
import { useLanguage } from "../shell/LanguageProvider";
import { FieldLabel, LANGUAGE_FR, MODULE_FR, Notice, filterSelectClass, inputClass, selectClass, textareaClass } from "../dashboard/Common";
import { IconVolume } from "../icons";

interface Sample {
  id: string;
  language: string;
  sourceText: string;
  translationFr: string | null;
  province: string | null;
  intent: string | null;
  module: string;
  systemConfidence: number | null;
  citizenFlagged: boolean;
  audioFileId: string | null;
  createdAt: string;
}

async function fetchSamples(language: string): Promise<Sample[]> {
  const res = await fetch(`/api/v1/language/samples?limit=25${language ? `&language=${language}` : ""}`);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload?.error?.message ?? "File de relecture indisponible.");
  return payload.samples as Sample[];
}

export function ReviewQueue() {
  const router = useRouter();
  const { t } = useLanguage();
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [language, setLanguage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [translation, setTranslation] = useState("");
  const [correctedLanguage, setCorrectedLanguage] = useState("");
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");

  const load = useCallback(() => {
    fetchSamples(language)
      .then((rows) => {
        setSamples(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "File de relecture indisponible.");
        setSamples([]);
      });
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    fetchSamples(language)
      .then((rows) => {
        if (!cancelled) {
          setSamples(rows);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "File de relecture indisponible.");
          setSamples([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  function startEdit(s: Sample) {
    setEditing(s.id);
    setSource(s.sourceText);
    setTranslation(s.translationFr ?? "");
    setCorrectedLanguage(s.language);
    setTerm("");
    setMeaning("");
  }

  async function review(id: string, status: "verified" | "corrected" | "rejected") {
    setBusy(id);
    setError(null);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "corrected") {
        body.correctedSourceText = source.trim();
        body.correctedTranslationFr = translation.trim();
        if (correctedLanguage) body.correctedLanguage = correctedLanguage;
        if (term.trim() && meaning.trim()) body.lexicon = [{ term: term.trim(), meaningFr: meaning.trim() }];
      }
      const res = await fetch(`/api/v1/language/samples/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? "Échec de l'enregistrement.");
      setSamples((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <select aria-label="Langue" className={`${filterSelectClass} min-w-[180px]`} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">{t("allLanguages")}</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost h-10" onClick={load}>
          {t("refresh")}
        </button>
        <span className="ml-auto text-[12.5px] text-muted">{samples?.length ?? 0} {t("pendingSamples")}</span>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <ul className="divide-y divide-line">
        {samples === null && <li className="px-5 py-8 text-center text-[13px] text-muted">{t("loading")}</li>}
        {samples?.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-muted">Aucun échantillon en attente de relecture. Merci !</li>}
        {samples?.map((s) => (
          <li key={s.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tag tag-case">{LANGUAGE_FR[s.language] ?? s.language}</span>
              <span className="tag tag-muted">{MODULE_FR[s.module] ?? s.module}</span>
              {s.citizenFlagged && <span className="tag tag-danger">Signalé par le citoyen</span>}
              {s.systemConfidence !== null && <span className="tag tag-warn">Confiance {Math.round(s.systemConfidence * 100)} %</span>}
              <span className="ml-auto text-[11.5px] text-muted-2">{new Date(s.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            {s.audioFileId && (
              <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-ink-2">
                  <IconVolume size={15} /> Enregistrement
                </div>
                <audio controls preload="none" className="w-full" src={`/api/v1/files/${s.audioFileId}`} />
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Ce que le système a entendu</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{s.sourceText}</p>
              </div>
              <div>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Sens en français</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{s.translationFr ?? "—"}</p>
              </div>
            </div>

            {editing === s.id ? (
              <div className="mt-3 space-y-3 rounded-xl border border-line p-4">
                <div>
                  <FieldLabel htmlFor={`src-${s.id}`}>Texte corrigé</FieldLabel>
                  <textarea id={`src-${s.id}`} className={textareaClass} rows={2} value={source} onChange={(e) => setSource(e.target.value)} />
                </div>
                <div>
                  <FieldLabel htmlFor={`tr-${s.id}`}>Traduction française corrigée</FieldLabel>
                  <textarea id={`tr-${s.id}`} className={textareaClass} rows={2} value={translation} onChange={(e) => setTranslation(e.target.value)} />
                </div>
                <div>
                  <FieldLabel htmlFor={`lg-${s.id}`}>Langue réelle</FieldLabel>
                  <select id={`lg-${s.id}`} className={selectClass} value={correctedLanguage} onChange={(e) => setCorrectedLanguage(e.target.value)}>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={`tm-${s.id}`}>Terme local (facultatif)</FieldLabel>
                    <input id={`tm-${s.id}`} className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Mot ou expression" />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`mn-${s.id}`}>Sens en français</FieldLabel>
                    <input id={`mn-${s.id}`} className={inputClass} value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Signification" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" disabled={busy === s.id || source.trim().length === 0} onClick={() => review(s.id, "corrected")}>
                    {busy === s.id ? "…" : "Enregistrer la correction"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary h-9 px-3 text-[12.5px]" disabled={busy === s.id} onClick={() => review(s.id, "verified")}>
                  {t("verify")}
                </button>
                <button type="button" className="btn btn-ghost h-9 px-3 text-[12.5px]" onClick={() => startEdit(s)}>
                  {t("correct")}
                </button>
                <button type="button" className="btn btn-ghost h-9 border-danger px-3 text-[12.5px] text-danger" disabled={busy === s.id} onClick={() => review(s.id, "rejected")}>
                  {t("reject")}
                </button>
                {s.province && <span className="self-center text-[12px] text-muted">{s.province}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
