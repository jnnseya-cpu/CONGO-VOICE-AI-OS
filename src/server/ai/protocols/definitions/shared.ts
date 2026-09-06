/**
 * Building blocks shared by the ten health protocols: the five-language text helper,
 * the standard danger-sign vocabulary and the default outcome set.
 *
 * Translations are drafted for review: every protocol carries
 * approvedBy = "En attente du Comité de Revue Clinique" until the CRB signs it off.
 */
import type { LocalisedText, ProtocolOption, ProtocolOutcome, OutcomeKey } from "../types";

/** fr, ln (lingala), kg (kikongo), sw (swahili congolais), lua (tshiluba). */
export function t(fr: string, ln: string, kg: string, sw: string, lua: string): LocalisedText {
  return { fr, ln, kg, sw, lua };
}

export function option(value: string, label: LocalisedText): ProtocolOption {
  return { value, label };
}

export const YES_NO_ASK_SUFFIX = t("Oui ou non ?", "Iyo to te ?", "Ee to ve ?", "Ndiyo au hapana ?", "Eyowa anyi tòo ?");

/** IMCI general danger signs, used by several protocols. */
export const DANGER_OPTIONS: ProtocolOption[] = [
  option("convulsions", t("Convulsions ou crises", "Kobeta nzoto / convulsions", "Kunikana ya ngolo / convulsions", "Degedege au kifafa", "Kutshinguluka kua mubidi / convulsions")),
  option("unconscious", t("Inconscience, ne réagit plus, très endormi", "Azali koyanola te, alali makasi", "Ke vutula ve, ke lala ngolo", "Kupoteza fahamu, halijibu, usingizi mzito", "Kavua wandamuna to, ulala bikole")),
  option("cannot_drink", t("Ne peut plus boire ni téter", "Akoki komela te", "Ke nwa ve, ke nwa mabele ve", "Hawezi kunywa wala kunyonya", "Kavua mua kunua anyi kuamua to")),
  option("vomits_everything", t("Vomit tout ce qu'il avale", "Azali kosanza nyonso", "Ke luka yonso", "Anatapika kila kitu", "Udi ulua bionso")),
  option("breathing_difficulty", t("Respire très difficilement", "Akoki kopema malamu te", "Ke pema mpasi", "Anapumua kwa shida sana", "Udi upetesha lupepele bikole")),
  option("stiff_neck", t("Nuque raide", "Nkingo ekangami", "Nsingu me kangama", "Shingo ngumu", "Nshingu mukole")),
  option("heavy_bleeding", t("Saignement abondant", "Makila ebimi mingi", "Menga mingi ke basika", "Damu nyingi inatoka", "Mashi a bungi adi apatuka")),
  option("very_cold", t("Corps très froid ou très chaud", "Nzoto ya malili makasi to moto makasi", "Nitu ya madidi mingi to mwini mingi", "Mwili baridi sana au moto sana", "Mubidi wa mashika bikole anyi wa luya bikole")),
  option("none", t("Aucun de ces signes", "Elembo moko te", "Ata kidimbu mosi ve", "Hakuna dalili yoyote", "Katshina tshimanyinu")),
];

export const DANGER_ASK = t(
  "Est-ce que la personne présente un de ces signes : convulsions, inconscience, impossibilité de boire, vomissements de tout, respiration très difficile, nuque raide, saignement abondant, corps très froid ou très chaud ?",
  "Moto azali na moko ya bilembo oyo : kobeta nzoto, kolala makasi, kokoka komela te, kosanza nyonso, kopema mpasi, nkingo ekangami, makila mingi, nzoto ya malili to moto makasi ?",
  "Muntu kele na kidimbu mosi ya yayi : kunikana, kulala ngolo, kukonda kunwa, kuluka yonso, kupema mpasi, nsingu me kangama, menga mingi, nitu ya madidi to mwini mingi ?",
  "Je mtu ana mojawapo ya dalili hizi: degedege, kupoteza fahamu, kushindwa kunywa, kutapika kila kitu, kupumua kwa shida sana, shingo ngumu, damu nyingi, mwili baridi sana au moto sana?",
  "Muntu udi ne tshimanyinu tshimue tshia eyi: kutshinguluka, kulala bikole, kupanga kunua, kulua bionso, kupetesha lupepele bikole, nshingu mukole, mashi a bungi, mubidi wa mashika anyi wa luya bikole?",
);

