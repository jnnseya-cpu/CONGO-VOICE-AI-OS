import "server-only";

/**
 * Did the citizen actually ask anything?
 *
 * A message reading "merci" was escalated as an urgent health case needing
 * review. The escalation rule was right about what it saw — confidence was low —
 * and wrong about why: confidence is low on "merci" because there is nothing to
 * understand, not because something was understood badly. The notification even
 * said so in its own summary while waking a health worker anyway.
 *
 * Two of five alerts in a live queue were that. Alert fatigue is not a cosmetic
 * problem in a health service; it is the mechanism by which the real escalation,
 * the one about a child who cannot drink, gets skimmed past at three in the
 * morning. A queue that cries wolf is worse than no queue.
 *
 * So this decides, deterministically and before any model is consulted, whether
 * a message is a courtesy rather than a request. It is written to be wrong in
 * the safe direction: anything longer than a few words, anything with a question
 * mark, anything containing a single clinical, agricultural or scholastic term,
 * and anything it does not recognise is treated as a real request.
 *
 * It never sees a red flag. Red flags and safeguarding are evaluated by the
 * protocol engine before this runs, and a message carrying one is a request
 * whatever else it contains — this function is only consulted when the
 * deterministic layer found nothing at all.
 */

/** Lower-case, unaccented, punctuation stripped. "Merci !" and "MERCI" are one word. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Courtesies in the five national languages, because a citizen thanking the
 * service in Lingala must not wake a nurse any more than one thanking it in
 * French.
 */
const COURTESY = [
  // Français
  "merci", "merci beaucoup", "mercii", "bonjour", "bonsoir", "salut", "bonne nuit",
  "au revoir", "a bientot", "ok", "oui", "non", "daccord", "d accord", "tres bien",
  "bien", "parfait", "super", "compris", "entendu", "cest bon", "c est bon", "rien",
  "test", "essai", "allo", "bonne journee", "s il vous plait", "sil vous plait",
  // Lingala
  "matondo", "melesi", "mbote", "botondi", "nazali malamu", "malamu", "eloko te",
  "tokomonana", "kende malamu",
  // Kikongo
  "matondo mingi", "mbote kaka", "ntondele", "ya mbote",
  // Kiswahili
  "asante", "asante sana", "shukrani", "habari", "jambo", "karibu", "sawa",
  "sawa sawa", "nzuri", "kwaheri", "hakuna", "ndiyo", "hapana",
  // Tshiluba
  "tuasakidila", "moyo", "bimpe", "kalengele",
];

const COURTESY_SET = new Set(COURTESY.map(normalise));

/**
 * Any word that makes a message a request, whatever else surrounds it.
 *
 * Deliberately broad and deliberately unaccented. A false entry here costs an
 * escalation that was not needed; a missing one costs an escalation that was.
 */
const SUBSTANTIVE = [
  // Santé — symptômes, personnes, actes
  "malade", "maladie", "douleur", "mal", "fievre", "chaud", "temperature", "tousse", "toux",
  "respire", "respiration", "souffle", "sang", "saigne", "vomit", "vomis", "diarrhee",
  "selles", "boit", "boire", "manger", "mange", "faible", "fatigue", "convulsion",
  "tremble", "evanoui", "inconscient", "enceinte", "grossesse", "accouche", "bebe",
  "enfant", "nourrisson", "nouveau ne", "medicament", "comprime", "dose", "vaccin",
  "piqure", "blessure", "brulure", "morsure", "eruption", "boutons", "gonfle",
  "tete", "ventre", "poitrine", "gorge", "yeux", "oreille", "jambe", "bras",
  "hopital", "clinique", "centre de sante", "docteur", "medecin", "infirmier",
  "paludisme", "malaria", "cholera", "rougeole", "tuberculose", "vih", "sida",
  "jours", "semaine", "depuis", "urgence", "aide", "aidez", "secours",
  // Agriculture
  "champ", "culture", "manioc", "mais", "riz", "haricot", "arachide", "banane",
  "feuille", "feuilles", "plante", "plant", "semence", "graine", "recolte", "sol",
  "engrais", "insecte", "chenille", "puceron", "pourriture", "jaunit", "jaunissent",
  "seche", "pluie", "poule", "poulet", "chevre", "vache", "porc", "animal", "betail",
  // Éducation
  "ecole", "classe", "eleve", "etudiant", "lecon", "cours", "devoir", "examen",
  "tenafep", "mathematiques", "fraction", "lecture", "ecrire", "lire", "calcul",
  "comprends pas", "explique", "expliquer", "reviser", "revision", "note", "bulletin",
];

const SUBSTANTIVE_SET = new Set(SUBSTANTIVE.map(normalise));

/** Longer than this and it is a message, not a greeting, whatever the words. */
const MAX_COURTESY_WORDS = 6;

export interface CourtesyVerdict {
  courtesy: boolean;
  /** Why, in a form an operator reading an audit row can check. */
  reason: string;
}

export function classifyCourtesy(text: string | null | undefined): CourtesyVerdict {
  const raw = (text ?? "").trim();
  if (raw.length === 0) {
    // Nothing at all: a dropped recording or an empty send. A person should not
    // be woken for it, and the citizen gets the ordinary invitation to speak.
    return { courtesy: true, reason: "message vide" };
  }

  // A question mark is an ask, even if every word is otherwise a courtesy.
  if (raw.includes("?")) return { courtesy: false, reason: "contient une question" };

  const clean = normalise(raw);
  const words = clean.split(" ").filter(Boolean);
  if (words.length > MAX_COURTESY_WORDS) return { courtesy: false, reason: "message long" };

  for (const word of words) {
    if (SUBSTANTIVE_SET.has(word)) return { courtesy: false, reason: `terme significatif : ${word}` };
  }
  // Multi-word terms such as "centre de sante".
  for (const term of SUBSTANTIVE_SET) {
    if (term.includes(" ") && clean.includes(term)) return { courtesy: false, reason: `terme significatif : ${term}` };
  }

  if (COURTESY_SET.has(clean)) return { courtesy: true, reason: `formule de politesse : ${clean}` };
  if (words.every((w) => COURTESY_SET.has(w))) return { courtesy: true, reason: "uniquement des formules de politesse" };

  // Short, unrecognised, and carrying no known term. It might be a request
  // phrased in a way this list does not cover, so it is treated as one.
  return { courtesy: false, reason: "non reconnu" };
}
