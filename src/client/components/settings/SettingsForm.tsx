"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { LANGUAGES, PROVINCES } from "@shared/types";
import { useLanguage } from "../shell/LanguageProvider";
import { FieldLabel, Notice, inputClass, selectClass } from "../dashboard/Common";

const PRIVATE_MODE_KEY = "cvai_private_mode";
const PRIVATE_MODE_EVENT = "cvai:private-mode";

/** Per-device preference: read through an external store so the render stays pure. */
function subscribePrivateMode(onChange: () => void) {
  window.addEventListener(PRIVATE_MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PRIVATE_MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readPrivateMode(): boolean {
  try {
    return window.localStorage.getItem(PRIVATE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export interface ProfileValues {
  name: string;
  language: string;
  province: string;
  territory: string;
  consent: boolean;
}

export function SettingsForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const privateMode = useSyncExternalStore(subscribePrivateMode, readPrivateMode, () => false);

  const togglePrivate = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(PRIVATE_MODE_KEY, next ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
    window.dispatchEvent(new Event(PRIVATE_MODE_EVENT));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/v1/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim() || undefined,
          language: values.language,
          province: values.province || undefined,
          territory: values.territory.trim() || undefined,
          consent: values.consent,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(payload?.error?.message ?? `Échec de l'enregistrement (${res.status}).`);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="health">{t("preferencesSaved")}</Notice>}

      <div>
        <FieldLabel htmlFor="st-name">Nom affiché</FieldLabel>
        <input id="st-name" className={inputClass} maxLength={160} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="Comment souhaitez-vous être appelé ?" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="st-lang">Langue préférée</FieldLabel>
          <select id="st-lang" className={selectClass} value={values.language} onChange={(e) => setValues({ ...values, language: e.target.value })}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="st-province">Province</FieldLabel>
          <select id="st-province" className={selectClass} value={values.province} onChange={(e) => setValues({ ...values, province: e.target.value })}>
            <option value="">Non renseignée</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="st-territory">Territoire ou commune</FieldLabel>
        <input id="st-territory" className={inputClass} maxLength={120} value={values.territory} onChange={(e) => setValues({ ...values, territory: e.target.value })} placeholder="Ex. Kimbanseke" />
        <p className="mt-1 text-[11.5px] text-muted">Sert à vous orienter vers le centre de santé ou l&apos;agent le plus proche.</p>
      </div>

      <label className="flex items-start gap-2.5 rounded-xl border border-line p-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]" checked={values.consent} onChange={(e) => setValues({ ...values, consent: e.target.checked })} />
        <span className="text-[13px] leading-snug text-ink-2">
          J&apos;accepte que mes échanges soient enregistrés et utilisés pour me suivre et améliorer le service
          <span className="block text-[11.5px] text-muted">Sans ce consentement, aucun agent ne peut vous rappeler et votre historique n&apos;est pas conservé.</span>
        </span>
      </label>

      <label className="flex items-start gap-2.5 rounded-xl border border-line p-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--brand)]" checked={privateMode} onChange={(e) => togglePrivate(e.target.checked)} />
        <span className="text-[13px] leading-snug text-ink-2">
          {t("privateMode")}
          <span className="block text-[11.5px] text-muted">
            Masque le contenu des conversations dans les listes de cet appareil. Ce réglage reste sur ce téléphone ou cet ordinateur et n&apos;est pas envoyé au serveur.
          </span>
        </span>
      </label>

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "…" : t("savePreferences")}
      </button>
    </form>
  );
}