const BASE_OUTCOMES: Record<OutcomeKey, ProtocolOutcome> = {
  severity_4: {
    action: "REFER_EMERGENCY_NOW",
    text: t(
      "Allez tout de suite au centre de santé ou à l'hôpital le plus proche. Ne restez pas à la maison. Faites-vous accompagner pour le transport.",
      "Kende sikoyo na centre de santé to lopitalo ya pene. Kotikala na ndako te. Bosala ete moto mosusu akende na yo.",
      "Kwenda ntangu yayi na centre de santé to lupitalu ya pene-pene. Kubikala na nzo ve. Baka muntu ya nkaka sambu na nzila.",
      "Nenda sasa hivi kwenye kituo cha afya au hospitali iliyo karibu. Usibaki nyumbani. Nenda na mtu wa kukusaidia safarini.",
      "Ndaku mpindieu ku tshibambalu tshia bukolame anyi ku lupitadi lua pabuipi. Kushala ku nzubu to. Yaya ne muntu mukuabu bua luendu.",
    ),
  },
  severity_3: {
    action: "GO_CLINIC_TODAY",
    text: t(
      "Allez au centre de santé aujourd'hui même. Emportez le carnet de santé. Si l'état empire avant d'arriver, partez immédiatement.",
      "Kende na centre de santé lelo kaka. Kamata carnet ya santé. Soki ezali kobeba, kende mbala moko.",
      "Kwenda na centre de santé bubu kibeni. Baka mukanda ya bukolele. Kana mambu me beba, kwenda ntangu yayi.",
      "Nenda kituo cha afya leo hii. Chukua kadi ya afya. Hali ikizidi kuwa mbaya, nenda mara moja.",
      "Ndaku ku tshibambalu tshia bukolame lelu. Angata mukanda wa bukolame. Bikala bualu bunyanguke, ndaku mpindieu.",
    ),
  },
  severity_2: {
    action: "GO_CLINIC_24H",
    text: t(
      "Allez au centre de santé dans les 24 heures. En attendant, faites boire souvent de l'eau propre et surveillez les signes de danger.",
      "Kende na centre de santé na kati ya ngonga 24. Na ntango wana, pesa mai ya peto mbala mingi mpe tala bilembo ya likama.",
      "Kwenda na centre de santé na kati ya bangunga 24. Na ntangu yina, pesa masa ya bunkete mbala mingi mpi tala bidimbu ya kigonsa.",
      "Nenda kituo cha afya ndani ya saa 24. Wakati huo, mnywesheni maji safi mara kwa mara na angalia dalili za hatari.",
      "Ndaku ku tshibambalu tshia bukolame munda mua midi 24. Mu tshikondo etshi, nuisha mâyi mimpe misangu ya bungi ne tangila bimanyinu bia njiwu.",
    ),
  },
  severity_1: {
    action: "MONITOR_AT_HOME",
    text: t(
      "Surveillez à la maison pendant deux jours : faites boire souvent, continuez à manger, contrôlez la température. Allez au centre de santé dès qu'un signe de danger apparaît.",
      "Tala na ndako mikolo mibale : pesa mai mbala mingi, kolia se kolia, tala moto ya nzoto. Kende na centre de santé soki elembo ya likama ebimi.",
      "Tala na nzo bilumbu zole : pesa masa mbala mingi, landa kudia, tala mwini ya nitu. Kwenda na centre de santé kana kidimbu ya kigonsa me basika.",
      "Fuatilia nyumbani kwa siku mbili: mnywesheni maji mara kwa mara, endelea kula, pima homa. Nenda kituo cha afya dalili ya hatari ikitokea.",
      "Tangila ku nzubu matuku abidi: nuisha mâyi misangu ya bungi, tungunuka kudia, pima luya lua mubidi. Ndaku ku tshibambalu tshia bukolame bikala tshimanyinu tshia njiwu tshimueneke.",
    ),
  },
  severity_0: {
    action: "SELF_CARE",
    text: t(
      "Vous pouvez prendre soin de la personne à la maison : repos, eau propre en petites quantités et souvent, alimentation normale. Revenez vers le service si quelque chose change.",
      "Okoki kobatela moto na ndako : kopema, mai ya peto moke moke mbala mingi, kolia lokola momesano. Zonga soki eloko ebongwani.",
      "Nge lenda kutala muntu na nzo : kupema, masa ya bunkete fioti-fioti mbala mingi, kudia bonso mpila ya mbote. Vutuka kana kima me soba.",
      "Unaweza kumhudumia nyumbani: pumziko, maji safi kidogo kidogo mara kwa mara, chakula cha kawaida. Rudi kwenye huduma hali ikibadilika.",
      "Udi mua kulama muntu ku nzubu: kuikisha, mâyi mimpe bitupa bikese misangu ya bungi, biakudia bia kashidi. Pingana bikala bualu bushintuluke.",
    ),
  },
};

