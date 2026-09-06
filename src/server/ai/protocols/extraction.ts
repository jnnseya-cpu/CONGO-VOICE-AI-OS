/**
 * Deterministic entity and answer extraction (FR-HE-10, FR-HE-11).
 *
 * This layer never calls a model. It is what keeps red-flag recall intact when the LLM is
 * unavailable or wrong: whatever the model proposes, these answers are merged on top of it,
 * so a danger sign spoken in any of the five languages always reaches the protocol engine.
 */
import { detectDangerSigns, detectSafeguarding, type SafeguardingDetection } from "../safety";
import type { AnswerMap, HealthProtocol } from "./types";

export interface HealthEntities {
  symptoms: string[];
  durationDays: number | null;
  ageMonths: number | null;
  ageGroup: "infant" | "child" | "adolescent" | "adult" | "elderly" | "unknown";
  pregnant: boolean | null;
  /** Who the request is about, matching the general_symptom_intake `who` options. */
  subject: "self" | "child_under_5" | "newborn" | "pregnant_woman" | "elderly" | "unknown";
  locationHint: string | null;
  dangerSigns: string[];
  safeguarding: SafeguardingDetection;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, vingt: 20, trente: 30,
  moko: 1, mibale: 2, misato: 3, minei: 4, mitano: 5,
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
};

function numberBefore(text: string, unitPattern: string): number | null {
  const re = new RegExp(`(\\d+|[a-zàâçéèêëîïôûùüÿñæœ]+)\\s*(?:${unitPattern})`, "i");
  const m = text.match(re);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  return NUMBER_WORDS[raw] ?? null;
}

/** Duration in days, understanding days / weeks / months in the five languages. */
export function extractDurationDays(text: string): number | null {
  const t = text.toLowerCase();
  const days = numberBefore(t, "jours?|mikolo|bilumbu|siku|matuku");
  if (days !== null) return days;
  const weeks = numberBefore(t, "semaines?|poso|mposo|wiki|mbingu|lumingu");
  if (weeks !== null) return weeks * 7;
  const months = numberBefore(t, "mois|sanza|ngonda|miezi|mwezi|ngondo");
  if (months !== null) return months * 30;
  if (/\b(hier|lobi|mazono|jana|makelela)\b/.test(t)) return 1;
  if (/\b(aujourd'hui|lelo|bubu|leo)\b/.test(t)) return 0;
  return null;
}

/** Age in months. Recognises explicit ages and life-stage words. */
export function extractAgeMonths(text: string): number | null {
  const t = text.toLowerCase();
  const years = numberBefore(t, "ans?|mibu|bamvula|miaka|bidimu");
  if (years !== null) return years * 12;
  const months = numberBefore(t, "mois|sanza|ngonda|miezi|mwezi|ngondo");
  if (months !== null) return months;
  const days = numberBefore(t, "jours?|mikolo|bilumbu|siku|matuku");
  if (days !== null && /(né|nee|née|nouveau|mwana ya sika|mtoto mchanga|muana mupiamupia)/.test(t)) return Math.max(0, Math.round((days / 30) * 100) / 100);
  if (/nouveau-né|nouveau ne|nouveau-nee|nourrisson de quelques jours|mtoto mchanga|mwana ya sika|muana mupiamupia/.test(t)) return 0.5;
  if (/\b(bébé|bebe|nourrisson|mwana muke|mtoto mdogo)\b/.test(t)) return 6;
  return null;
}

export function extractPregnancy(text: string): boolean | null {
  const t = text.toLowerCase();
  if (/enceinte|grossesse|zemi|divumu|mimba|mjamzito|difu dia muana|femme enceinte/.test(t)) return true;
  return null;
}

export function extractLocationHint(text: string): string | null {
  const m = text.match(/\b(?:à|a|au|dans|vers|zone de santé de|quartier|village de|territoire de)\s+([A-ZÉÈÀÂ][\p{L}'’-]{2,}(?:\s+[A-ZÉÈÀÂ][\p{L}'’-]{2,})?)/u);
  return m ? m[1].trim() : null;
}

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  fièvre: ["fièvre", "fievre", "chaud", "température", "malali ya moto", "homa", "mwini", "luya"],
  toux: ["toux", "tousse", "kosukola", "kikohozi", "kosukumuna", "tshikosolo"],
  diarrhée: ["diarrh", "selles liquides", "pulupulu", "kuhara", "tuvi tua mâyi"],
  vomissements: ["vomi", "vomit", "kosanza", "kutapika", "kuluka", "kulua"],
  douleur: ["douleur", "mal au", "mal de", "mpasi", "maumivu", "makenga"],
  éruption: ["éruption", "boutons", "matono", "upele", "bitono", "bipupu"],
  saignement: ["saigne", "sang", "makila", "damu", "menga", "mashi"],
  faiblesse: ["faible", "fatigue", "alembi", "amelegea", "mutekete"],
  gonflement: ["gonfl", "vimba", "uvimbe", "divudi"],
  plaie: ["plaie", "blessure", "coupure", "mpota", "mputa", "jeraha"],
};

