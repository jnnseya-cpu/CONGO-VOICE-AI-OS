/**
 * Channel prompts in the five platform languages.
 *
 * French is canonical; the other four are fixed, reviewed strings rather than model
 * output, because they are spoken to citizens in menus and emergencies where a
 * mistranslation is a safety problem. Free-form answers still go through `localise()`.
 */
import type { LanguageCode, ModuleType } from "@/lib/db/schema";

export const LANGUAGES: LanguageCode[] = ["fr", "ln", "kg", "sw", "lua"];

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  fr: "Français",
  ln: "Lingala",
  kg: "Kikongo",
  sw: "Kiswahili",
  lua: "Tshiluba",
};

/** DTMF / USSD digit → language (FR-CH-02). */
export const LANGUAGE_BY_DIGIT: Record<string, LanguageCode> = { "1": "fr", "2": "ln", "3": "kg", "4": "sw", "5": "lua" };

/** DTMF / USSD digit → module (FR-CH-02 fallback 1/2/3). */
export const MODULE_BY_DIGIT: Record<string, ModuleType> = { "1": "health", "2": "agriculture", "3": "education" };

export function digitForLanguage(language: LanguageCode): string {
  return Object.entries(LANGUAGE_BY_DIGIT).find(([, l]) => l === language)?.[0] ?? "1";
}

type Dict = Record<LanguageCode, string>;

