"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES, PROVINCES } from "@shared/types";
import { useLanguage } from "./LanguageProvider";
import { Logo } from "./Logo";
import { IconSpinner } from "../icons";

export function LoginForm({ next }: { next: string }) {
  const { t, lang, setLang } = useLanguage();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [province, setProvince] = useState("Kinshasa");
  const [busy, setBusy] = useState<"login" | "anon" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: Record<string, unknown>, kind: "login" | "anon") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Erreur");
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="bg-navy px-6 py-6">
        <Logo />
        <p className="mt-3 text-[13px] text-white/75">{t("tagline")}</p>
      </div>
      <form
        className="space-y-4 px-6 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit({ phone, pin }, "login");
        }}
      >
        <h1 className="text-lg font-bold">{t("login")}</h1>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-2">{t("phone")}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+243 …" inputMode="tel" autoComplete="tel" className="h-11 w-full rounded-lg border border-line-strong px-3 outline-none focus:border-brand-2 focus:ring-4 focus:ring-brand-soft" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink-2">{t("pin")}</span>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" className="h-11 w-full rounded-lg border border-line-strong px-3 outline-none focus:border-brand-2 focus:ring-4 focus:ring-brand-soft" />
        </label>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy !== null} className="btn btn-primary h-11 w-full">
          {busy === "login" ? <IconSpinner size={18} /> : null} {t("login")}
        </button>
        <div className="relative py-1 text-center text-xs text-muted">
          <span className="relative z-10 bg-white px-2">{t("citizen")}</span>
          <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="h-11 rounded-lg border border-line-strong bg-white px-3 text-sm">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-white px-3 text-sm">
            {PROVINCES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => submit({ anonymous: true, language: lang, province, consent: true }, "anon")} className="btn btn-ghost h-11 w-full">
          {busy === "anon" ? <IconSpinner size={18} /> : null} {t("continueAsCitizen")}
        </button>
        <p className="text-[11.5px] leading-relaxed text-muted">{t("privacyNote")}</p>
      </form>
    </div>
  );
}
