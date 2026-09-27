/**
 * The emergency core, shared by the server and the device.
 *
 * These constants and the matching that goes with them used to live inside
 * src/server/ai/safety.ts, which meant the browser could not reach them. That was
 * the wrong boundary for this platform. A caregiver on a failing connection is
 * the normal case here, not the edge case: when the request cannot leave the
 * handset, the handset still knows the danger-sign phrases and still holds the
 * reviewed instruction in five languages, and it should say it rather than
 * showing the citizen a browser's error string in English.
 *
 * Nothing here touches the network, the database or any secret. The server
 * re-exports every name from safety.ts, so this is a move, not a second copy:
 * there is still exactly one place where the wording of an emergency lives.
 */
import type { LanguageCode } from "@shared/types";

export function normaliseForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function folded(list: string[]): string[] {
  return list.map(normaliseForMatching);
}

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
    /*
     * Conjugated forms, taken from this platform's own approved emergency
     * script. EMERGENCY_EN_ROUTE tells a caregiver in Lingala "Soki makila
     * ezali kobima, fina makasi na mpota" — so that is how the platform itself
     * says "blood is coming out" — yet the list only matched "makila mingi",
     * two words that a speaker separates with a verb. The consequence was not
     * theoretical: "Makila ezali kobima mingi epai ya mwasi na ngai, azali
     * kobota" — heavy bleeding in a woman in labour — was scored severity 1,
     * monitor at home. Each phrase below appears verbatim in the reviewed
     * script for its language.
     */
    "makila ezali kobima", "menga ke basika", "mashi apatuka",
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

export const EMERGENCY_MESSAGES: Record<LanguageCode, string> = {
  fr: "Signes de danger détectés : allez au centre de santé le plus proche maintenant, sans attendre.",
  ln: "Bilembo ya likama emonani : kende na lopitalo to centre de santé sikoyo, kozela te.",
  kg: "Bidimbu ya kigonsa me monika : kwenda na lupitalu ya pene-pene sasa, kuvingila ve.",
  sw: "Dalili za hatari zimeonekana : nenda kituo cha afya kilicho karibu sasa hivi, usisubiri.",
  lua: "Bimanyinu bia njiwu bidi bimueneka : ndaku ku lupitadi lua pabuipi mpindieu, kuindila.",
};
export const EMERGENCY_EN_ROUTE: Record<LanguageCode, string> = {
  fr: "Ne restez pas à la maison et faites-vous accompagner. Pendant le trajet : allongez la personne sur le côté si elle est somnolente ou si elle vomit, ne lui donnez rien à boire ni à manger si elle ne réagit pas bien, gardez-la au chaud et desserrez ses vêtements. En cas de saignement, appuyez fort sur la plaie avec un linge propre sans jamais le retirer. Emportez le carnet de santé et les médicaments déjà pris.",
  ln: "Kotikala na ndako te mpe sala ete moto mosusu akende na yo. Na nzela : lalisa moto na mopanzi soki alali makasi to azali kosanza, kopesa ye eloko ya komela to ya kolia te soki azali koyanola malamu te, batela ye moto mpe fungola bilamba na ye. Soki makila ezali kobima, fina makasi na mpota na elamba ya peto mpe kolongola yango te. Kamata carnet ya santé mpe bakisi oyo asili komela.",
  kg: "Kubikala na nzo ve mpi sala nde muntu ya nkaka kwenda ti nge. Na nzila : lalisa muntu na lweka kana yandi ke lala ngolo to ke luka, kupesa yandi kima ya kunwa to ya kudia ve kana yandi ke vutula mbote ve, bumba yandi mwini mpi kangula bilele na yandi. Kana menga ke basika, fina ngolo na mputa ti dilele ya bunkete mpi kukatula yo ve. Baka mukanda ya bukolele ti bankisi yina yandi me nwa.",
  sw: "Usibaki nyumbani na nenda na mtu wa kukusaidia. Njiani: mlaze mtu kwa ubavu ikiwa ana usingizi mzito au anatapika, usimpe chochote cha kunywa au kula kama hajibu vizuri, mwekeni joto na mlegeze nguo. Kama kuna damu, bonyeza kwa nguvu jeraha kwa kitambaa safi bila kukiondoa. Chukua kadi ya afya na dawa alizotumia.",
  lua: "Kushala ku nzubu to ne yaya ne muntu mukuabu. Mu njila: lalika muntu ku luseke bikala ulala bikole anyi udi ulua, kumupesha tshintu tshia kunua anyi tshia kudia to bikala kayi wandamuna bimpe, mulame ne luya ne mutuluile bilamba. Bikala mashi apatuka, kuata mputa ne bukole ne tshilamba tshimpe kabiyi kutshiumbula. Angata mukanda wa bukolame ne manga akadiye munue.",
};