const S = {
  /** Short greeting, spoken in one language at a time so the call starts inside 6 s. */
  greeting: {
    fr: "Bonjour, ici Congo Voice, votre service d'information santé, agriculture et éducation.",
    ln: "Mbote, awa Congo Voice, service na yo ya santé, bilanga mpe kelasi.",
    kg: "Mbote, awa Congo Voice, kisalu na nge ya mavimpi, bilanga ti nzo-nkanda.",
    sw: "Habari, hapa Congo Voice, huduma yako ya afya, kilimo na elimu.",
    lua: "Moyo, apa Congo Voice, mudimu webe wa makanda, madimi ne kalasa.",
  } satisfies Dict,
  languageMenu: {
    fr: "Choisissez votre langue : dites français, ou appuyez sur 1. Lingala, 2. Kikongo, 3. Kiswahili, 4. Tshiluba, 5.",
    ln: "Poná monoko na yo : lifalanse, finá 1. Lingala, 2. Kikongo, 3. Kiswahili, 4. Tshiluba, 5.",
    kg: "Sola ndinga na nge : kifalansa, fina 1. Lingala, 2. Kikongo, 3. Kiswahili, 4. Tshiluba, 5.",
    sw: "Chagua lugha yako : Kifaransa, bonyeza 1. Lingala, 2. Kikongo, 4 kwa Kiswahili, Tshiluba 5.",
    lua: "Sungula muakulu webe : tshifalansa, ofina 1. Lingala, 2. Kikongo, 3. Kiswahili, 4. Tshiluba, 5.",
  } satisfies Dict,
  openQuestion: {
    fr: "Dites en quelques mots ce dont vous avez besoin. Ou appuyez sur 1 pour la santé, 2 pour l'agriculture, 3 pour l'éducation.",
    ln: "Lobá na maloba moke likambo nini olingi. To finá 1 mpo na santé, 2 mpo na bilanga, 3 mpo na kelasi.",
    kg: "Tuba na mambu fioti mambu ya nge kele na yo mfunu. To fina 1 sambu na mavimpi, 2 sambu na bilanga, 3 sambu na nzo-nkanda.",
    sw: "Sema kwa maneno machache unachohitaji. Au bonyeza 1 kwa afya, 2 kwa kilimo, 3 kwa elimu.",
    lua: "Amba mu mêyi makese tshiudi nautshi. Anyi ofina 1 bua makanda, 2 bua madimi, 3 bua kalasa.",
  } satisfies Dict,
  recordPrompt: {
    fr: "Posez votre question après le bip, puis restez silencieux un instant.",
    ln: "Tuná motuna na yo sima ya bip, na sima fanda nyee mwa moke.",
    kg: "Yula ngiufula na nge na nima ya bip, na nima vanda pi fioti.",
    sw: "Uliza swali lako baada ya mlio, kisha nyamaza kidogo.",
    lua: "Ela lukonko luebe panyima pa dîyi, pashishe ikala mputu katupa.",
  } satisfies Dict,
  continuePrompt: {
    fr: "Voulez-vous que je continue ? Dites oui, ou appuyez sur 1.",
    ln: "Olingi nakoba? Lobá iyo, to finá 1.",
    kg: "Nge zola nde mono landa? Tuba ee, to fina 1.",
    sw: "Ungependa niendelee ? Sema ndiyo, au bonyeza 1.",
    lua: "Udi musue ntungunuke ? Amba eyowa, anyi ofina 1.",
  } satisfies Dict,
  continueHint: {
    fr: "Répondez CONTINUER pour la suite.",
    ln: "Zongisá CONTINUER mpo na oyo etikali.",
    kg: "Vutula CONTINUER sambu na yina me bikala.",
    sw: "Jibu CONTINUER kwa sehemu iliyobaki.",
    lua: "Andamuna CONTINUER bua bidi bishala.",
  } satisfies Dict,
  resumePrefix: {
    fr: "La dernière fois, nous parlions de :",
    ln: "Mbala eleki, tozalaki kolobela :",
    kg: "Mbala ya nsuka, beto vandaka kutuba :",
    sw: "Mara ya mwisho, tulikuwa tunazungumzia :",
    lua: "Musangu wa ndekelu, tuvua tuakula bua :",
  } satisfies Dict,
  resumeQuestion: {
    fr: "Voulez-vous reprendre ? Appuyez sur 1 pour continuer, 2 pour une nouvelle question.",
    ln: "Olingi kokoba? Finá 1 mpo na kokoba, 2 mpo na motuna ya sika.",
    kg: "Nge zola kulanda? Fina 1 sambu na kulanda, 2 sambu na ngiufula ya mpa.",
    sw: "Ungependa kuendelea ? Bonyeza 1 kuendelea, 2 kwa swali jipya.",
    lua: "Udi musue kutungunuka ? Ofina 1 bua kutungunuka, 2 bua lukonko lupialupia.",
  } satisfies Dict,
  sharedPhone: {
    fr: "Ce téléphone est-il partagé ? Cette question est-elle pour vous, ou pour une autre personne ?",
    ln: "Telefone oyo ezali ya bino mingi? Motuna oyo ezali mpo na yo, to mpo na moto mosusu?",
    kg: "Telefone yai kele ya bantu mingi? Ngiufula yai kele sambu na nge, to sambu na muntu ya nkaka?",
    sw: "Simu hii inatumiwa na watu wengi ? Swali hili ni lako, au la mtu mwingine ?",
    lua: "Telefone eu udi wa bantu ba bungi ? Lukonko elu ludi luebe, anyi lua muntu mukuabo ?",
  } satisfies Dict,
  optOutAck: {
    fr: "C'est noté : vous ne recevrez plus de messages. Répondez START pour revenir.",
    ln: "Endimami : okozwa lisusu ba message te. Zongisá START mpo na kozonga.",
    kg: "Me ndima : nge ta baka diaka bansangu ve. Vutula START sambu na kuvutuka.",
    sw: "Imepokelewa : hutapokea tena ujumbe. Jibu START kurudi.",
    lua: "Bianyishibua : kuena kupeta kabidi mikenji. Andamuna START bua kupingana.",
  } satisfies Dict,
  optInAck: {
    fr: "Bon retour. Vous recevrez à nouveau nos messages.",
    ln: "Boyei malamu. Okozwa lisusu ba message na biso.",
    kg: "Kuvutuka mbote. Nge ta baka diaka bansangu na beto.",
    sw: "Karibu tena. Utapokea tena ujumbe wetu.",
    lua: "Walua bimpe. Neupete kabidi mikenji yetu.",
  } satisfies Dict,
  noInput: {
    fr: "Je n'ai rien entendu. Réessayons.",
    ln: "Nayoki eloko te. Tomeka lisusu.",
    kg: "Mono waka kima ve. Beto meka diaka.",
    sw: "Sikusikia chochote. Tujaribu tena.",
    lua: "Tshiena muumvue tshintu. Tuteta kabidi.",
  } satisfies Dict,
  goodbye: {
    fr: "Merci d'avoir appelé Congo Voice. Prenez soin de vous.",
    ln: "Matondi mpo obengi Congo Voice. Bomba nzoto malamu.",
    kg: "Matondo sambu nge bokilaka Congo Voice. Tala nitu na nge mbote.",
    sw: "Asante kwa kupiga simu Congo Voice. Jitunze.",
    lua: "Tuasakidila bua diakubikila Congo Voice. Dilame bimpe.",
  } satisfies Dict,
  smsSent: {
    fr: "Merci. La réponse vous est envoyée par SMS.",
    ln: "Matondi. Eyano ekotindama epai na yo na SMS.",
    kg: "Matondo. Mvutu ta tindama na nge na SMS.",
    sw: "Asante. Jibu litatumwa kwako kwa SMS.",
    lua: "Tuasakidila. Diandamuna nediitumibue kuudi ku SMS.",
  } satisfies Dict,
  moduleMenu: {
    fr: "1. Santé\n2. Agriculture\n3. Éducation",
    ln: "1. Santé\n2. Bilanga\n3. Kelasi",
    kg: "1. Mavimpi\n2. Bilanga\n3. Nzo-nkanda",
    sw: "1. Afya\n2. Kilimo\n3. Elimu",
    lua: "1. Makanda\n2. Madimi\n3. Kalasa",
  } satisfies Dict,
  chooseModule: {
    fr: "Choisissez un thème :",
    ln: "Poná likambo :",
    kg: "Sola diambu :",
    sw: "Chagua mada :",
    lua: "Sungula bualu :",
  } satisfies Dict,
  chooseQuestion: {
    fr: "Choisissez une question :",
    ln: "Poná motuna :",
    kg: "Sola ngiufula :",
    sw: "Chagua swali :",
    lua: "Sungula lukonko :",
  } satisfies Dict,
  otherQuestion: {
    fr: "0. Autre question par SMS",
    ln: "0. Motuna mosusu na SMS",
    kg: "0. Ngiufula ya nkaka na SMS",
    sw: "0. Swali lingine kwa SMS",
    lua: "0. Lukonko lukuabo ku SMS",
  } satisfies Dict,
  invalidChoice: {
    fr: "Choix invalide.",
    ln: "Poná ya mabe.",
    kg: "Nsola ya mbi.",
    sw: "Chaguo si sahihi.",
    lua: "Disungula kadiakane.",
  } satisfies Dict,
  sessionExpired: {
    fr: "La session a expiré. Recomposez le code pour recommencer.",
    ln: "Session esili. Beta code lisusu mpo na kobanda.",
    kg: "Session me mana. Beta code diaka sambu na kuyantika.",
    sw: "Kipindi kimeisha. Piga msimbo tena kuanza.",
    lua: "Tshikondo tshiakujika. Kuma nomba kabidi bua kutuadija.",
  } satisfies Dict,
  welcomeText: {
    fr: "Bienvenue sur Congo Voice. Posez votre question sur la santé, l'agriculture ou l'école — par écrit ou en note vocale.",
    ln: "Boyei malamu na Congo Voice. Tuná motuna na yo ya santé, bilanga to kelasi — na makomi to na mongongo.",
    kg: "Boyei mbote na Congo Voice. Yula ngiufula na nge ya mavimpi, bilanga to nzo-nkanda — na masonuku to na nzwenga.",
    sw: "Karibu Congo Voice. Uliza swali lako kuhusu afya, kilimo au shule — kwa maandishi au ujumbe wa sauti.",
    lua: "Wetu Congo Voice. Ela lukonko luebe bua makanda, madimi anyi kalasa — mu mafunda anyi mu dîyi.",
  } satisfies Dict,
  yes: { fr: "Oui", ln: "Iyo", kg: "Ee", sw: "Ndiyo", lua: "Eyowa" } satisfies Dict,
  no: { fr: "Non", ln: "Te", kg: "Ve", sw: "Hapana", lua: "Tòo" } satisfies Dict,
  forMe: {
    fr: "Pour moi",
    ln: "Mpo na ngai",
    kg: "Sambu na mono",
    sw: "Kwa ajili yangu",
    lua: "Bua meme",
  } satisfies Dict,
  forSomeoneElse: {
    fr: "Pour une autre personne",
    ln: "Mpo na moto mosusu",
    kg: "Sambu na muntu ya nkaka",
    sw: "Kwa mtu mwingine",
    lua: "Bua muntu mukuabo",
  } satisfies Dict,
} as const;

export type StringKey = keyof typeof S;

export function t(key: StringKey, language: LanguageCode = "fr"): string {
  const dict = S[key] as Dict;
  return dict[language] ?? dict.fr;
}

export const MODULE_LABELS: Record<ModuleType, Dict> = {
  health: { fr: "Santé", ln: "Santé", kg: "Mavimpi", sw: "Afya", lua: "Makanda" },
  agriculture: { fr: "Agriculture", ln: "Bilanga", kg: "Bilanga", sw: "Kilimo", lua: "Madimi" },
  education: { fr: "Éducation", ln: "Kelasi", kg: "Nzo-nkanda", sw: "Elimu", lua: "Kalasa" },
  general: { fr: "Accueil", ln: "Boyambi", kg: "Kuyamba", sw: "Mapokezi", lua: "Diakidila" },
};

export function moduleLabel(module: ModuleType, language: LanguageCode = "fr"): string {
  return MODULE_LABELS[module][language] ?? MODULE_LABELS[module].fr;
}

/** Speech synthesis / Twilio <Say> language codes; French is the fallback voice. */
export function sayLanguage(language: LanguageCode): "fr-FR" | "sw-KE" {
  return language === "sw" ? "sw-KE" : "fr-FR";
}
