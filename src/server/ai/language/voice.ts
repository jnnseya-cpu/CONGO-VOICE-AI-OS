/**
 * How a written answer becomes something a person can follow by ear.
 *
 * Reading aloud is not the same as displaying. A clause that scans fine on a
 * screen becomes unfollowable at 2G quality on a loudspeaker in a courtyard, and
 * a digit read as a digit ("3") is heard reliably only when it is spoken as a
 * word ("trois"). These are the rules from FR-LG-06 and the 25-second reply
 * limit of FR-CH-04, applied to the text before it reaches text-to-speech.
 */
import type { LanguageCode } from "@server/db/schema";

/** Longest sentence a listener can hold, in words (FR-LG-06). */
export const MAX_SPOKEN_SENTENCE_WORDS = 15;

/** Longest single reply, in seconds, before it is offered in parts (FR-CH-04). */
export const MAX_SPOKEN_SECONDS = 25;

/** Words per second of synthesised speech, used to estimate length. */
const WORDS_PER_SECOND = 2.5;

const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS: Record<number, string> = { 20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante", 70: "soixante", 80: "quatre-vingt", 90: "quatre-vingt" };

function underHundred(n: number): string {
  if (n < 17) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const tensDigit = Math.floor(n / 10) * 10;
  const unit = n % 10;
  if (tensDigit === 70 || tensDigit === 90) {
    const base = tensDigit === 70 ? "soixante" : "quatre-vingt";
    return `${base}-${underHundred(10 + unit)}`;
  }
  const base = TENS[tensDigit];
  if (unit === 0) return tensDigit === 80 ? "quatre-vingts" : base;
  if (unit === 1 && tensDigit !== 80) return `${base} et un`;
  return `${base}-${UNITS[unit]}`;
}

function underThousand(n: number): string {
  if (n < 100) return underHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent${rest === 0 ? "s" : ""}`;
  return rest === 0 ? head : `${head} ${underHundred(rest)}`;
}

/** French cardinal for 0–999 999. Beyond that the digits are left alone. */
export function frenchNumberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n);
  if (n < 1000) return underThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 1 ? "mille" : `${underThousand(thousands)} mille`;
  return rest === 0 ? head : `${head} ${underThousand(rest)}`;
}

/**
 * Speaks numbers as words, and only where that helps.
 *
 * A case reference, a phone number and a year are left as they are: spelling
 * out "deux mille vingt-six" for a year, or turning a reference into a sentence,
 * makes the answer harder to use, not easier.
 */
export function numeralsAsWords(text: string, language: LanguageCode = "fr"): string {
  if (language !== "fr") return text;
  return text.replace(/(^|[^\w#+/-])(\d{1,4})(?![\w.,]*\d)(?![%°])/g, (whole, before: string, digits: string) => {
    const n = Number(digits);
    // Years and anything with a leading zero (a code, not a count) stay numeric.
    if (digits.length === 4 && n >= 1900 && n <= 2999) return whole;
    if (digits.length > 1 && digits.startsWith("0")) return whole;
    return `${before}${frenchNumberToWords(n)}`;
  });
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

/**
 * Breaks a long sentence only where a speaker would pause anyway: a semicolon, a
 * colon, or a comma before a conjunction.
 *
 * A sentence with no such seam is left whole on purpose. Cutting on word count
 * produced fragments like "ne restez pas à la. maison." — which read aloud is
 * worse than a long sentence, and in health guidance can invert the meaning of
 * a negation. The cap is enforced where it belongs, in generation; here it is
 * measured, and `overlongSentences` reports what slipped through.
 */
function breakSentence(sentence: string, maxWords: number): string[] {
  if (wordCount(sentence) <= maxWords) return [sentence];

  const seams = sentence.split(/(?<=[;:])\s+|(?<=,)\s+(?=(?:et|mais|puis|ensuite|car|donc|si|quand|lorsque)\b)/i);
  if (seams.length === 1) return [sentence];

  const out: string[] = [];
  let buffer = "";
  for (const piece of seams) {
    const candidate = buffer ? `${buffer} ${piece}` : piece;
    if (wordCount(candidate) > maxWords && buffer) {
      out.push(buffer);
      buffer = piece;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) out.push(buffer);
  return out.map((s) => s.trim()).filter(Boolean);
}

function ensureStop(sentence: string): string {
  // French keeps a space before ; : ! ? — stripping it changes how the line is
  // typeset and, on some engines, how it is read.
  return /[.!?;:…]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** Rewrites an answer into sentences short enough to follow by ear (FR-LG-06). */
export function toSpokenText(text: string, language: LanguageCode = "fr", maxWords = MAX_SPOKEN_SENTENCE_WORDS): string {
  const spoken = numeralsAsWords(text, language);
  return splitSentences(spoken)
    .flatMap((s) => breakSentence(s, maxWords))
    .map(ensureStop)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * The sentences still over the cap after seam-splitting. Reported rather than
 * silently mangled, so the generation prompt can be corrected instead.
 */
export function overlongSentences(text: string, maxWords = MAX_SPOKEN_SENTENCE_WORDS): string[] {
  return splitSentences(text).filter((s) => wordCount(s) > maxWords);
}

export function estimateSpokenSeconds(text: string): number {
  return wordCount(text) / WORDS_PER_SECOND;
}

const CONTINUE_PROMPT: Record<LanguageCode, string> = {
  fr: "Voulez-vous que je continue ?",
  ln: "Olingi nakoba?",
  kg: "Nge zola nde mono landa?",
  sw: "Unataka niendelee?",
  lua: "Udi musue ntungunuke?",
};

export interface SpokenChunk {
  text: string;
  seconds: number;
  /** True on every chunk but the last: the citizen is asked before the next one is read. */
  askToContinue: boolean;
}

/**
 * Splits a long answer into parts of at most 25 seconds, each ending with an
 * offer to continue. A citizen paying for the call decides how much they hear.
 */
export function chunkForSpeech(text: string, language: LanguageCode = "fr", maxSeconds = MAX_SPOKEN_SECONDS): SpokenChunk[] {
  const sentences = splitSentences(toSpokenText(text, language));
  const budget = Math.max(1, Math.floor(maxSeconds * WORDS_PER_SECOND));
  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (wordCount(candidate) > budget && buffer) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) chunks.push(buffer);
  if (chunks.length === 0) return [];
  return chunks.map((chunk, i) => {
    const last = i === chunks.length - 1;
    return {
      text: last ? chunk : `${chunk} ${CONTINUE_PROMPT[language]}`,
      seconds: estimateSpokenSeconds(chunk),
      askToContinue: !last,
    };
  });
}
