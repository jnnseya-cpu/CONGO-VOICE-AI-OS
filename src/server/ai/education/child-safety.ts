/**
 * Child-safety filters for the education module (EDU-005).
 *
 * Three deterministic passes, applied to what the learner says and to everything the
 * platform says back:
 *   1. age-appropriateness — adult, violent or frightening content is never explained to a
 *      child; the request is redirected to a trusted adult;
 *   2. no commercial persuasion — no brand, no price, no "buy this", no sponsored advice;
 *   3. disclosure — abuse or self-harm raises a safeguarding flag, answered with the scripted
 *      supportive reply from the safety layer, with no question about details.
 */
import "server-only";
import type { LanguageCode } from "@server/db/schema";
import { detectSafeguarding, SAFEGUARDING_RESPONSES, type SafeguardingCategory } from "../safety";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Topics never explained to a child learner; the answer redirects to a trusted adult. */
export const ADULT_TOPIC_TERMS: string[] = [
  "pornographie",
  "porno",
  "film pour adultes",
  "rapport sexuel",
  "faire l'amour",
  "position sexuelle",
  "drogue",
  "cannabis",
  "chanvre",
  "cocaïne",
  "alcool fort",
  "se saouler",
  "cigarette",
  "fumer",
  "arme à feu",
  "fabriquer une arme",
  "fabriquer une bombe",
  "poison",
  "empoisonner",
  "pari sportif",
  "paris en ligne",
  "jeu d'argent",
  "casino",
];

/** Commercial persuasion: the service is free and never sells anything. */
export const COMMERCIAL_TERMS: string[] = [
  "achetez",
  "achète maintenant",
  "acheter maintenant",
  "abonnez-vous",
  "abonnement",
  "promotion",
  "offre spéciale",
  "prix réduit",
  "code promo",
  "commandez",
  "livraison gratuite",
  "meilleur prix",
  "cliquez ici",
  "inscrivez-vous vite",
  "sponsorisé",
  "publicité",
];

export type ChildSafetyFlag = "adult_topic" | "commercial_persuasion" | "safeguarding";

export interface ChildSafetyResult {
  /** True when nothing blocks the ordinary teaching path. */
  ok: boolean;
  flags: ChildSafetyFlag[];
  safeguarding: boolean;
  safeguardingCategories: SafeguardingCategory[];
  adultTerms: string[];
  commercialTerms: string[];
  /** Replacement answer when the ordinary path must not be taken. */
  scriptedResponse: string | null;
}

const ADULT_REDIRECT =
  "Ce sujet n'est pas un sujet dont je peux parler avec un élève. Parles-en à un adulte de confiance : un parent, un enseignant ou l'infirmier du centre de santé. Si tu veux, je peux plutôt t'aider sur une leçon : mathématiques, lecture, français ou sciences.";

/** Screens what the learner said, before any teaching. */
export function screenLearnerMessage(text: string, language: LanguageCode = "fr"): ChildSafetyResult {
  const t = norm(text);
  const disclosure = detectSafeguarding(text);
  const adultTerms = ADULT_TOPIC_TERMS.filter((k) => t.includes(norm(k)));
  const commercialTerms = COMMERCIAL_TERMS.filter((k) => t.includes(norm(k)));
  const flags: ChildSafetyFlag[] = [];
  if (disclosure.detected) flags.push("safeguarding");
  if (adultTerms.length) flags.push("adult_topic");
  if (commercialTerms.length) flags.push("commercial_persuasion");

  const scriptedResponse = disclosure.detected
    ? SAFEGUARDING_RESPONSES[language] ?? SAFEGUARDING_RESPONSES.fr
    : adultTerms.length
      ? ADULT_REDIRECT
      : null;

  return {
    ok: !disclosure.detected && adultTerms.length === 0,
    flags,
    safeguarding: disclosure.detected,
    safeguardingCategories: disclosure.categories,
    adultTerms,
    commercialTerms,
    scriptedResponse,
  };
}

export interface OutputScrub {
  text: string;
  removed: string[];
}

/**
 * Removes commercial persuasion from anything the platform is about to say.
 * A sentence that tries to sell is dropped, not rewritten.
 */
export function scrubCommercial(text: string): OutputScrub {
  if (!text) return { text, removed: [] };
  const removed: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const n = norm(s);
    const hit = COMMERCIAL_TERMS.find((k) => n.includes(norm(k)));
    if (hit) {
      removed.push(s.trim());
      return false;
    }
    return true;
  });
  return { text: kept.join(" ").trim(), removed };
}

/** Applies the output filters to every string of a lesson. */
export function scrubLessonText<T extends Record<string, unknown>>(obj: T, keys: Array<keyof T>): { value: T; removed: string[] } {
  const removed: string[] = [];
  const value = { ...obj };
  for (const k of keys) {
    const v = value[k];
    if (typeof v === "string") {
      const s = scrubCommercial(v);
      removed.push(...s.removed);
      (value[k] as unknown) = s.text;
    }
  }
  return { value, removed };
}

/* ------------------------------------------------------------------------------------------
 * Age appropriateness of the teaching itself
 * ---------------------------------------------------------------------------------------- */

const FRIGHTENING_TERMS = ["cadavre", "sang qui gicle", "torture", "massacre", "égorger", "viol", "mutiler"];

/** Guards the text the platform is about to read to a child. */
export function isAgeAppropriate(text: string, ageBand: string): { ok: boolean; reasons: string[] } {
  const t = norm(text);
  const reasons: string[] = [];
  const child = ageBand === "6-8" || ageBand === "9-11" || ageBand === "12-14";
  for (const k of ADULT_TOPIC_TERMS) if (t.includes(norm(k))) reasons.push(`sujet réservé aux adultes : ${k}`);
  if (child) for (const k of FRIGHTENING_TERMS) if (t.includes(norm(k))) reasons.push(`contenu effrayant pour cet âge : ${k}`);
  for (const k of COMMERCIAL_TERMS) if (t.includes(norm(k))) reasons.push(`incitation commerciale : ${k}`);
  return { ok: reasons.length === 0, reasons };
}
