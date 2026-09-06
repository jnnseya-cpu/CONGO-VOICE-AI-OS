/** Acute malnutrition screening by mid-upper arm circumference (MUAC / PB). */
import type { HealthProtocol } from "../types";
import { APPROVED_BY, ASK_AGE_MONTHS, DANGER_ASK, DANGER_OPTIONS, ON_RED_FLAG, dangerRedFlags, outcomes, t } from "./shared";

export const malnutritionScreening: HealthProtocol = {
  id: "malnutrition_screening",
  version: "1.0.0",
  title: "Dépistage de la malnutrition aiguë (périmètre brachial)",
  approvedBy: APPROVED_BY,
  module: "health",
  citations: ["KB-HE-NUTR-01", "KB-HE-TRIAGE-01"],
  selfCareContentIds: ["KB-HE-NUTR-01"],
  entry: "danger_signs",
  defaultSeverity: 0,
  questions: {
    danger_signs: {
      id: "danger_signs",
      ask: DANGER_ASK,
      type: "multi_yes_no",
      options: DANGER_OPTIONS,
      redFlags: dangerRedFlags("MAL"),
      onRedFlag: ON_RED_FLAG,
      next: "oedema",
    },
    oedema: {
      id: "oedema",
      ask: t(
        "Quand vous appuyez dix secondes avec le pouce sur le dessus des deux pieds, le creux reste-t-il ?",
        "Soki ofini na mosapi ya monene sekondi zomi likolo ya makolo mibale, libulu etikali ?",
        "Kana nge ke fina ti nsapi ya nene sekunde kumi na zulu ya makulu zole, dibulu ke bikala ?",
        "Ukibonyeza kwa kidole gumba sekunde kumi juu ya miguu yote miwili, shimo linabaki ?",
        "Padi ukuata ne tshinu tshinene sekonde dikumi pa makasa abidi, dibue didi dishala ?",
      ),
      type: "yes_no",
      redFlags: [{ id: "RF-MAL-BILATERAL-OEDEMA", when: { q: "oedema", op: "eq", value: true }, label: "Œdèmes bilatéraux prenant le godet (kwashiorkor)" }],
      onRedFlag: ON_RED_FLAG,
      next: "muac_mm",
    },
    muac_mm: {
      id: "muac_mm",
      ask: t(
        "Quelle est la mesure du bracelet MUAC au milieu du bras gauche, en millimètres ? Rouge, jaune ou vert si vous n'avez pas le chiffre.",
        "Bandeau MUAC ezali kolakisa boni na katikati ya loboko ya mwasi, na millimètres ? Motane, mbuma to ya pondu soki ozali na motango te.",
        "Bandeau MUAC ke songa ikwa na kati-kati ya diboko ya kimama, na millimetre ? Mbwaki, bunzenza to ya matiti kana nge kele na ntalu ve.",
        "Kipimo cha MUAC katikati ya mkono wa kushoto ni milimita ngapi ? Nyekundu, njano au kijani kama huna namba.",
        "Tshipiminu tshia MUAC munkatshi mua tshianza tshia bakaji tshidi tshileja millimetre bungi kayi ? Tshikunze, tshia nzenza anyi tshia matamba bikala kuyi ne nomba.",
      ),
      type: "number",
      optional: true,
      redFlags: [
        { id: "RF-MAL-SAM-COMPLICATED", when: { all: [{ q: "muac_mm", op: "lt", value: 115 }, { q: "appetite", op: "eq", value: false }] }, label: "Malnutrition aiguë sévère avec perte d'appétit" },
      ],
      onRedFlag: ON_RED_FLAG,
      next: "appetite",
    },
    appetite: {
      id: "appetite",
      ask: t(
        "L'enfant mange-t-il normalement et garde-t-il la nourriture ?",
        "Mwana azali kolia malamu mpe azali kobomba bilei ?",
        "Mwana ke dia mbote mpi ke bumba madia ?",
        "Mtoto anakula kama kawaida na anaweza kubakiza chakula ?",
        "Muana udi udia bimpe ne udi ulama biakudia ?",
      ),
      type: "yes_no",
      optional: true,
      next: "age_months",
    },
    age_months: {
      id: "age_months",
      ask: ASK_AGE_MONTHS,
      type: "age_months",
      optional: true,
      next: "recent_illness",
    },
    recent_illness: {
      id: "recent_illness",
      ask: t(
        "L'enfant a-t-il été malade (diarrhée, fièvre, rougeole) durant les deux dernières semaines ?",
        "Mwana azalaki na maladi (pulupulu, fièvre, rougeole) na poso mibale eleki ?",
        "Mwana vandaka na kimbefo (pulupulu, mwini, rougeole) na mposo zole me luta ?",
        "Mtoto amekuwa mgonjwa (kuhara, homa, surua) katika wiki mbili zilizopita ?",
        "Muana uvua ne disama (tuvi tua mâyi, luya, rougeole) mu mbingu ibidi mishale ?",
      ),
      type: "yes_no",
      optional: true,
      next: null,
    },
  },
  rules: [
    { id: "R-MAL-SAM", when: { q: "muac_mm", op: "lt", value: 115 }, severity: 3 },
    { id: "R-MAL-MAM", when: { all: [{ q: "muac_mm", op: "gte", value: 115 }, { q: "muac_mm", op: "lt", value: 125 }] }, severity: 2 },
    { id: "R-MAL-MUAC-UNKNOWN", when: { q: "muac_mm", op: "unanswered" }, severity: 1 },
    { id: "R-MAL-INFANT-U6M", when: { q: "age_months", op: "lt", value: 6 }, severity: 3 },
    { id: "R-MAL-POOR-APPETITE", when: { q: "appetite", op: "eq", value: false }, severity: 3 },
    { id: "R-MAL-RECENT-ILLNESS", when: { q: "recent_illness", op: "eq", value: true }, severity: 2 },
  ],
  outcomes: outcomes({
    severity_3: {
      action: "REFER_NUTRITION_TODAY",
      text: t(
        "Emmenez l'enfant au centre de santé aujourd'hui pour le programme nutritionnel : le bracelet est dans la zone rouge. Continuez l'allaitement, donnez de petits repas fréquents et de l'eau propre en attendant.",
        "Mema mwana na centre de santé lelo mpo na programme ya bilei : bandeau ezali na esika ya motane. Kokoba komelisa mabele, pesa bilei ya moke mbala mingi mpe mai ya peto.",
        "Nata mwana na centre de santé bubu sambu na programme ya madia : bandeau kele na kisika ya mbwaki. Landa kunwisa mabele, pesa madia ya fioti mbala mingi mpi masa ya bunkete.",
        "Mpeleke mtoto kituo cha afya leo kwa programu ya lishe: kipimo kiko eneo jekundu. Endelea kunyonyesha, mpe chakula kidogo mara kwa mara na maji safi.",
        "Tuala muana ku tshibambalu tshia bukolame lelu bua programe wa biakudia: tshipiminu tshidi mu muaba mukunze. Tungunuka kumuamuisha, mupeshe biakudia bikese misangu ya bungi ne mâyi mimpe.",
      ),
    },
    severity_2: {
      action: "NUTRITION_CHECK_24H",
      text: t(
        "Faites peser et mesurer l'enfant au centre de santé dans les 24 heures : le bracelet est dans la zone jaune. Donnez cinq à six petits repas variés par jour, poursuivez l'allaitement et l'eau propre.",
        "Kende komeka kilo mpe bolai ya mwana na centre de santé na kati ya ngonga 24 : bandeau ezali na esika ya mbuma. Pesa bilei mike mitano to motoba na mokolo, kokoba komelisa mpe mai ya peto.",
        "Kwenda kupima kilo ti bunda ya mwana na centre de santé na kati ya bangunga 24 : bandeau kele na kisika ya bunzenza. Pesa madia fioti tanu to sambanu na kilumbu, landa kunwisa mabele ti masa ya bunkete.",
        "Mpimeni mtoto uzito na urefu kituoni ndani ya saa 24: kipimo kiko eneo la njano. Mpe milo midogo mitano hadi sita kwa siku, endelea kunyonyesha na maji safi.",
        "Ndaku kupima bujitu ne buleu bua muana ku tshibambalu munda mua midi 24: tshipiminu tshidi mu muaba wa nzenza. Mupeshe biakudia bikese bitanu too ne bisambombo dituku dionso, tungunuka kumuamuisha ne mâyi mimpe.",
      ),
    },
    severity_0: {
      action: "NUTRITION_OK_SELF_CARE",
      text: t(
        "Le bracelet est dans la zone verte : continuez comme cela. Allaitez jusqu'à deux ans, donnez des repas variés (bouillie enrichie, légumes, arachides, poisson, œufs) et refaites la mesure chaque mois.",
        "Bandeau ezali na esika ya pondu : kokoba boye. Melisa mabele tii mibu mibale, pesa bilei ndenge na ndenge (bouillie, ndunda, nguba, mbisi, maki) mpe meka lisusu sanza na sanza.",
        "Bandeau kele na kisika ya matiti : landa mutindu yina. Nwisa mabele tii bamvula zole, pesa madia ya mitindo mingi (bouillie, matiti, nguba, mbizi, maki) mpi pima diaka konso ngonda.",
        "Kipimo kiko eneo la kijani: endelea hivyo. Nyonyesha hadi miaka miwili, mpe milo ya aina mbalimbali (uji ulioimarishwa, mboga, karanga, samaki, mayai) na pima tena kila mwezi.",
        "Tshipiminu tshidi mu muaba wa matamba: tungunuka nunku. Muamuishe too ne bidimu bibidi, mupeshe biakudia bia mishindu (bouillie, mboga, nguba, mishipa, maki) ne pima kabidi ngondo yonso.",
      ),
    },
  }),
};
