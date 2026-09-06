import type { LanguageCode } from "../types";
import { t } from "./index";

export function timeAgo(date: Date | string, lang: LanguageCode, now = Date.now()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.max(0, now - d.getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return t(lang, "justNow");
  if (min < 60) return t(lang, "ago_min", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t(lang, "ago_hour", { n: h });
  return t(lang, "ago_day", { n: Math.round(h / 24) });
}

export function formatNumber(n: number, lang: LanguageCode = "fr"): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "fr-FR").format(n);
}