export const EMERGENCY_INSTRUCTIONS: Record<LanguageCode, string> = {
  fr: `${EMERGENCY_MESSAGES.fr} ${EMERGENCY_EN_ROUTE.fr}`,
  ln: `${EMERGENCY_MESSAGES.ln} ${EMERGENCY_EN_ROUTE.ln}`,
  kg: `${EMERGENCY_MESSAGES.kg} ${EMERGENCY_EN_ROUTE.kg}`,
  sw: `${EMERGENCY_MESSAGES.sw} ${EMERGENCY_EN_ROUTE.sw}`,
  lua: `${EMERGENCY_MESSAGES.lua} ${EMERGENCY_EN_ROUTE.lua}`,
};
export const FACILITY_UNKNOWN_NOTE: Record<LanguageCode, string> = {
  fr: "Je ne connais pas encore la structure de santé la plus proche de chez vous : demandez au relais communautaire ou dirigez-vous vers le centre de santé que vous connaissez.",
  ln: "Nayebi naino centre de santé ya pene na ndako na yo te : tuna relais communautaire to kende na centre de santé oyo oyebi.",
  kg: "Mono me zaba ntete ve centre de santé ya pene-pene ti nzo na nge : yula relais communautaire to kwenda na centre de santé yina nge zaba.",
  sw: "Bado sijui kituo cha afya kilicho karibu nawe zaidi: muulize mhudumu wa jamii au nenda kwenye kituo cha afya unachokijua.",
  lua: "Tshiena panu mumanye tshibambalu tshia bukolame tshia pabuipi ne nzubu webe to: ebeja mutuadilangana wa mu tshimenga anyi ndaku ku tshibambalu tshiudi mumanye.",
};

const AMBIGUOUS_FOR_ROUTING: ReadonlySet<string> = new Set([
  // Ordinary French senses: a food crisis, a burning sun, a yellowing field,
  // an unanswered message, a print run, a confused pupil.
  "crise", "crises", "tremble", "confus", "confuse", "délire", "il délire", "elle délire",
  "tirage", "brûlant", "brulant", "glace comme", "tout jaune", "toute jaune",
  "ne repond", "ne répond", "paleur", "pâleur",
  // Sleep descriptions, which a teacher uses about a drowsy pupil.
  "somnolent", "très endormi", "dort tout le temps", "reste endormi", "toujours endormi",
  "alali makasi", "usingizi mzito",
  // "does not answer" in the platform languages: said of a phone as often as a child.
  "azali koyanola te", "ke vutula ve", "kena wandamuna", "hajibu",
  // Trembling and lost colour, which describe fear, cold and cloth as readily as a child.
  "anatetemeka", "rangi imeisha",
]);

/**
 * Emergencies that are not danger-sign options but must still route.
 * Written out in full rather than as stems, because routing matches on whole
 * words — see containsPhrase.
 */
const ROUTING_EXTRAS: readonly string[] = [
  "morsure de serpent",
  "mordu par un serpent",
  "nyoka aswi",
  "nyoka ameuma",
  "empoisonné",
  "empoisonnée",
  "empoisonnement",
  "a été empoisonné",
];

export const ROUTING_DANGER_PHRASES: readonly string[] = Array.from(
  new Set([
    ...Object.values(DANGER_SIGN_KEYWORDS).flat().filter((k) => !AMBIGUOUS_FOR_ROUTING.has(k)),
    ...ROUTING_EXTRAS,
  ]),
);

const ROUTING_DANGER_FOLDED: readonly string[] = folded([...ROUTING_DANGER_PHRASES]);

/**
 * Whole-word containment.
 *
 * Routing matches on word boundaries; triage does not. That difference is the
 * point, and it cost a test to learn: "Les feuilles de mon manioc jaunissent" —
 * a photograph of a yellowing cassava leaf — contains "jaunisse", the word for
 * jaundice, and a plain substring match sent a farmer's crop question into
 * paediatric triage.
 *
 * Inside the health module a loose match is the safer error: "ses yeux
 * jaunissent" should reach the jaundice sign, and DANGER_SIGN_KEYWORDS is tuned
 * for that. Choosing the module is the opposite problem, where a loose match
 * opens a clinical case nobody asked for. So this is used here and deliberately
 * not in detectDangerSigns.
 */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const letter = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  for (let from = 0; ; ) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    if (!letter(haystack[at - 1]) && !letter(haystack[at + needle.length])) return true;
    from = at + 1;
  }
}

export function detectRoutingDangerSigns(text: string): string[] {
  const t = normaliseForMatching(text);
  return ROUTING_DANGER_PHRASES.filter((_, i) => containsPhrase(t, ROUTING_DANGER_FOLDED[i]));
}
