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

/* ==========================================================================================
 * DANGER-SIGN KEYWORDS (FR-HE-03, offline red-flag recall)
 * The protocol engine decides severity from answers; these lists let the platform fill the
 * danger-sign answers straight from what the citizen said, with no model in the loop.
 * ========================================================================================== */

/** Option value of a danger-sign question → spoken triggers in the five platform languages. */
export const DANGER_SIGN_KEYWORDS: Record<string, string[]> = {
  convulsions: [
    "convulsion", "convulsions", "crise", "tremble", "raidit", "spasme",
    "kobeta nzoto", "abeti nzoto", "nzoto ekangami",
    "degedege", "kifafa", "anatetemeka",
    "kunikana", "ke nikana",
    "kutshinguluka", "udi utshinguluka",
  ],
  unconscious: [
    "inconscient", "inconsciente", "ne réagit", "ne repond", "ne répond", "coma", "évanoui", "evanoui", "somnolent", "très endormi", "sans connaissance", "perte de connaissance",
    "abungisi mayele", "azali koyanola te", "alali makasi", "akufi mayele",
    "kupoteza fahamu", "kuzimia", "amezimia", "hajibu", "usingizi mzito",
    "kele ve na mayele", "kufwa mayele", "ke vutula ve",
    "kujimija meji", "kena wandamuna",
  ],
  cannot_drink: [
    "ne peut pas boire", "ne peut plus boire", "refuse de boire", "ne tète plus", "ne tete plus", "refuse de téter", "impossible de boire",
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
    "makila mingi", "makila ebimi mingi",
    "damu nyingi", "anavuja damu",
    "menga mingi",
    "mashi a bungi",
  ],
  very_cold: [
    "corps très froid", "corps tres froid", "glacé", "glace comme", "hypothermie", "fièvre très élevée", "fievre tres elevee", "peau très chaude", "brûlant", "brulant",
    "nzoto ya malili makasi", "nzoto ya moto makasi",
    "mwili baridi sana", "mwili moto sana",
    "nitu ya madidi mingi", "nitu ya mwini mingi",
    "mubidi wa mashika bikole", "mubidi wa luya bikole",
  ],
};

/** Danger-sign option values recognised in a free-text message. */
export function detectDangerSigns(text: string): string[] {
  const t = text.toLowerCase();
  return Object.entries(DANGER_SIGN_KEYWORDS)
    .filter(([, keys]) => keys.some((k) => t.includes(k)))
    .map(([value]) => value);
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
  | "mariage_precoce";

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
  auto_agression: [
    "me suicider", "suicide", "me tuer", "en finir avec la vie", "je veux mourir", "je veux me faire du mal", "me faire du mal", "plus envie de vivre", "j'ai avalé", "j'ai bu du poison",
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
  const t = text.toLowerCase();
  const categories: SafeguardingCategory[] = [];
  const matchedTerms: string[] = [];
  for (const [category, keys] of Object.entries(SAFEGUARDING_KEYWORDS) as Array<[SafeguardingCategory, string[]]>) {
    const hits = keys.filter((k) => t.includes(k));
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
