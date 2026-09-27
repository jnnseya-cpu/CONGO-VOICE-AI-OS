import "server-only";
import type { LanguageCode } from "@server/db/schema";

/**
 * Which language a message is in, decided without a model.
 *
 * This heuristic lived inside the offline provider, which meant the platform
 * could only use it while a provider was answering — exactly backwards. When
 * every provider is down the platform still has to know enough to read a
 * scripted emergency instruction back in the right language, and that is the
 * moment it had no way to tell which language the message was in.
 *
 * It is a marker count, not a language model: good enough to pick the reviewed
 * script to read aloud, and honest about its confidence so nothing downstream
 * mistakes it for a considered reading.
 */
const LANG_MARKERS: Record<LanguageCode, string[]> = {
  ln: ["mbote", "nazali", "malali", "mwana na ngai", "ngai", "boni", "nalingi", "fièvre te", "bilanga", "koyekola", "mokolo", "moto", "azali", "ya ngai", "nakoki"],
  sw: ["habari", "nina", "homa", "mtoto", "shamba", "mimi", "ninahitaji", "msaada", "mgonjwa", "ninaomba", "wangu", "sasa", "kuhusu", "nataka"],
  kg: ["mono", "kele", "nkento", "mbote na nge", "beto", "kiadi", "bilanga", "nzo", "kimbeefo", "nge"],
  lua: ["ndi", "muana wanyi", "meme", "tshia", "bualu", "mukaji", "disanka", "tshidimu", "wanyi"],
  fr: ["je", "mon", "ma", "enfant", "fièvre", "champ", "manioc", "maïs", "école", "devoir", "bonjour", "comment"],
};

export interface OfflineLanguageReading {
  language: LanguageCode;
  confidence: number;
  mixed: LanguageCode[];
  /** FR-LG-01: the runner-up, so a near-tie is confirmed rather than guessed. */
  alternative: { language: LanguageCode; confidence: number } | null;
}

export function detectLanguageOffline(text: string): OfflineLanguageReading {
  const t = ` ${text.toLowerCase()} `;
  const scores = (Object.keys(LANG_MARKERS) as LanguageCode[]).map((lang) => ({
    lang,
    score: LANG_MARKERS[lang].filter((m) => t.includes(` ${m} `) || t.includes(` ${m}`)).length,
  }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const confidenceOf = (score: number) => Math.min(0.95, 0.5 + score * 0.12);
  if (!best || best.score === 0) return { language: "fr", confidence: 0.4, mixed: [], alternative: null };
  const runnerUp = scores[1] && scores[1].score > 0 ? { language: scores[1].lang, confidence: confidenceOf(scores[1].score) } : null;
  const mixed = scores.slice(1).filter((s) => s.score > 0).map((s) => s.lang);
  return { language: best.lang, confidence: confidenceOf(best.score), mixed, alternative: runnerUp };
}

/** The per-language marker lists, for the span splitter in the offline provider. */
export { LANG_MARKERS };
