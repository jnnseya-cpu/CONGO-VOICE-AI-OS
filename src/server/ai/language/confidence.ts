/**
 * What the platform does when it is not sure it heard correctly.
 *
 * Aggregate accuracy hides the failures that matter. A transcript that is 95 %
 * right is worthless if the 5 % it lost was the word "pas", the number of days,
 * or the fact that the woman is pregnant. So confidence is kept as separate
 * dimensions, and the elements whose misreading would change the advice are
 * confirmed out loud rather than assumed.
 *
 * FR-LG-01, FR-LG-02, FR-LG-09, and the low-confidence policy of the
 * engineering specification §8.5.
 */
import type { LanguageCode } from "@server/db/schema";

/** Below this, the detected language is confirmed with the citizen instead of assumed (FR-LG-01). */
export const LANGUAGE_CONFIRM_THRESHOLD = 0.7;

/** Below this, a safety-relevant element is quoted back for confirmation (FR-LG-02). */
export const ELEMENT_CONFIRM_THRESHOLD = 0.55;

/** After this many failed confirmations the turn goes to a human rather than guessing again (§8.5). */
export const MAX_CONFIRMATION_ROUNDS = 2;

export type UncertainKind = "negation" | "number" | "medicine" | "pregnancy" | "age" | "crop_input" | "urgency" | "other";

export interface UncertainElement {
  kind: UncertainKind;
  heard: string;
  confidence: number;
}

export interface LanguageReading {
  language: LanguageCode;
  confidence: number;
  alternative?: { language: LanguageCode; confidence: number } | null;
  uncertainElements?: UncertainElement[];
  spans?: Array<{ text: string; language: LanguageCode }>;
}

/**
 * The dimensions the risk agent reads (FR-LG-09). One opaque number would let a
 * confident translation of a badly-heard sentence pass as a confident turn.
 */
export interface ConfidenceVector {
  /** How well the audio was heard. Null when the citizen typed. */
  transcription: number | null;
  /** How sure we are which language was spoken. */
  language: number;
  /** How sure we are the French pivot says what the citizen said. */
  translation: number;
  /** The binding constraint: the weakest link, because that is what the answer rests on. */
  overall: number;
}

export function confidenceVector(input: {
  transcription?: number | null;
  language: number;
  translation?: number | null;
}): ConfidenceVector {
  const translation = input.translation ?? input.language;
  const parts = [input.transcription, input.language, translation].filter((n): n is number => typeof n === "number");
  return {
    transcription: input.transcription ?? null,
    language: input.language,
    translation,
    overall: parts.length ? Math.min(...parts) : 0,
  };
}

const LANGUAGE_NAME: Record<LanguageCode, string> = {
  fr: "français",
  ln: "lingala",
  kg: "kikongo",
  sw: "kiswahili",
  lua: "tshiluba",
};

/**
 * True when the two best candidates are close enough that picking one is a
 * guess. Answering in the wrong language is not a cosmetic error: the citizen
 * simply does not receive the advice.
 */
export function needsLanguageConfirmation(reading: LanguageReading): boolean {
  if (reading.confidence < LANGUAGE_CONFIRM_THRESHOLD) return true;
  const alt = reading.alternative;
  return !!alt && alt.language !== reading.language && reading.confidence - alt.confidence < 0.15;
}

/** The confirmation question, asked in both candidate languages so either speaker understands it. */
export function languageConfirmationPrompt(reading: LanguageReading): string {
  const primary = LANGUAGE_NAME[reading.language];
  const alt = reading.alternative && reading.alternative.language !== reading.language ? LANGUAGE_NAME[reading.alternative.language] : null;
  const question = alt
    ? `Je ne suis pas certain de votre langue. Préférez-vous continuer en ${primary} ou en ${alt} ?`
    : `Je ne suis pas certain de votre langue. Continuons-nous en ${primary} ?`;
  const echo: Partial<Record<LanguageCode, string>> = {
    ln: "Olingi tolobana na lingala?",
    kg: "Nge zola beto tuba na kikongo?",
    sw: "Unataka tuendelee kwa Kiswahili?",
    lua: "Udi musue tuakule mu tshiluba?",
  };
  const second = alt && echo[reading.alternative!.language];
  return second ? `${question} ${second}` : question;
}

const KIND_LABEL: Record<UncertainKind, string> = {
  negation: "ce qui n'a pas été fait",
  number: "le nombre",
  medicine: "le médicament",
  pregnancy: "la grossesse",
  age: "l'âge",
  crop_input: "le produit utilisé",
  urgency: "l'urgence",
  other: "ce point",
};

/**
 * The elements worth a question. Ordered by how much damage a misreading does,
 * and capped, because a citizen who is asked five questions hangs up.
 */
export function elementsNeedingConfirmation(reading: LanguageReading, max = 2): UncertainElement[] {
  const ranked: UncertainKind[] = ["negation", "urgency", "pregnancy", "age", "number", "medicine", "crop_input", "other"];
  return (reading.uncertainElements ?? [])
    .filter((e) => e.confidence < ELEMENT_CONFIRM_THRESHOLD && e.heard.trim().length > 0)
    .sort((a, b) => ranked.indexOf(a.kind) - ranked.indexOf(b.kind) || a.confidence - b.confidence)
    .slice(0, max);
}

/** Quotes back exactly what was heard, so the citizen corrects a word rather than repeating everything. */
export function elementConfirmationPrompt(element: UncertainElement): string {
  return `J'ai entendu « ${element.heard.trim()} » pour ${KIND_LABEL[element.kind]}. Est-ce correct ?`;
}

export interface ClarificationPlan {
  /** Questions to put to the citizen before acting, in order. Empty when nothing is in doubt. */
  questions: string[];
  /** True when the turn has already been clarified twice and must go to a human instead (§8.5). */
  routeToHuman: boolean;
  /** Machine-readable reasons, recorded on the interaction. */
  reasons: string[];
}

export function planClarification(reading: LanguageReading, roundsAlreadyAsked = 0): ClarificationPlan {
  const questions: string[] = [];
  const reasons: string[] = [];

  if (needsLanguageConfirmation(reading)) {
    questions.push(languageConfirmationPrompt(reading));
    reasons.push("langue_incertaine");
  }
  for (const element of elementsNeedingConfirmation(reading)) {
    questions.push(elementConfirmationPrompt(element));
    reasons.push(`element_incertain:${element.kind}`);
  }

  // Two rounds is the whole budget. A third would be the system failing slowly
  // in front of someone who needs an answer.
  if (questions.length > 0 && roundsAlreadyAsked >= MAX_CONFIRMATION_ROUNDS) {
    return { questions: [], routeToHuman: true, reasons: [...reasons, "clarifications_epuisees"] };
  }
  return { questions: questions.slice(0, MAX_CONFIRMATION_ROUNDS), routeToHuman: false, reasons };
}
