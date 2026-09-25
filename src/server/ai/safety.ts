/**
 * Deterministic safety layer applied regardless of which model answered.
 * Keyword lists cover the five platform languages (spoken variants included).
 */
import type { LanguageCode } from "@server/db/schema";

/**
 * Matching normalisation.
 *
 * A caregiver types on a phone keyboard, in a hurry, about a child who is
 * convulsing. They will not produce the accents, and their keyboard will turn
 * an apostrophe into a curly one. Matching on the raw string meant a danger
 * sign was recognised or missed depending on whether a diacritic survived, and
 * the keyword lists had begun to carry both spellings of the same phrase to
 * work around it. Folding once, here, is what makes the lists mean what they
 * say.
 */
export function normaliseForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keyword lists are folded once at load, so every comparison is like for like. */
function folded(list: string[]): string[] {
  return list.map(normaliseForMatching);
}

export const HEALTH_EMERGENCY_TERMS: string[] = [
  // French
  "convulsion", "convulsions", "inconscient", "ne respire", "difficulté à respirer", "saignement", "saigne beaucoup",
  "hémorragie", "sang", "grossesse saignement", "accouchement", "raide", "nuque raide", "coma", "empoisonn", "morsure de serpent",
  "brûlure", "ne peut pas boire", "vomit tout", "fièvre très élevée", "yeux enfoncés", "peau très chaude",
  // Conjugated forms: a caregiver says "il convulse", not "il a des convulsions".
  "convulse", "convulsent", "convulsait", "convulsé",
  "ne peut plus téter", "ne peut pas téter", "n'arrive pas à téter", "n'arrive pas à boire", "ne veut plus téter",
  "ne tète pas", "ne boit plus", "ne boit rien", "refuse le sein", "ne se réveille pas", "ne réagit plus", "ne bouge plus",
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

const HEALTH_EMERGENCY_FOLDED = folded(HEALTH_EMERGENCY_TERMS);
const AGRI_URGENT_FOLDED = folded(AGRI_URGENT_TERMS);

export function detectEmergencyTerms(text: string): string[] {
  const t = normaliseForMatching(text);
  return HEALTH_EMERGENCY_TERMS.filter((_, i) => t.includes(HEALTH_EMERGENCY_FOLDED[i]));
}

export function detectAgriUrgentTerms(text: string): string[] {
  const t = normaliseForMatching(text);
  return AGRI_URGENT_TERMS.filter((_, i) => t.includes(AGRI_URGENT_FOLDED[i]));
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

/* ==========================================================================================
 * CONTENT BOUNDARIES (AI-19)
 * ========================================================================================== */

/**
 * Subjects a national service does not advise on.
 *
 * Not because the questions are illegitimate, but because a state-funded voice
 * in five languages telling a rural household who to vote for, which church is
 * true, or what to do about a court summons is a different and far more
 * dangerous product than the one being funded.
 */
export type BoundaryTopic =
  | "political"
  | "religious"
  | "legal"
  | "financial"
  /** Visas, passports, residence papers — and the bribes that get attached to them. */
  | "administrative"
  /** How to make something that hurts people, however the request is dressed. */
  | "dangerous_instructions"
  /** Sexual content, which this service does not produce for anyone, least of all a pupil. */
  | "sexual_content";

const BOUNDARY_PATTERNS: Array<{ topic: BoundaryTopic; re: RegExp }> = [
  { topic: "political", re: /\b(pour qui (?:je )?(?:dois|doit|devrais) voter|quel parti|voter pour|candidat|[ée]lections?|opposition politique|president(?:e|ielle)?\b)/i },
  { topic: "religious", re: /\b(quelle [ée]glise|quelle religion|est-ce que dieu|le vrai dieu|prier pour gu[ée]rir|p[ée]ch[ée]|pasteur dit)/i },
  { topic: "legal", re: /\b(porter plainte|r[ée]dige(?:r|z)? ma plainte|ma plainte|avocat|tribunal|proc[èe]s|convocation (?:au|de la) police|mes droits? l[ée]gaux|article de loi|quel juge|corrompre|soudoyer|pot-de-vin)/i },
  { topic: "financial", re: /\b(dois-je (?:investir|emprunter)|combien (?:je )?(?:dois|devrais) investir|cr[ée]dit bancaire|pr[êe]t (?:bancaire|[àa] int[ée]r[êe]t)|placer mon argent|cryptomonnaie)/i },
  { topic: "administrative", re: /\b(visa|passeport|carte de s[ée]jour|papiers pour (?:l'|la |le )?(?:europe|[ée]tranger)|[ée]migrer|immigration)/i },
  { topic: "dangerous_instructions", re: /\b(fabriquer (?:un|de l'|des) (?:explosif|explosifs|bombe|arme|armes|poison)|comment faire (?:une bombe|un explosif)|fabrication d'(?:explosif|arme)|poison pour tuer)/i },
  { topic: "sexual_content", re: /\b(sc[èe]ne sexuelle|contenu sexuel|d[ée]cris?-moi une sc[èe]ne (?:sexuelle|[ée]rotique)|pornograph|histoire [ée]rotique)/i },
];

export function detectBoundaryTopics(text: string): BoundaryTopic[] {
  const t = normaliseForMatching(text);
  return [...new Set(BOUNDARY_PATTERNS.filter((b) => b.re.test(t)).map((b) => b.topic))];
}

/** What is said instead: a plain refusal that still points somewhere useful. */
export const BOUNDARY_RESPONSES: Record<BoundaryTopic, Record<LanguageCode, string>> = {
  political: {
    fr: "Ce service ne donne pas de conseil politique et ne dit pas pour qui voter. Je peux vous aider sur la santé, l'agriculture ou l'école.",
    ln: "Service oyo epesaka toli ya politiki te mpe elobaka te nani ya kopona. Nakoki kosalisa yo na santé, bilanga to kelasi.",
    kg: "Kisalu yai ke pesa ndongisila ya politiki ve. Mono lenda sadisa nge na mavimpi, bilanga to nzo-nkanda.",
    sw: "Huduma hii haitoi ushauri wa kisiasa wala kusema umpigie nani kura. Naweza kukusaidia kuhusu afya, kilimo au shule.",
    lua: "Mudimu eu kawena ufila mibelu ya politike. Ndi mua kukuambuluisha ku makalenga a bukole, madimi anyi kalasa.",
  },
  religious: {
    fr: "Ce service ne donne pas de conseil religieux. Je peux vous aider sur la santé, l'agriculture ou l'école.",
    ln: "Service oyo epesaka toli ya lingomba te. Nakoki kosalisa yo na santé, bilanga to kelasi.",
    kg: "Kisalu yai ke pesa ndongisila ya dibundu ve. Mono lenda sadisa nge na mavimpi, bilanga to nzo-nkanda.",
    sw: "Huduma hii haitoi ushauri wa kidini. Naweza kukusaidia kuhusu afya, kilimo au shule.",
    lua: "Mudimu eu kawena ufila mibelu ya ntendelelu. Ndi mua kukuambuluisha ku bukole, madimi anyi kalasa.",
  },
  legal: {
    fr: "Ce service ne donne pas de conseil juridique. Adressez-vous à un service d'aide légale. Je reste disponible pour la santé, l'agriculture ou l'école.",
    ln: "Service oyo epesaka toli ya mibeko te. Kende epai ya bato ya aide légale. Nazali awa mpo na santé, bilanga to kelasi.",
    kg: "Kisalu yai ke pesa ndongisila ya nsiku ve. Kwenda na bantu ya lusadisu ya nsiku. Mono kele awa sambu na mavimpi, bilanga to nzo-nkanda.",
    sw: "Huduma hii haitoi ushauri wa kisheria. Nenda kwa huduma ya msaada wa kisheria. Nipo kwa afya, kilimo au shule.",
    lua: "Mudimu eu kawena ufila mibelu ya mikandu. Ndayi kudi bantu ba diambuluisha dia mikandu. Ndi muikale bua bukole, madimi anyi kalasa.",
  },
  financial: {
    fr: "Ce service ne donne pas de conseil financier. Je peux vous aider sur la santé, l'agriculture ou l'école.",
    ln: "Service oyo epesaka toli ya mbongo te. Nakoki kosalisa yo na santé, bilanga to kelasi.",
    kg: "Kisalu yai ke pesa ndongisila ya mbongo ve. Mono lenda sadisa nge na mavimpi, bilanga to nzo-nkanda.",
    sw: "Huduma hii haitoi ushauri wa kifedha. Naweza kukusaidia kuhusu afya, kilimo au shule.",
    lua: "Mudimu eu kawena ufila mibelu ya makuta. Ndi mua kukuambuluisha ku bukole, madimi anyi kalasa.",
  },
  administrative: {
    fr: "Ce service ne donne pas de conseil sur les visas, les passeports ou les démarches d'immigration, et n'aide jamais à payer quelqu'un pour les obtenir. Je peux vous aider sur la santé, l'agriculture ou l'école.",
    ln: "Service oyo epesaka toli te na oyo etali visa, passeport to komata na mboka mosusu, mpe esalisaka te mpo na kofuta moto. Nakoki kosalisa yo na santé, bilanga to kelasi.",
    kg: "Kisalu yai ke pesa ndongisila ve na yina ke tala visa, passeport to kukwenda na nsi ya nkaka, mpi ke sadisa ve sambu na kufuta muntu. Mono lenda sadisa nge na mavimpi, bilanga to nzo-nkanda.",
    sw: "Huduma hii haitoi ushauri kuhusu visa, pasipoti au uhamiaji, wala haisaidii kumlipa mtu ili kuzipata. Naweza kukusaidia kuhusu afya, kilimo au shule.",
    lua: "Mudimu eu kawena ufila mibelu bua visa, pasipoti anyi luendu lua ku ditunga dikuabu, ne kawena wambuluisha bua kufuta muntu to. Ndi mua kukuambuluisha ku bukole, madimi anyi kalasa.",
  },
  dangerous_instructions: {
    fr: "Ce service ne donne pas d'explications sur la fabrication d'explosifs, d'armes ou de poisons, même pour un devoir. Je peux vous aider autrement sur votre cours de chimie, la santé ou l'agriculture.",
    ln: "Service oyo epesaka ndimbola te ya kosala bisaleli ya koboma, ata mpo na devoir. Nakoki kosalisa yo na ndenge mosusu na kelasi ya chimie, santé to bilanga.",
    kg: "Kisalu yai ke pesa ntendula ve ya kusala bima ya kufwa bantu, ata sambu na devoir. Mono lenda sadisa nge na mutindu ya nkaka na kelasi ya chimie, mavimpi to bilanga.",
    sw: "Huduma hii haitoi maelezo ya kutengeneza vilipuzi, silaha au sumu, hata kwa kazi ya shule. Naweza kukusaidia kwa njia nyingine katika somo la kemia, afya au kilimo.",
    lua: "Mudimu eu kawena ufila mêyi a kuenza bintu bia kushipa bantu, nansha bua mudimu wa kalasa. Ndi mua kukuambuluisha mu mushindu mukuabu ku kalasa ka chimie, bukole anyi madimi.",
  },
  sexual_content: {
    fr: "Ce service ne donne pas de contenu sexuel ou explicite, et jamais à un élève. Je peux vous aider sur votre rédaction avec un autre sujet, ou sur la santé et l'école.",
    ln: "Service oyo epesaka makambo ya kosangisa nzoto te, mingi mingi na moyekoli. Nakoki kosalisa yo na rédaction na likambo mosusu, to na santé mpe kelasi.",
    kg: "Kisalu yai ke pesa mambu ya kuvukana nitu ve, mingi-mingi na mulongoki. Mono lenda sadisa nge na rédaction na diambu ya nkaka, to na mavimpi mpi nzo-nkanda.",
    sw: "Huduma hii haitoi maudhui ya ngono, hasa si kwa mwanafunzi. Naweza kukusaidia insha yako kwa mada nyingine, au kuhusu afya na shule.",
    lua: "Mudimu eu kawena ufila malu a masandi to, nangananga kudi mulongi. Ndi mua kukuambuluisha mufundu webe ne tshiena-bualu tshikuabu, anyi bua bukole ne kalasa.",
  },
};

/* ==========================================================================================
 * UNSUPPORTED CLAIMS (AI-15)
 * ========================================================================================== */

/**
 * Claims a public service must not make, whichever model produced them.
 *
 * `sanitiseHealthGuidance` already removes a prescription. This catches the
 * other half of the problem: sentences that are not prescriptions but are still
 * promises — a cure, a certainty, a yield, a price. They are what a citizen
 * repeats to a neighbour, and what a programme is held to afterwards.
 *
 * Deterministic patterns rather than a model, because a guard that itself
 * hallucinates guards nothing.
 */
interface ClaimRule {
  id: string;
  modules: Array<"health" | "agriculture" | "education" | "general">;
  re: RegExp;
  /** True when a citation makes the sentence acceptable (a figure from an approved source). */
  citationCures: boolean;
}

const CLAIM_RULES: ClaimRule[] = [
  // Narrow on purpose: "40 % des enfants guérissent seuls" is a statement about
  // the world, "ce traitement guérit" is a promise the programme would own.
  { id: "cure_promise", modules: ["health"], re: /\b(gu[ée]rison\s+garantie|gu[ée]ri[a-z]*\s+d[ée]finitivement|cure\s+d[ée]finitive|soigne\s+d[ée]finitivement|vous\s+gu[ée]rirez|ce\s+(?:traitement|rem[èe]de|produit|m[ée]dicament)\s+gu[ée]ri)/i, citationCures: false },
  // No trailing word boundary: "efficace à 100 %." ends on a symbol.
  { id: "certainty", modules: ["health", "agriculture"], re: /\b(garanti(?:e|s|es)?\b|sans\s+aucun\s+risque|aucun\s+danger|totalement\s+s[ûu]r|toujours\s+efficace|100\s*%|cent\s+pour\s+cent)/i, citationCures: false },
  { id: "diagnosis_assertion", modules: ["health"], re: /\b(vous\s+avez\s+(?:certainement|s[ûu]rement|bien)\s+(?:le|la|un|une)|c'est\s+(?:certainement|s[ûu]rement)\s+(?:le|la|un|une)\s+\w+|il\s+s'agit\s+(?:certainement|s[ûu]rement)\s+d)/i, citationCures: false },
  { id: "stop_treatment", modules: ["health"], re: /\b(arr[êe]tez\s+(?:votre|le|ce|les)\s+traitement|ne\s+prenez\s+plus\s+(?:vos|vos\s+)?(?:m[ée]dicaments?|comprim[ée]s))\b/i, citationCures: false },
  { id: "invented_evidence", modules: ["health", "agriculture", "education", "general"], re: /\b(selon\s+une\s+[ée]tude|les\s+[ée]tudes\s+montrent|d'apr[èe]s\s+l'OMS|selon\s+l'OMS|la\s+science\s+prouve)\b/i, citationCures: true },
  { id: "uncited_statistic", modules: ["health", "agriculture"], re: /\b\d{1,3}\s*%\s+(?:des|de\s+la|du|d'entre)\b/i, citationCures: true },
  { id: "guaranteed_yield", modules: ["agriculture"], re: /\b(rendement\s+garanti|doubler(?:a|ez|ai|ons|iez)?\s+(?:votre|ta|la)\s+r[ée]colte|vous\s+gagnerez|b[ée]n[ée]fice\s+assur[ée])\b/i, citationCures: false },
  { id: "price_promise", modules: ["agriculture"], re: /\b(le\s+prix\s+sera|vous\s+vendrez\s+[àa]|prix\s+garanti)\b/i, citationCures: false },
  { id: "uncited_dose_rate", modules: ["agriculture"], re: /\b\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg)\s*(?:\/|par)\s*(?:litre|l\b|ha\b|hectare|plante|pied)\b/i, citationCures: true },
];

export interface ClaimCheck {
  ok: boolean;
  /** Rule ids that fired, for the audit trail and the safety dashboard. */
  violations: string[];
  /** The sentences that must not be delivered as written. */
  sentences: string[];
}

/**
 * Checks an outbound answer for claims it cannot support. A citation rescues
 * only the rules where a source genuinely settles the question: a figure can be
 * cited, a promise of cure cannot.
 */
export function checkOutboundClaims(
  text: string,
  opts: { module: "health" | "agriculture" | "education" | "general"; citations?: string[] },
): ClaimCheck {
  const hasCitation = (opts.citations ?? []).length > 0;
  const violations: string[] = [];
  const sentences: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const rule of CLAIM_RULES) {
      if (!rule.modules.includes(opts.module)) continue;
      if (rule.citationCures && hasCitation) continue;
      if (rule.re.test(sentence)) {
        violations.push(rule.id);
        sentences.push(sentence.trim());
        break;
      }
    }
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)], sentences };
}

/**
 * The answer given instead, when a claim cannot be supported. It says less
 * rather than something unsupported, and routes the citizen to a person.
 */
export const CLAIM_FALLBACK: Record<LanguageCode, string> = {
  fr: "Je ne peux pas confirmer cette information avec une source approuvée. Je préfère ne rien affirmer. Une personne du programme va revoir votre demande et vous répondre.",
  ln: "Nakoki kondima likambo yango te na liboso ya source endimami. Malamu naloba eloko te. Moto ya programme akotala likambo na yo mpe akoyanola.",
  kg: "Mono lenda ndima ve diambu yayi na source ya kundima. Mbote mono tuba ve. Muntu ya programme ta tala diambu na nge mpe ta vutula.",
  sw: "Siwezi kuthibitisha jambo hili kwa chanzo kilichoidhinishwa. Ni afadhali nisiseme. Mtu wa programu atapitia ombi lako na kukujibu.",
  lua: "Tshiena mua kujadika bualu ebu ne tshidi tshitabujibue. Mbimpe tshiamba bualu. Muntu wa programme neatangile lukonko luebe ne neakuandamune.",
};

export const DISCLAIMERS: Record<LanguageCode, string> = {
  fr: "Ce service oriente et informe ; il ne remplace pas un agent de santé.",
  ln: "Service oyo epesi toli ; ezali na esika ya monganga te.",
  kg: "Kisalu yai ke pesa malongi ; yo ke zola ve kufuta munganga.",
  sw: "Huduma hii inatoa mwongozo tu ; haichukui nafasi ya mhudumu wa afya.",
  lua: "Mudimu eu udi ufila mibelu ; kawena upingana munganga.",
};

/**
 * Appends the disclaimer once, whoever asks.
 *
 * Two layers were each appending it — the health agent to its guidance, the
 * orchestrator to the composed answer — so a citizen heard the same sentence
 * twice. In a spoken interface that is not a cosmetic flaw: it is an extra
 * sentence read aloud over a bad line while someone waits to hear what to do.
 */
export function withDisclaimer(text: string, language: LanguageCode = "fr"): string {
  const disclaimer = DISCLAIMERS[language];
  const trimmed = text.trim();
  return normaliseForMatching(trimmed).includes(normaliseForMatching(disclaimer)) ? trimmed : `${trimmed} ${disclaimer}`.trim();
}

/**
 * Drops a sentence that repeats one already said. Composition passes through
 * several layers, each of which may restate the instruction; the citizen should
 * hear each thing once.
 */
export function dedupeSentences(text: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const key = normaliseForMatching(sentence).replace(/[.!?;:,]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence.trim());
  }
  return kept.join(" ").trim();
}

export const EMERGENCY_MESSAGES: Record<LanguageCode, string> = {
  fr: "Signes de danger détectés : allez au centre de santé le plus proche maintenant, sans attendre.",
  ln: "Bilembo ya likama emonani : kende na lopitalo to centre de santé sikoyo, kozela te.",
  kg: "Bidimbu ya kigonsa me monika : kwenda na lupitalu ya pene-pene sasa, kuvingila ve.",
  sw: "Dalili za hatari zimeonekana : nenda kituo cha afya kilicho karibu sasa hivi, usisubiri.",
  lua: "Bimanyinu bia njiwu bidi bimueneka : ndaku ku lupitadi lua pabuipi mpindieu, kuindila.",
};

/* ==========================================================================================
 * DANGER-SIGN KEYWORDS (FR-HE-03, offline red-flag recall)
 * The protocol engine decides severity from answers; these lists let the platform fill the
 * danger-sign answers straight from what the citizen said, with no model in the loop.
 * ========================================================================================== */

/** Option value of a danger-sign question → spoken triggers in the five platform languages. */
export const DANGER_SIGN_KEYWORDS: Record<string, string[]> = {
  convulsions: [
    "convulsion", "convulsions", "convulse", "convulsent", "convulsait", "convulsé", "crise", "crises",
    "tremble", "raidit", "se raidit", "spasme", "spasmes",
    "kobeta nzoto", "abeti nzoto", "nzoto ekangami",
    "degedege", "kifafa", "anatetemeka",
    "kunikana", "ke nikana",
    "kutshinguluka", "udi utshinguluka",
  ],
  unconscious: [
    "inconscient", "inconsciente", "ne réagit", "ne repond", "ne répond", "coma", "évanoui", "evanoui", "somnolent", "très endormi", "sans connaissance", "perte de connaissance",
    "ne se réveille pas", "ne bouge plus", "ne me reconnaît pas",
    // How lethargy and confusion are actually described, which is never with
    // the word "léthargie".
    "dort tout le temps", "n'arrive pas à le réveiller", "n'arrive pas à la réveiller", "difficile à réveiller",
    "je n'arrive pas à le reveiller", "ne se réveille plus", "reste endormi", "toujours endormi",
    "dit des choses qui n'ont pas de sens", "ne sait plus où il est", "ne sait plus ou elle est", "délire", "il délire", "elle délire", "confus", "confuse",
    "abungisi mayele", "azali koyanola te", "alali makasi", "akufi mayele",
    "kupoteza fahamu", "kuzimia", "amezimia", "hajibu", "usingizi mzito",
    "kele ve na mayele", "kufwa mayele", "ke vutula ve",
    "kujimija meji", "kena wandamuna",
  ],
  cannot_drink: [
    "komela mabele te", "alingi komela te", "aboyi mabele",
    "ne peut pas boire", "ne peut plus boire", "refuse de boire", "ne tète plus", "ne tete plus", "refuse de téter", "impossible de boire",
    "ne peut plus téter", "ne peut pas téter", "n'arrive pas à téter", "n'arrive pas à boire", "ne veut plus téter",
    "ne tète pas", "ne boit plus", "ne boit rien", "refuse le sein", "impossible de téter",
    "akoki komela te", "aboyi komela", "akomela te",
    "hawezi kunywa", "anakataa kunywa", "hanyonyi",
    "ke nwa ve", "ke buya kunwa",
    "kavua mua kunua", "udi ubenga kunua",
  ],
  vomits_everything: [
    "vomit tout", "vomit tous", "rejette tout", "vomissements incoercibles",
    "azali kosanza nyonso", "asanzi nyonso",
    "anatapika kila kitu", "kutapika kila kitu",
    "ke luka yonso",
    "udi ulua bionso",
  ],
  breathing_difficulty: [
    "ne respire", "difficulté à respirer", "difficulte a respirer", "respire mal", "respire vite", "essoufflé", "essouffle", "étouffe", "etouffe", "manque d'air", "respiration rapide",
    "a du mal à respirer", "respire difficilement", "respire très fort",
    // Chest indrawing: the sign a parent describes without ever naming it.
    "respire très vite", "respire tres vite", "respiration très rapide", "côtes se creusent", "cotes se creusent",
    "creuse les côtes", "la peau rentre entre les côtes", "tirage", "ventre qui se creuse en respirant",
    "anapumua haraka", "mbavu zinaingia", "upetesha lupepele bikole",
    "akoki kopema te", "kopema mpasi", "azali kopema mbangu",
    "hapumui", "anapumua kwa shida", "shida ya kupumua", "kupumua haraka",
    "ke pema mpasi", "ke pema ve",
    "kupetesha lupepele bikole", "kavua upetesha lupepele",
  ],
  stiff_neck: [
    "nuque raide", "cou raide", "raideur de la nuque",
    "nkingo ekangami",
    "shingo ngumu",
    "nsingu me kangama",
    "nshingu mukole",
  ],
  heavy_bleeding: [
    "saigne beaucoup", "saignement abondant", "hémorragie", "hemorragie", "perd du sang", "beaucoup de sang", "sang qui coule",
    "saigne énormément", "saigne sans arrêt", "n'arrête pas de saigner",
    "makila mingi", "makila ebimi mingi",
    "damu nyingi", "anavuja damu",
    "menga mingi",
    "mashi a bungi",
  ],
  /**
   * Signs below are not among the eight IMCI general danger signs. They are
   * added because every one of them turned up in the adversarial corpus as a
   * message a parent would plausibly send, and none of them was being caught.
   */
  blood_in_stool: [
    "sang dans les selles", "du sang dans les selles", "selles avec du sang", "diarrhée sanglante", "diarrhee sanglante", "selles noires",
    "makila na nzoto ya kobima", "choo cha damu", "damu kwenye kinyesi",
  ],
  severe_pallor: [
    "paumes des mains blanches", "mains toutes blanches", "paumes blanches", "très pâle", "tres pale", "pâleur", "paleur", "blanc comme du papier",
    "viganja vyeupe", "rangi imeisha",
  ],
  bulging_fontanelle: [
    "fontanelle bombée", "fontanelle bombee", "fontanelle gonflée", "fontanelle qui gonfle", "le dessus de la tête est bombé", "le dessus de la tete est bombe",
  ],
  severe_burn: [
    "eau bouillante", "brûlure grave", "brulure grave", "brûlé sur", "brule sur", "la peau est partie", "la peau s'est décollée", "ébouillanté", "ebouillante",
    "maji ya moto yamemwagika", "amechomwa sana",
  ],
  head_injury: [
    "coup à la tête", "coup a la tete", "tombé sur la tête", "tombe sur la tete", "choc à la tête", "frappé à la tête",
    "amegongwa kichwani", "ameanguka kichwa",
  ],
  jaundice: [
    "tout jaune", "toute jaune", "yeux jaunes", "peau jaune", "jaunisse", "paumes et plantes jaunes",
    "macho ya njano", "ngozi ya njano",
  ],
  very_cold: [
    "corps très froid", "corps tres froid", "glacé", "glace comme", "hypothermie", "fièvre très élevée", "fievre tres elevee", "peau très chaude", "brûlant", "brulant",
    "nzoto ya malili makasi", "nzoto ya moto makasi",
    "mwili baridi sana", "mwili moto sana",
    "nitu ya madidi mingi", "nitu ya mwini mingi",
    "mubidi wa mashika bikole", "mubidi wa luya bikole",
  ],
};

const DANGER_SIGN_FOLDED: Array<[string, string[]]> = Object.entries(DANGER_SIGN_KEYWORDS).map(([value, keys]) => [value, folded(keys)]);

/** Danger-sign option values recognised in a free-text message. */
export function detectDangerSigns(text: string): string[] {
  const t = normaliseForMatching(text);
  return DANGER_SIGN_FOLDED.filter(([, keys]) => keys.some((k) => t.includes(k))).map(([value]) => value);
}

/* ==========================================================================================
 * SAFEGUARDING (PRD 5.6) — restricted pathway
 * ========================================================================================== */

export type SafeguardingCategory =
  | "violence_physique"
  | "violence_sexuelle"
  | "exploitation"
  | "negligence"
  | "auto_agression"
  | "foyer_dangereux"
  | "mariage_precoce"
  /**
   * An adult isolating a child and asking for secrecy. Named separately from
   * sexual violence because it is what is disclosed first, long before anything
   * a child would call abuse, and because "do not tell your parents" is the one
   * sentence common to almost every case.
   */
  | "grooming";

/** Disclosure keywords in the five platform languages. Detection is intentionally broad. */
export const SAFEGUARDING_KEYWORDS: Record<SafeguardingCategory, string[]> = {
  violence_physique: [
    "il me frappe", "elle me frappe", "on me frappe", "me bat", "me battre", "battue", "battu", "violence à la maison", "violence a la maison", "coups à la maison", "maltraite", "maltraitance", "mon mari me frappe",
    "azali kobeta ngai", "babeti ngai", "mobali na ngai azali kobeta ngai",
    "ananipiga", "wananipiga", "kunipiga", "unyanyasaji", "mume wangu ananipiga",
    "yandi ke bula mono", "bo ke bula mono",
    "udi ungumisha", "badi bangumisha",
  ],
  violence_sexuelle: [
    // What is actually said, which is rarely the word "viol".
    "m'a forcée", "m'a forcee", "m'a forcé", "il m'a forcée", "m'a prise de force", "m'a obligée à coucher",
    "vient dans ma chambre la nuit", "entre dans ma chambre la nuit", "me touche la nuit",
    "viol", "violée", "violee", "violé", "abus sexuel", "attouchement", "touché mes parties", "touche mes parties", "forcée à coucher", "forcee a coucher", "forcé à coucher", "relations forcées", "il a abusé",
    "abandaki ngai na makasi", "asalaki ngai makambo ya nsoni",
    "amenibaka", "ubakaji", "kunilazimisha kulala", "unyanyasaji wa kingono",
    "yandi salaka mono na ngolo",
    "bakamusha ku bukole",
  ],
  exploitation: [
    "on me force à travailler", "travail forcé", "travail force", "on m'a vendue", "on m'a vendu", "traite", "trafic d'enfants", "exploitation", "on me garde enfermé", "on me garde enfermee", "ils ne me paient pas",
    "batekaki ngai", "bazali kosala na ngai mosala na makasi",
    "wameniuza", "kazi ya kulazimishwa", "biashara ya watoto",
    "bo tekaka mono",
    "bakantusha mudimu ku bukole",
  ],
  negligence: [
    "personne ne s'occupe de lui", "personne ne s'occupe d'elle", "abandonné", "abandonnee", "abandonnée", "laissé seul", "laisse seul", "n'a rien mangé depuis", "n'a pas mangé depuis des jours", "enfant seul à la maison",
    "moto moko te azali kobatela ye", "batiki ye ye moko",
    "hakuna anayemtunza", "ameachwa peke yake", "mtoto peke yake nyumbani",
    "ata muntu mosi ve ke tala yandi",
    "kakuena muntu udi umulama",
  ],
  grooming: [
    // The request for secrecy, which is the part a child repeats.
    "ne dis rien à tes parents", "ne dis pas à tes parents", "ne le dis pas à tes parents", "ne rien dire à mes parents", "sans que mes parents le sachent",
    "sans le dire à mes parents", "ne le dites à personne mais", "c'est notre secret", "notre secret", "garde le secret", "garder le secret",
    "tu peux garder le secret", "m'a demandé de ne rien dire", "il m'a dit de ne rien dire", "elle m'a dit de ne rien dire",
    "dit de ne rien dire", "de ne rien dire à mes parents", "sans le dire à personne",
    // Moving a child from a screen to a place, and adults asking the platform
    // where a child will be.
    "veut me rencontrer", "veut qu'on se voie", "veut qu'on se rencontre", "me donne rendez-vous",
    "heure de sortie de l'élève", "adresse de l'élève", "où habite l'élève", "ou habite l'eleve",
    // Isolation and contact outside any legitimate setting.
    "rester seul avec lui", "rester seule avec lui", "rester seul avec elle", "rester seule avec elle",
    "seul avec moi après les cours", "seule avec moi après les cours", "me demande de venir chez lui", "me demande de venir chez elle",
    "m'écrit la nuit", "m'envoie des messages la nuit", "me demande des photos", "envoie-moi une photo de toi", "m'a offert de l'argent pour",
    "kobomba sekele", "koloba na baboti na yo te", "azali kosenga ngai bafoto",
    "nayebisa baboti te", "natikala ye moko", "alobi natikala ye moko",
    "usimwambie mzazi", "ni siri yetu", "anataka nibaki naye peke yangu", "ananiomba picha",
    "kubumba kinsweki", "kuzabisa bibuti na nge ve",
    "kubuela baledi bebe to", "udi ulomba bimfuanyi",
  ],
  auto_agression: [
    "me suicider", "suicide", "me tuer", "en finir avec la vie", "je veux mourir", "je veux me faire du mal", "me faire du mal", "plus envie de vivre", "j'ai avalé", "j'ai bu du poison",
    // An act already carried out, said in the past tense and without the word.
    "avalé les comprimés", "avale les comprimes", "avalé des comprimés", "pris tous les comprimés", "dormir pour toujours", "ne jamais me réveiller",
    // Said plainly, and far more often than the clinical words above.
    "je ne veux plus vivre", "je ne veux plus de la vie", "pour en finir", "mettre fin à mes jours", "je préfère mourir", "la vie ne vaut plus", "je veux disparaître", "je veux disparaitre",
    "nalingi komiboma", "nalingi kokufa", "namelaki ngenge",
    "nataka kujiua", "kujiua", "nataka kufa", "nimekunywa sumu",
    "mono ke zola kudifwa", "mono ke zola kufwa",
    "ndi musue kudishipa", "ndi musue kufua",
  ],
  foyer_dangereux: [
    "je n'ose pas rentrer", "j'ai peur à la maison", "j'ai peur a la maison", "il va me tuer", "elle va me tuer", "menace de mort", "on me menace", "je me cache", "je suis enfermée", "je suis enferme", "pas en sécurité à la maison",
    "nazali kobanga na ndako", "akoboma ngai", "bazali kokanela ngai",
    "ninaogopa nyumbani", "atanijua", "ataniua", "wananitisha", "sijisikii salama nyumbani",
    "mono ke wa boma na nzo", "yandi ta fwa mono",
    "ndi ne buôwa ku nzubu", "neye wanshipa",
  ],
  mariage_precoce: [
    "veulent me marier", "veut me marier", "veulent la marier", "doivent me marier",
    "mariage forcé", "mariage force", "on veut la marier", "on veut me marier", "mariée à 14", "mariee a 14", "mariage d'enfant", "elle a 15 ans et on la marie",
    "balingi kobalisa ye na makasi", "kobalisa mwana",
    "ndoa ya kulazimishwa", "wanataka kumuoza", "ndoa ya utotoni",
    "bo ke zola kukwela yandi na ngolo",
    "badi basue kumusela ku bukole",
  ],
};

export interface SafeguardingDetection {
  detected: boolean;
  categories: SafeguardingCategory[];
  matchedTerms: string[];
}

/** Keyword pass across the five languages; the model flag is merged on top of it. */
export function detectSafeguarding(text: string): SafeguardingDetection {
  // Folded like the danger signs: a disclosure must not be missed because a
  // phone keyboard produced a curly apostrophe or dropped an accent.
  const t = normaliseForMatching(text);
  const categories: SafeguardingCategory[] = [];
  const matchedTerms: string[] = [];
  for (const [category, keys] of Object.entries(SAFEGUARDING_KEYWORDS) as Array<[SafeguardingCategory, string[]]>) {
    const hits = keys.filter((k) => t.includes(normaliseForMatching(k)));
    if (hits.length) {
      categories.push(category);
      matchedTerms.push(...hits);
    }
  }
  return { detected: categories.length > 0, categories, matchedTerms };
}

/** Self-harm and immediate-danger disclosures are also a health emergency. */
export const SAFEGUARDING_EMERGENCY_CATEGORIES: SafeguardingCategory[] = ["auto_agression", "violence_sexuelle", "foyer_dangereux"];

/**
 * Scripted reply for a disclosure. It believes the person, never promises secrecy,
 * asks for no detail, and names the help that exists. (PRD 5.6)
 */
export const SAFEGUARDING_RESPONSES: Record<LanguageCode, string> = {
  fr: "Merci de m'avoir parlé de cela ; ce que vous vivez n'est pas votre faute et vous méritez d'être protégé. Je ne peux pas garder cela pour moi seul : une personne formée à la protection sera prévenue pour vous aider, sans que les détails soient écrits dans les messages ordinaires. Si vous êtes en danger maintenant, allez dans un endroit sûr, chez une personne de confiance, ou au centre de santé le plus proche.",
  ln: "Matondi mpo oyebisi ngai likambo oyo ; ezali foti na yo te mpe osengeli kobatelama. Nakoki kobomba yango ngai moko te : moto oyo ayekola mpo na kobatela bato akoyebisama mpo asalisa yo, kasi makambo nyonso ekokomama na bansango ya momesano te. Soki ozali na likama sikoyo, kende esika ya kimia, epai ya moto ya motema malamu, to na centre de santé ya pene.",
  kg: "Matondo sambu nge songa mono diambu yai ; yo kele foti na nge ve mpi nge fwete tanina. Mono lenda bumba yo mono mosi ve : muntu ya me longuka kutanina bantu ta zaba sambu na kusadisa nge, kansi mambu yonso ta sonama na banzayisa ya mbote-mbote ve. Kana nge kele na kigonsa ntangu yayi, kwenda na kisika ya kimia, na muntu ya ntima ya mbote, to na centre de santé ya pene-pene.",
  sw: "Asante kwa kuniambia jambo hili; unayoyapitia si kosa lako na unastahili kulindwa. Siwezi kuliweka siri peke yangu: mtu aliyefunzwa kulinda watu ataarifiwa ili akusaidie, lakini maelezo hayataandikwa kwenye ujumbe wa kawaida. Ikiwa uko hatarini sasa, nenda mahali salama, kwa mtu unayemwamini, au kituo cha afya kilicho karibu.",
  lua: "Tuasakidila bua kutuambila bualu ebu; bidi bikufikila kabidi bualu buebe to, ne udi ne bua kulamibua. Ntshiena mua kubusokoka meme nkayanyi to: muntu mulongolola bua kulama bantu neabuidibue bua kukuambuluisha, kadi malu onso kaena mafundibua mu mikenji ya kashidi to. Bikala udi mu njiwu mpindieu, ndaku muaba mulame, kudi muntu uudi weyemena, anyi ku tshibambalu tshia bukolame tshia pabuipi.",
};

/** Neutral wording used in ordinary notifications: no detail ever leaves the restricted record. */
export const SAFEGUARDING_NOTIFICATION_TITLE = "Dossier protégé à examiner";
export const SAFEGUARDING_NOTIFICATION_BODY =
  "Un dossier relevant du dispositif de protection a été ouvert. Les informations sont accessibles uniquement dans l'espace protégé, aux personnes habilitées.";

/**
 * Scripted emergency instructions read to the citizen while they set off (FR-HE-12).
 * Fixed text, never model-generated.
 */
export const EMERGENCY_INSTRUCTIONS: Record<LanguageCode, string> = {
  fr: "Partez maintenant vers le centre de santé le plus proche, ne restez pas à la maison. Faites-vous accompagner. Pendant le trajet : allongez la personne sur le côté si elle est somnolente ou si elle vomit, ne lui donnez rien à boire ni à manger si elle ne réagit pas bien, gardez-la au chaud et desserrez ses vêtements. En cas de saignement, appuyez fort sur la plaie avec un linge propre sans jamais le retirer. Emportez le carnet de santé et les médicaments déjà pris.",
  ln: "Kende sikoyo na centre de santé ya pene, kotikala na ndako te. Sala ete moto mosusu akende na yo. Na nzela : lalisa moto na mopanzi soki alali makasi to azali kosanza, kopesa ye eloko ya komela to ya kolia te soki azali koyanola malamu te, batela ye moto mpe fungola bilamba na ye. Soki makila ezali kobima, fina makasi na mpota na elamba ya peto mpe kolongola yango te. Kamata carnet ya santé mpe bakisi oyo asili komela.",
  kg: "Kwenda ntangu yayi na centre de santé ya pene-pene, kubikala na nzo ve. Sala nde muntu ya nkaka kwenda ti nge. Na nzila : lalisa muntu na lweka kana yandi ke lala ngolo to ke luka, kupesa yandi kima ya kunwa to ya kudia ve kana yandi ke vutula mbote ve, bumba yandi mwini mpi kangula bilele na yandi. Kana menga ke basika, fina ngolo na mputa ti dilele ya bunkete mpi kukatula yo ve. Baka mukanda ya bukolele ti bankisi yina yandi me nwa.",
  sw: "Nenda sasa kituo cha afya kilicho karibu, usibaki nyumbani. Nenda na mtu wa kukusaidia. Njiani: mlaze mtu kwa ubavu ikiwa ana usingizi mzito au anatapika, usimpe chochote cha kunywa au kula kama hajibu vizuri, mwekeni joto na mlegeze nguo. Kama kuna damu, bonyeza kwa nguvu jeraha kwa kitambaa safi bila kukiondoa. Chukua kadi ya afya na dawa alizotumia.",
  lua: "Ndaku mpindieu ku tshibambalu tshia bukolame tshia pabuipi, kushala ku nzubu to. Yaya ne muntu mukuabu. Mu njila: lalika muntu ku luseke bikala ulala bikole anyi udi ulua, kumupesha tshintu tshia kunua anyi tshia kudia to bikala kayi wandamuna bimpe, mulame ne luya ne mutuluile bilamba. Bikala mashi apatuka, kuata mputa ne bukole ne tshilamba tshimpe kabiyi kutshiumbula. Angata mukanda wa bukolame ne manga akadiye munue.",
};

/** Stated limitation when no facility is known for the caller's area (HEA-004). */
export const FACILITY_UNKNOWN_NOTE: Record<LanguageCode, string> = {
  fr: "Je ne connais pas encore la structure de santé la plus proche de chez vous : demandez au relais communautaire ou dirigez-vous vers le centre de santé que vous connaissez.",
  ln: "Nayebi naino centre de santé ya pene na ndako na yo te : tuna relais communautaire to kende na centre de santé oyo oyebi.",
  kg: "Mono me zaba ntete ve centre de santé ya pene-pene ti nzo na nge : yula relais communautaire to kwenda na centre de santé yina nge zaba.",
  sw: "Bado sijui kituo cha afya kilicho karibu nawe zaidi: muulize mhudumu wa jamii au nenda kwenye kituo cha afya unachokijua.",
  lua: "Tshiena panu mumanye tshibambalu tshia bukolame tshia pabuipi ne nzubu webe to: ebeja mutuadilangana wa mu tshimenga anyi ndaku ku tshibambalu tshiudi mumanye.",
};