export function extractSymptoms(text: string): string[] {
  const t = text.toLowerCase();
  return Object.entries(SYMPTOM_KEYWORDS).filter(([, keys]) => keys.some((k) => t.includes(k))).map(([s]) => s);
}

export function extractEntities(textFr: string): HealthEntities {
  const t = textFr.toLowerCase();
  const ageMonths = extractAgeMonths(textFr);
  const pregnant = extractPregnancy(textFr);
  const child = /enfant|bébé|bebe|fils|fille|mwana|mtoto|muana|nourrisson/.test(t);
  const newborn = /nouveau-né|nouveau ne|mtoto mchanga|mwana ya sika|muana mupiamupia|nombril|kitovu|motolu/.test(t) || (ageMonths !== null && ageMonths < 1);
  const elderly = /personne âgée|vieux|vieille|grand-père|grand-mère|mobange|mzee|mununu|mukulakaje/.test(t);
  const ageGroup: HealthEntities["ageGroup"] =
    ageMonths !== null
      ? ageMonths < 24
        ? "infant"
        : ageMonths < 144
          ? "child"
          : ageMonths < 216
            ? "adolescent"
            : ageMonths < 720
              ? "adult"
              : "elderly"
      : newborn || (child && !elderly)
        ? "child"
        : elderly
          ? "elderly"
          : "unknown";
  const subject: HealthEntities["subject"] = newborn
    ? "newborn"
    : pregnant
      ? "pregnant_woman"
      : child || (ageMonths !== null && ageMonths < 60)
        ? "child_under_5"
        : elderly
          ? "elderly"
          : /\b(je |j'ai|mon corps|nazali|nina|mono|ndi)\b/.test(t)
            ? "self"
            : "unknown";
  return {
    symptoms: extractSymptoms(textFr),
    durationDays: extractDurationDays(textFr),
    ageMonths,
    ageGroup,
    pregnant,
    subject,
    locationHint: extractLocationHint(textFr),
    dangerSigns: detectDangerSigns(textFr),
    safeguarding: detectSafeguarding(textFr),
  };
}

/* ---------------------------------------------------------------------------------------
 * Protocol selection (FR-HE-11)
 * ------------------------------------------------------------------------------------- */

/** Ordered rules: the first match wins, most specific first. */
export function selectProtocolId(textFr: string, entities: HealthEntities): string {
  const t = textFr.toLowerCase();
  const injury = /plaie|blessure|coupure|brûl|brul|morsure|serpent|nyoka|nioka|fracture|cassé|casse|accident|couteau|machette|mputa|mpota|jeraha|kuungua|kuumwa|chute|tombé|tombe|saigne|hémorragie/.test(t);
  const pregnancy = /enceinte|grossesse|accouch|contractions|zemi|divumu|mimba|mjamzito|cpn|prénatal|prenatal|perte des eaux|bébé ne bouge/.test(t);
  const newborn = entities.subject === "newborn" || /nouveau-né|nouveau ne|mtoto mchanga|mwana ya sika|muana mupiamupia|nombril|kitovu/.test(t);
  const vaccination = /vaccin|vaksa|chanjo|pev|bcg|penta|rougeole|polio|carnet de vaccination|calendrier vaccinal/.test(t);
  const malnutrition = /malnutrition|muac|périmètre brachial|perimetre brachial|bracelet|maigre|amaigri|kwashiorkor|marasme|utapiamlo|ne grossit pas|poids/.test(t);
  const diarrhoea = /diarrh|selles|pulupulu|kuhara|déshydrat|deshydrat|sro|ors|choléra|cholera|tuvi/.test(t);
  const respiratory = /toux|tousse|respir|pneumonie|souffle|poitrine|kikohozi|kosukola|kupema|tshikosolo|asthme/.test(t);
  const fever = /fièvre|fievre|palu|malaria|homa|malali ya moto|mwini|luya|température|temperature|chaud/.test(t);

  if (newborn) return "newborn_danger_signs";
  if (pregnancy) return "pregnancy_danger_signs";
  if (injury) return "injury_bleeding";
  if (vaccination) return "vaccination_schedule";
  if (malnutrition) return "malnutrition_screening";
  if (diarrhoea) return "diarrhoea_dehydration";
  if (respiratory) return "cough_breathing";
  if (fever) {
    const underFive = entities.subject === "child_under_5" || (entities.ageMonths !== null && entities.ageMonths < 60);
    return underFive ? "child_fever_u5" : "adult_fever";
  }
  return "general_symptom_intake";
}

/* ---------------------------------------------------------------------------------------
 * Answer extraction
 * ------------------------------------------------------------------------------------- */

/** Multi-select danger questions that are not the generic `danger_signs` list. */
const SIGN_KEYWORDS: Record<string, Record<string, string[]>> = {
  pregnancy_signs: {
    vaginal_bleeding: ["saigne", "saignement", "sang", "makila", "menga", "damu", "mashi", "perte de sang"],
    headache_vision: ["mal de tête", "maux de tête", "vue trouble", "vois flou", "yeux troubles", "mitu makasi", "maumivu ya kichwa", "kuona giza", "dikanda dia mutu"],
    convulsions: ["convulsion", "crise", "degedege", "kifafa", "kobeta nzoto", "kunikana", "kutshinguluka"],
    severe_abdominal_pain: ["douleur du ventre", "mal au ventre", "ventre très douloureux", "mpasi ya libumu", "maumivu ya tumbo", "mpasi ya divumu"],
    fever: ["fièvre", "fievre", "homa", "mwini", "luya"],
    water_broke: ["perdu les eaux", "perte des eaux", "poche des eaux", "mai ekiti", "maji kuvunjika", "masa me kulumuka"],
    no_fetal_movement: ["ne bouge plus", "bébé ne bouge", "hasogei", "koningana te", "ke nikana ve", "kena unyunguluka"],
    swelling: ["gonflé", "gonfle", "enflé", "visage gonflé", "mains gonflées", "kuvimba", "efutuki", "me vimba", "bivule"],
    breathing_difficulty: ["difficulté à respirer", "respire mal", "kopema mpasi", "kupumua kwa shida", "kupema mpasi"],
  },
  newborn_signs: {
    not_feeding: ["ne tète plus", "ne tete plus", "refuse de téter", "ne veut pas téter", "aboyi komela", "anakataa kunyonya", "ke buya kunwa mabele", "udi ubenga kuamua"],
    convulsions: ["convulsion", "degedege", "kifafa", "kobeta nzoto", "kunikana", "kutshinguluka"],
    breathing: ["respire vite", "respire mal", "difficulté à respirer", "kopema mbangu", "kupumua haraka", "kupema mpasi", "kupetesha lupepele"],
    temperature: ["corps froid", "froid", "brûlant", "fièvre", "baridi", "moto sana", "malili", "mashika", "luya"],
    no_movement: ["ne bouge plus", "ne bouge pas", "hasogei", "koningana te", "ke nikana ve"],
    umbilical_pus: ["nombril", "cordon", "pus", "kitovu", "usaha", "motolu", "ntulu", "mukaba"],
    jaundice_palms: ["jaune", "jaunisse", "ictère", "ictere", "njano", "mbuma", "bunzenza", "nzenza"],
    bulging_fontanelle: ["fontanelle", "utosi", "mbunzu", "tshianza tshia mutu"],
  },
  dehydration_signs: {
    sunken_eyes: ["yeux enfoncés", "yeux enfonces", "yeux sont enfoncés", "yeux creux", "miso ekoti", "macho yaliyodidimia", "meso me kota", "mêsu mabuele"],
    skin_pinch_slow: ["peau plissée", "peau reste", "pli cutané", "ngozi inabaki", "loposo etikali", "nkanda ke bikala", "tshiseba tshidi tshishala"],
    very_thirsty: ["très soif", "tres soif", "soif intense", "boit avidement", "mposa ya mai", "kiu kikali", "nyota mikole"],
    no_urine_6h: ["pas uriné", "pas urine", "n'urine plus", "pas de pipi", "masuba te", "hakuna mkojo", "masuba ve", "katuena tulua"],
    lethargic: ["très mou", "tres mou", "très molle", "tres molle", "toute molle", "sans force", "ne réagit", "amelegea", "alembi", "me lemba", "mutekete"],
  },
  head_injury_signs: {
    loss_of_consciousness: ["perdu connaissance", "perte de connaissance", "évanoui", "evanoui", "kupoteza fahamu", "kokufa mayele", "kufwa mayele", "kujimija meji"],
    repeated_vomiting: ["vomit plusieurs fois", "vomit beaucoup", "vomissements répétés", "anatapika mara kwa mara", "kosanza mbala mingi"],
    confusion: ["confus", "ne sait plus où", "désorienté", "desoriente", "kuchanganyikiwa", "kobunga makanisi", "kuvulakana"],
    clear_fluid: ["liquide par le nez", "liquide par l'oreille", "coule du nez", "coule de l'oreille", "maji puani", "mai na zolo"],
    seizure: ["convulsion", "degedege", "kobeta nzoto", "kunikana", "kutshinguluka"],
  },
  snakebite_signs: {
    swelling_spreading: ["gonfle", "gonflé", "enfle", "monte le long", "uvimbe", "kuvimba", "divudi"],
    bleeding_gums: ["saigne des gencives", "gencives", "saigne de la bouche", "ufizi", "minu", "meno"],
    breathing_difficulty: ["difficulté à respirer", "respire mal", "kupumua kwa shida", "kopema mpasi"],
    drowsy: ["somnolent", "paupières lourdes", "endormi", "usingizi", "mpongi", "tulu"],
  },
};

const BOOL_KEYWORDS: Record<string, { yes: string[]; no: string[] }> = {
  chest_indrawing: { yes: ["côtes s'enfoncent", "cotes s'enfoncent", "tirage", "creux sous les côtes", "mbavu zinaingia", "mikuwa ezali kokota"], no: [] },
  stridor: { yes: ["sifflement en respirant", "bruit en respirant", "stridor", "mluzi", "piololo"], no: [] },
  fast_breathing: { yes: ["respire vite", "respiration rapide", "respire trop vite", "kupumua haraka", "kopema mbangu", "kupetesha lupepele lubilu"], no: [] },
  oedema: { yes: ["œdème", "oedeme", "pieds gonflés", "pieds enflés", "kwashiorkor", "miguu imevimba", "makolo efutuki"], no: [] },
  blood_in_stool: { yes: ["sang dans les selles", "selles avec du sang", "dysenterie", "damu kwenye choo", "makila na nyei", "mashi mu tuvi"], no: [] },
  vomiting: { yes: ["vomit", "vomi", "kutapika", "kosanza", "kuluka", "kulua"], no: [] },
  rash: { yes: ["éruption", "eruption", "boutons", "rougeole", "matono", "upele", "bitono", "bipupu"], no: [] },
  pregnant: { yes: ["enceinte", "grossesse", "zemi", "divumu", "mimba", "mjamzito"], no: [] },
  getting_worse: { yes: ["empire", "de pire en pire", "s'aggrave", "aggravé", "inazidi kuwa mbaya", "ezali kobeba", "budi bunyanguka"], no: [] },
  low_birth_weight: { yes: ["prématuré", "premature", "né avant terme", "très petit", "petit poids", "njiti", "abotamaki moke"], no: [] },
  wound_dirty: { yes: ["plaie sale", "rouillé", "rouille", "clou", "terre dans la plaie", "profonde", "kutu", "mvindu"], no: [] },
  recent_illness: { yes: ["a été malade", "vient d'être malade", "rougeole récente", "après la diarrhée", "amekuwa mgonjwa"], no: [] },
  sick_now: { yes: ["est malade", "il est malade", "elle est malade", "ni mgonjwa", "azali na maladi", "udi ne disama"], no: [] },
  appetite: { yes: [], no: ["ne mange pas", "ne mange plus", "refuse de manger", "pas d'appétit", "hali", "anakataa kula", "aboyi kolia", "udi ubenga kudia"] },
  exclusive_breastfeeding: { yes: [], no: ["donne de l'eau", "donne du lait en poudre", "biberon", "bouillie", "maji", "lait artificiel"] },
  conscious: { yes: [], no: ["inconscient", "inconsciente", "ne réagit", "évanoui", "evanoui", "coma", "kupoteza fahamu", "kuzimia", "abungisi mayele", "kufwa mayele"] },
  bleeding_controlled: { yes: [], no: ["saigne beaucoup", "saignement abondant", "hémorragie", "n'arrête pas de saigner", "damu nyingi", "makila mingi", "menga mingi", "mashi a bungi"] },
  has_card: { yes: ["j'ai le carnet", "avec le carnet", "carnet est là"], no: ["pas de carnet", "perdu le carnet", "sans carnet", "hakuna kadi"] },
  labour_now: { yes: ["contractions", "je vais accoucher", "travail a commencé", "uchungu", "kobota ebandi"], no: [] },
};

const CHOICE_KEYWORDS: Record<string, Record<string, string[]>> = {
  malaria_test: {
    positive: ["test positif", "palu positif", "malaria positive", "goutte épaisse positive", "tdr positif"],
    negative: ["test négatif", "test negatif", "palu négatif", "malaria hasi", "tdr négatif"],
    not_done: ["pas de test", "pas testé", "pas teste", "aucun test", "jamais testé", "hakuna kipimo", "test esalemi te"],
  },
  injury_type: {
    snakebite: ["serpent", "nyoka", "nioka", "morsure de serpent", "kuumwa na nyoka"],
    burn: ["brûl", "brul", "feu", "eau chaude", "kuungua", "kozika", "moto"],
    head_injury: ["tête", "tete", "crâne", "crane", "coup à la tête", "kichwani", "na motó", "ku mutu"],
    animal_bite: ["chien", "mordu par", "morsure d'animal", "mbwa", "singe", "rat"],
    fracture_fall: ["fracture", "cassé", "casse", "tombé", "tombe", "chute", "kuanguka", "kobukana"],
    cut_wound: ["coupure", "couteau", "machette", "plaie", "blessure", "jeraha", "mpota", "mputa"],
  },
  who: {
    newborn: ["nouveau-né", "nouveau ne", "mtoto mchanga", "mwana ya sika", "muana mupiamupia"],
    pregnant_woman: ["enceinte", "grossesse", "zemi", "mjamzito", "divumu"],
    child_under_5: ["mon enfant", "bébé", "bebe", "mwana", "mtoto", "muana", "ma fille", "mon fils"],
    elderly: ["personne âgée", "vieux", "vieille", "mzee", "mobange", "mununu"],
    self: ["je", "j'ai", "moi", "nazali", "nina", "mono", "ndi"],
  },
  main_symptom: {
    fever: ["fièvre", "fievre", "homa", "mwini", "luya", "palu"],
    cough: ["toux", "tousse", "respir", "kikohozi", "kosukola"],
    diarrhoea: ["diarrh", "vomi", "kuhara", "pulupulu", "selles"],
    wound: ["plaie", "blessure", "brûl", "brul", "jeraha", "mpota"],
    pregnancy: ["enceinte", "grossesse", "accouch", "zemi", "mimba"],
    skin: ["peau", "boutons", "démangeaison", "ngozi", "loposo"],
    mental_distress: ["triste", "angoisse", "peur", "je ne dors plus", "huzuni", "wasiwasi", "mawa"],
    pain: ["douleur", "mal au", "mal de", "maumivu", "mpasi"],
  },
  drinking: {
    refuses: ["refuse de boire", "ne veut pas boire", "aboyi komela", "anakataa kunywa"],
    less: ["boit moins", "boit peu", "moins que d'habitude", "ananywa kidogo"],
    normal: ["boit normalement", "boit bien", "ananywa vizuri"],
  },
  burn_extent: {
    chemical_electrical: ["acide", "produit chimique", "électricité", "electricite", "courant", "kemikali", "umeme"],
    face_hands_genitals: ["visage", "figure", "mains", "parties génitales", "sexe", "uso", "mikono"],
    large: ["grande brûlure", "tout le bras", "toute la jambe", "large", "grande partie"],
    small_palm: ["petite brûlure", "petite", "comme une pièce"],
  },
  birth_place: {
    facility: ["à la maternité", "au centre de santé", "à l'hôpital", "kituoni", "hospitalini"],
    home: ["à la maison", "à domicile", "nyumbani", "na ndako", "na nzo", "ku nzubu"],
    other: ["en route", "dans la rue", "chez la matrone"],
  },
};

function matchChoice(questionId: string, text: string): string | null {
  const table = CHOICE_KEYWORDS[questionId];
  if (!table) return null;
  const t = text.toLowerCase();
  for (const [value, keys] of Object.entries(table)) if (keys.some((k) => t.includes(k))) return value;
  return null;
}

function matchMulti(questionId: string, text: string): string[] {
  if (questionId === "danger_signs") return detectDangerSigns(text);
  const table = SIGN_KEYWORDS[questionId];
  if (!table) return [];
  const t = text.toLowerCase();
  return Object.entries(table).filter(([, keys]) => keys.some((k) => t.includes(k))).map(([v]) => v);
}

function matchBool(questionId: string, text: string): boolean | null {
  const table = BOOL_KEYWORDS[questionId];
  if (!table) return null;
  const t = text.toLowerCase();
  if (table.no.some((k) => t.includes(k))) return false;
  if (table.yes.some((k) => t.includes(k))) return true;
  return null;
}

/**
 * Answers that can be read straight from the citizen's words, without any model.
 * Only confident matches are produced; everything else stays unanswered so the protocol
 * asks a clarification instead of guessing.
 */
export function deterministicAnswers(protocol: HealthProtocol, textFr: string, entities: HealthEntities): AnswerMap {
  const answers: AnswerMap = {};
  for (const question of Object.values(protocol.questions)) {
    switch (question.type) {
      case "multi_yes_no": {
        const values = matchMulti(question.id, textFr);
        if (values.length) answers[question.id] = values;
        break;
      }
      case "yes_no": {
        const v = matchBool(question.id, textFr);
        if (v !== null) answers[question.id] = v;
        break;
      }
      case "choice": {
        const v = matchChoice(question.id, textFr);
        if (v !== null) answers[question.id] = v;
        break;
      }
      case "age_months": {
        if (entities.ageMonths !== null) answers[question.id] = entities.ageMonths;
        break;
      }
      case "days": {
        if (question.id === "age_days") {
          if (entities.ageMonths !== null && entities.ageMonths < 2) answers[question.id] = Math.round(entities.ageMonths * 30);
        } else if (entities.durationDays !== null) answers[question.id] = entities.durationDays;
        break;
      }
      case "number": {
        if (question.id === "months_pregnant") {
          const m = numberBefore(textFr.toLowerCase(), "mois de grossesse|mois|sanza|ngonda|miezi|ngondo");
          if (m !== null) answers[question.id] = m;
        } else if (question.id === "muac_mm") {
          const m = numberBefore(textFr.toLowerCase(), "mm|millimètres|millimetres");
          if (m !== null) answers[question.id] = m;
        } else if (question.id === "anc_visits") {
          const m = numberBefore(textFr.toLowerCase(), "cpn|consultations prénatales|consultations prenatales");
          if (m !== null) answers[question.id] = m;
        }
        break;
      }
      default:
        break;
    }
  }
  if (protocol.questions.pregnant && entities.pregnant === true) answers.pregnant = true;
  if (protocol.questions.who && entities.subject !== "unknown" && answers.who === undefined) answers.who = entities.subject;
  return answers;
}

/** Model answers are only accepted where the deterministic pass found nothing. */
export function mergeAnswers(deterministic: AnswerMap, model: AnswerMap): AnswerMap {
  const merged: AnswerMap = { ...model };
  for (const [k, v] of Object.entries(deterministic)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && Array.isArray(merged[k])) {
      merged[k] = Array.from(new Set([...(merged[k] as string[]), ...v]));
    } else {
      merged[k] = v;
    }
  }
  return merged;
}