/** Default outcome set with optional per-protocol overrides (action-first wording, HEA-001). */
export function outcomes(overrides: Partial<Record<OutcomeKey, ProtocolOutcome>> = {}): Record<OutcomeKey, ProtocolOutcome> {
  return {
    severity_0: overrides.severity_0 ?? BASE_OUTCOMES.severity_0,
    severity_1: overrides.severity_1 ?? BASE_OUTCOMES.severity_1,
    severity_2: overrides.severity_2 ?? BASE_OUTCOMES.severity_2,
    severity_3: overrides.severity_3 ?? BASE_OUTCOMES.severity_3,
    severity_4: overrides.severity_4 ?? BASE_OUTCOMES.severity_4,
  };
}

export const APPROVED_BY = "En attente du Comité de Revue Clinique";

/* ---------------------------------------------------------------------------------------
 * Frequently reused questions
 * ------------------------------------------------------------------------------------- */

export const ASK_AGE_MONTHS = t(
  "Quel âge a la personne malade, en mois ?",
  "Moto oyo azali na maladi azali na sanza boni ?",
  "Muntu ya kimbefo kele na bangonda ikwa ?",
  "Mgonjwa ana umri gani, kwa miezi ?",
  "Muntu udi ne disama udi ne ngondo bungi kayi ?",
);

export const ASK_FEVER_DAYS = t(
  "Depuis combien de jours la fièvre dure-t-elle ?",
  "Fièvre ezali banda mikolo boni ?",
  "Mwini ya nitu kele banda bilumbu ikwa ?",
  "Homa imedumu kwa siku ngapi ?",
  "Luya lua mubidi ludi luenza matuku bungi kayi ?",
);

export const ASK_DURATION_DAYS = t(
  "Depuis combien de jours cela dure-t-il ?",
  "Likambo yango ezali banda mikolo boni ?",
  "Diambu yina kele banda bilumbu ikwa ?",
  "Hali hii imedumu kwa siku ngapi ?",
  "Bualu ebu budi buenza matuku bungi kayi ?",
);

export const ASK_MALARIA_TEST = t(
  "Un test de paludisme a-t-il été fait ? Positif, négatif, ou pas encore fait ?",
  "Basalaki test ya palu ? Ezali positif, négatif, to esalemi naino te ?",
  "Bo salaka test ya palu ? Yo kele positif, négatif, to yo salamaka ntete ve ?",
  "Kipimo cha malaria kimefanyika ? Chanya, hasi, au bado ?",
  "Bakadi benza teste wa malaria ? Udi mubi, kena mubi, anyi kabayi benza ?",
);

export const MALARIA_TEST_OPTIONS: ProtocolOption[] = [
  option("positive", t("Test positif", "Test positif", "Test positif", "Kipimo chanya", "Teste mubi")),
  option("negative", t("Test négatif", "Test négatif", "Test négatif", "Kipimo hasi", "Teste kena mubi")),
  option("not_done", t("Pas encore fait", "Esalemi naino te", "Yo salamaka ntete ve", "Bado hakijafanyika", "Kabayi benza")),
];

const DANGER_LABELS: Record<string, string> = {
  convulsions: "Convulsions",
  unconscious: "Inconscience / léthargie",
  cannot_drink: "Impossibilité de boire ou de téter",
  vomits_everything: "Vomissements de tout",
  breathing_difficulty: "Détresse respiratoire",
  stiff_neck: "Nuque raide",
  heavy_bleeding: "Saignement abondant",
  very_cold: "Hypothermie ou hyperthermie",
};

/** The eight IMCI general danger signs as red-flag rules, prefixed per protocol. */
export function dangerRedFlags(prefix: string, questionId = "danger_signs") {
  return Object.entries(DANGER_LABELS).map(([value, label]) => ({
    id: `RF-${prefix}-${value.toUpperCase().replace(/_/g, "-")}`,
    when: { q: questionId, op: "includes" as const, value },
    label,
  }));
}

export const ON_RED_FLAG = { severity: 4 as const, action: "REFER_EMERGENCY_NOW" };
