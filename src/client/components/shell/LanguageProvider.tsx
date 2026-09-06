"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { LanguageCode } from "@shared/types";
import { LANG_COOKIE, t as translate, type UiKey } from "@shared/i18n";

interface Ctx {
  lang: LanguageCode;
  setLang: (l: LanguageCode) => void;
  t: (key: UiKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ initial, children }: { initial: LanguageCode; children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(initial);
  const setLang = useCallback((l: LanguageCode) => {
    setLangState(l);
    try {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=${3600 * 24 * 365}; samesite=lax`;
      document.documentElement.lang = l;
      // Persist on the profile when a session exists; ignore failures (anonymous visitors).
      fetch("/api/v1/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: l }) }).catch(() => undefined);
    } catch {
      /* no-op */
    }
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
