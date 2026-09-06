/**
 * Deterministic safety layer applied regardless of which model answered.
 * Keyword lists cover the five platform languages (spoken variants included).
 */
import type { LanguageCode } from "@/lib/db/schema";

export const HEALTH_EMERGENCY_TERMS: string[] = [
  // French
  "convulsion", "convulsions", "inconscient", "ne respire", "difficulté à respirer", "saignement", "saigne beaucoup",
  "hémorragie", "sang", "grossesse saignement", "accouchement", "raide", "nuque raide", "coma", "empoisonn", "morsure de serpent",
  "brûlure", "ne peut pas boire", "vomit tout", "fièvre très élevée", "yeux enfoncés", "peau très chaude",
  // Lingala
  "akoki kopema te", "makila", "azali kolela te", "abungisi mayele", "kobota", "nzoto ekangami", "nyoka aswi",
  // Swahili
  "degedege", "kifafa", "hapumui", "damu nyingi", "kupoteza fahamu", "kuzimia", "shingo ngumu", "nyoka ameuma", "hawezi kunywa",
  // Kikongo
  "menga mingi", "kele ve na mayele", "nioka",
  // Tshiluba
  "mashi", "kabeela", "nyoka",
];

export const AGRI_URGENT_TERMS: string[] = [
  "toutes les plantes", "tout le champ", "se propage", "meurent", "mortes", "bétail mort", "plusieurs animaux", "épidémie", "criquets",
  "chenille légionnaire", "mosaïque", "striure brune", "peste porcine", "newcastle", "tout mon troupeau",
  "bilanga mobimba", "nyama ekufi", "banyama bakufi",
  "shamba lote", "wanyama wamekufa", "ugonjwa unaenea", "viwavi",
];

/** Phrases the assistant must never produce: we are a guidance layer, not a prescriber. */
const FORBIDDEN_OUTPUT_PATTERNS: RegExp[] = [
  /\b(prenez|prends|donnez|donne)\s+\d+\s*(mg|ml|comprim|cachet)/i,
  /\bposologie\b.*\bmg\b/i,
  /\bvous avez (certainement|sûrement|définitivement) (le|la|une|un)\b/i,
  /\bje diagnostique\b/i,
];

export function detectEmergencyTerms(text: string): string[] {
  const t = text.toLowerCase();
  return HEALTH_EMERGENCY_TERMS.filter((k) => t.includes(k));
}

export function detectAgriUrgentTerms(text: string): string[] {
  const t = text.toLowerCase();
  return AGRI_URGENT_TERMS.filter((k) => t.includes(k));
}

export interface SafetyCheck {
  ok: boolean;
  violations: string[];
  sanitised: string;
}

/** Removes diagnosis-like or dosing statements from health guidance. */
export function sanitiseHealthGuidance(text: string): SafetyCheck {
  const violations: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const bad = FORBIDDEN_OUTPUT_PATTERNS.some((re) => re.test(s));
    if (bad) violations.push(s.trim());
    return !bad;
  });
  return { ok: violations.length === 0, violations, sanitised: kept.join(" ").trim() };
}

export const DISCLAIMERS: Record<LanguageCode, string> = {
  fr: "Ce service oriente et informe ; il ne remplace pas un agent de santé.",
  ln: "Service oyo epesi toli ; ezali na esika ya monganga te.",
  kg: "Kisalu yai ke pesa malongi ; yo ke zola ve kufuta munganga.",
  sw: "Huduma hii inatoa mwongozo tu ; haichukui nafasi ya mhudumu wa afya.",
  lua: "Mudimu eu udi ufila mibelu ; kawena upingana munganga.",
};

export const EMERGENCY_MESSAGES: Record<LanguageCode, string> = {
  fr: "Signes de danger détectés : allez au centre de santé le plus proche maintenant, sans attendre.",
  ln: "Bilembo ya likama emonani : kende na lopitalo to centre de santé sikoyo, kozela te.",
  kg: "Bidimbu ya kigonsa me monika : kwenda na lupitalu ya pene-pene sasa, kuvingila ve.",
  sw: "Dalili za hatari zimeonekana : nenda kituo cha afya kilicho karibu sasa hivi, usisubiri.",
  lua: "Bimanyinu bia njiwu bidi bimueneka : ndaku ku lupitadi lua pabuipi mpindieu, kuindila.",
};
