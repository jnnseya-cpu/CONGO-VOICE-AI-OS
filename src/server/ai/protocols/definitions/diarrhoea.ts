/** Diarrhoea and dehydration (PCIME plan A/B/C orientation, ORS). */
import type { HealthProtocol } from "../types";
import { APPROVED_BY, ASK_AGE_MONTHS, ASK_DURATION_DAYS, DANGER_ASK, DANGER_OPTIONS, ON_RED_FLAG, dangerRedFlags, option, outcomes, t } from "./shared";

export const diarrhoeaDehydration: HealthProtocol = {
  id: "diarrhoea_dehydration",
  version: "1.0.0",
  title: "Diarrhée et déshydratation",
  approvedBy: APPROVED_BY,
  module: "health",
  citations: ["KB-HE-DIARR-01", "KB-HE-WASH-01", "KB-HE-EPID-01"],
  selfCareContentIds: ["KB-HE-DIARR-01", "KB-HE-WASH-01"],
  entry: "danger_signs",
  defaultSeverity: 1,
  questions: {
    danger_signs: {
      id: "danger_signs",
      ask: DANGER_ASK,
      type: "multi_yes_no",
      options: DANGER_OPTIONS,
      redFlags: dangerRedFlags("DIA"),
      onRedFlag: ON_RED_FLAG,
      next: "dehydration_signs",
    },
    dehydration_signs: {
      id: "dehydration_signs",
      ask: t(
        "Voyez-vous : yeux enfoncés, peau qui reste plissée quand on la pince, soif intense, pas d'urine depuis six heures, enfant très mou ?",
        "Ozali komona : miso ekoti na kati, loposo etikali plissé soki ozali kofina, mposa ya mai makasi, masuba te banda ngonga motoba, mwana alembi mingi ?",
        "Nge ke mona : meso me kota na kati, nkanda ke bikala plissé kana nge ke fina, mposa ya masa mingi, masuba ve banda bangunga sambanu, mwana me lemba mingi ?",
        "Unaona: macho yaliyodidimia, ngozi inabaki imekunjamana ikibanwa, kiu kikali, hakuna mkojo kwa saa sita, mtoto amelegea sana ?",
        "Udi umona: mêsu mabuele munda, tshiseba tshidi tshishala tshifunyike padi utshikuata, nyota mikole, katuena tulua munda mua midi isambombo, muana mutekete bikole ?",
      ),
      type: "multi_yes_no",
      options: [
        option("sunken_eyes", t("Yeux enfoncés", "Miso ekoti na kati", "Meso me kota na kati", "Macho yaliyodidimia", "Mêsu mabuele munda")),
        option("skin_pinch_slow", t("La peau reste plissée", "Loposo etikali plissé", "Nkanda ke bikala plissé", "Ngozi inabaki imekunjamana", "Tshiseba tshidi tshishala tshifunyike")),
        option("very_thirsty", t("Soif intense", "Mposa ya mai makasi", "Mposa ya masa mingi", "Kiu kikali", "Nyota mikole")),
        option("no_urine_6h", t("Pas d'urine depuis six heures", "Masuba te banda ngonga motoba", "Masuba ve banda bangunga sambanu", "Hakuna mkojo kwa saa sita", "Katuena tulua munda mua midi isambombo")),
        option("lethargic", t("Très mou, ne réagit presque plus", "Alembi mingi, azali koyanola lisusu te", "Me lemba mingi, ke vutula diaka ve", "Amelegea sana, hajibu tena", "Mutekete bikole, kena wandamuna kabidi")),
        option("none", t("Aucun de ces signes", "Elembo moko te", "Ata kidimbu mosi ve", "Hakuna dalili yoyote", "Katshina tshimanyinu")),
      ],
      redFlags: [
        {
          id: "RF-DIA-SEVERE-DEHYDRATION",
          when: { any: [{ q: "dehydration_signs", op: "includes", value: "lethargic" }, { all: [{ q: "dehydration_signs", op: "includes", value: "sunken_eyes" }, { q: "dehydration_signs", op: "includes", value: "skin_pinch_slow" }] }] },
          label: "Déshydratation sévère",
        },
      ],
      onRedFlag: ON_RED_FLAG,
      next: "blood_in_stool",
    },
    blood_in_stool: {
      id: "blood_in_stool",
      ask: t(
        "Y a-t-il du sang dans les selles ?",
        "Makila ezali na nyei ?",
        "Menga kele na tuvi ?",
        "Kuna damu kwenye choo ?",
        "Mashi adiku mu tuvi ?",
      ),
      type: "yes_no",
      next: "age_months",
    },
    age_months: {
      id: "age_months",
      ask: ASK_AGE_MONTHS,
      type: "age_months",
      optional: true,
      next: "duration_days",
    },
    duration_days: {
      id: "duration_days",
      ask: ASK_DURATION_DAYS,
      type: "days",
      next: "vomiting",
    },
    vomiting: {
      id: "vomiting",
      ask: t(
        "La personne vomit-elle aussi ?",
        "Moto azali mpe kosanza ?",
        "Muntu ke luka mpi ?",
        "Je mtu anatapika pia ?",
        "Muntu udi ulua kabidi ?",
      ),
      type: "yes_no",
      next: "ors_available",
    },
    ors_available: {
      id: "ors_available",
      ask: t(
        "Avez-vous des sachets de SRO (sel de réhydratation orale) à la maison ?",
        "Ozali na basachets ya SRO (mai ya mungwa mpe sukali) na ndako ?",
        "Nge kele na basashe ya SRO (masa ya mungwa ti sukadi) na nzo ?",
        "Una vifurushi vya ORS (chumvi-sukari ya maji) nyumbani ?",
        "Udi ne bipaki bia SRO (mâyi a mukelenge ne sukadi) ku nzubu ?",
      ),
      type: "yes_no",
      optional: true,
      next: null,
    },
  },
  rules: [
    { id: "R-DIA-SOME-DEHYDRATION", when: { any: [{ q: "dehydration_signs", op: "includes", value: "sunken_eyes" }, { q: "dehydration_signs", op: "includes", value: "skin_pinch_slow" }, { q: "dehydration_signs", op: "includes", value: "very_thirsty" }] }, severity: 2 },
    { id: "R-DIA-NO-URINE-6H", when: { q: "dehydration_signs", op: "includes", value: "no_urine_6h" }, severity: 3 },
    { id: "R-DIA-DYSENTERY", when: { q: "blood_in_stool", op: "eq", value: true }, severity: 3 },
    { id: "R-DIA-INFANT-U6M", when: { q: "age_months", op: "lt", value: 6 }, severity: 3 },
    { id: "R-DIA-CHILD-U5", when: { all: [{ q: "age_months", op: "gte", value: 6 }, { q: "age_months", op: "lt", value: 60 }] }, severity: 2 },
    { id: "R-DIA-PERSISTENT-14D", when: { q: "duration_days", op: "gte", value: 14 }, severity: 3 },
    { id: "R-DIA-PROLONGED-3D", when: { all: [{ q: "duration_days", op: "gte", value: 3 }, { q: "duration_days", op: "lt", value: 14 }] }, severity: 2 },
    { id: "R-DIA-VOMITING", when: { q: "vomiting", op: "eq", value: true }, severity: 2 },
    { id: "R-DIA-NO-ORS", when: { q: "ors_available", op: "eq", value: false }, severity: 2 },
  ],
  outcomes: outcomes({
    severity_1: {
      action: "ORS_PLAN_A_AT_HOME",
      text: t(
        "Donnez à boire plus que d'habitude après chaque selle : SRO préparé avec un sachet dans un litre d'eau propre, ou eau propre bouillie. Continuez à allaiter et à nourrir. Allez au centre de santé si du sang apparaît, si la personne ne peut plus boire, ou après trois jours sans amélioration.",
        "Pesa mai koleka momesano sima ya nyei nyonso : SRO ya sachet moko na litre moko ya mai ya peto, to mai ya peto ya kotokisa. Kokoba komelisa mpe kolisa. Kende na centre de santé soki makila ebimi, soki akoki komela te, to sima ya mikolo misato soki ebongi te.",
        "Pesa masa kuluta mpila ya mbote na nima ya tuvi yonso : SRO ya sashe mosi na litre mosi ya masa ya bunkete, to masa ya bunkete ya kutokisa. Landa kunwisa mabele mpi kudisa. Kwenda na centre de santé kana menga me basika, kana yandi ke nwa ve, to na nima ya bilumbu tatu kana yo me bonga ve.",
        "Mnywesheni maji zaidi ya kawaida baada ya kila choo: ORS ya kifurushi kimoja kwenye lita moja ya maji safi, au maji safi yaliyochemshwa. Endelea kunyonyesha na kulisha. Nenda kituo cha afya damu ikitokea, asipoweza kunywa, au baada ya siku tatu bila nafuu.",
        "Mumunuishe mâyi kupita bu kashidi kunyima kua tuvi tuonso: SRO wa tshipaki tshimue mu litre umue wa mâyi mimpe, anyi mâyi mimpe mateke. Tungunuka kumuamuisha ne kumudisha. Ndaku ku tshibambalu bikala mashi apatuke, bikala kayi mua kunua, anyi kunyima kua matuku asatu pikala kabiyi bimpe.",
      ),
    },
  }),
};
