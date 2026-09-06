/** Vaccination status check against the DRC EPI calendar. */
import type { HealthProtocol, ProtocolOption, ProtocolRule } from "../types";
import { EPI_CALENDAR } from "../vaccination";
import { APPROVED_BY, ASK_AGE_MONTHS, DANGER_ASK, DANGER_OPTIONS, ON_RED_FLAG, dangerRedFlags, option, outcomes, t } from "./shared";

const VACCINE_OPTIONS: ProtocolOption[] = [
  ...EPI_CALENDAR.map((v) => option(v.code, v.label)),
  option("none", t("Aucun vaccin reçu", "Vaccin moko te", "Ata vaksa mosi ve", "Hakuna chanjo yoyote", "Katshina vaksa")),
];

/** One "dose overdue" rule per antigen, so the reason is always traceable. */
const DUE_RULES: ProtocolRule[] = EPI_CALENDAR.map((v) => ({
  id: `R-VAC-DUE-${v.code.toUpperCase()}`,
  when: {
    all: [
      { q: "age_months", op: "gte" as const, value: Number((v.dueAtWeeks / 4.345).toFixed(2)) },
      { q: "vaccines_received", op: "excludes" as const, value: v.code },
    ],
  },
  severity: 1 as const,
}));

export const vaccinationSchedule: HealthProtocol = {
  id: "vaccination_schedule",
  version: "1.0.0",
  title: "Calendrier vaccinal (PEV — RDC)",
  approvedBy: APPROVED_BY,
  module: "health",
  citations: ["KB-HE-VACC-01"],
  selfCareContentIds: ["KB-HE-VACC-01"],
  entry: "age_months",
  defaultSeverity: 0,
  questions: {
    age_months: {
      id: "age_months",
      ask: ASK_AGE_MONTHS,
      type: "age_months",
      next: "vaccines_received",
    },
    vaccines_received: {
      id: "vaccines_received",
      ask: t(
        "Quels vaccins l'enfant a-t-il déjà reçus, d'après le carnet : BCG, polio, penta, PCV, rota, rougeole, fièvre jaune ?",
        "Mwana azwaki bavaccins nini na carnet : BCG, polio, penta, PCV, rota, rougeole, fièvre jaune ?",
        "Mwana bakaka bavaksa nki na mukanda : BCG, polio, penta, PCV, rota, rougeole, fièvre jaune ?",
        "Mtoto amepata chanjo zipi kwenye kadi: BCG, polio, penta, PCV, rota, surua, homa ya manjano ?",
        "Muana wakadi mupete mavaksa kayi mu mukanda: BCG, polio, penta, PCV, rota, rougeole, fièvre jaune ?",
      ),
      type: "multi_yes_no",
      options: VACCINE_OPTIONS,
      next: "has_card",
    },
    has_card: {
      id: "has_card",
      ask: t(
        "Avez-vous le carnet de vaccination de l'enfant sous la main ?",
        "Ozali na carnet ya vaccination ya mwana na maboko ?",
        "Nge kele na mukanda ya vaksa ya mwana na maboko ?",
        "Una kadi ya chanjo ya mtoto mkononi ?",
        "Udi ne mukanda wa mavaksa wa muana mu bianza ?",
      ),
      type: "yes_no",
      optional: true,
      next: "sick_now",
    },
    sick_now: {
      id: "sick_now",
      ask: t(
        "L'enfant est-il malade en ce moment ?",
        "Mwana azali na maladi sikoyo ?",
        "Mwana kele na kimbefo ntangu yayi ?",
        "Je mtoto ni mgonjwa sasa hivi ?",
        "Muana udi ne disama mpindieu ?",
      ),
      type: "yes_no",
      branches: [{ when: { q: "sick_now", op: "eq", value: true }, next: "danger_signs" }],
      next: null,
    },
    danger_signs: {
      id: "danger_signs",
      ask: DANGER_ASK,
      type: "multi_yes_no",
      options: DANGER_OPTIONS,
      redFlags: dangerRedFlags("VAC"),
      onRedFlag: ON_RED_FLAG,
      next: null,
    },
  },
  rules: [
    ...DUE_RULES,
    { id: "R-VAC-NEVER-VACCINATED", when: { q: "vaccines_received", op: "includes", value: "none" }, severity: 2 },
    { id: "R-VAC-NO-CARD", when: { q: "has_card", op: "eq", value: false }, severity: 1 },
    { id: "R-VAC-SICK-NOW", when: { q: "sick_now", op: "eq", value: true }, severity: 2 },
  ],
  outcomes: outcomes({
    severity_0: {
      action: "VACCINATION_UP_TO_DATE",
      text: t(
        "L'enfant est à jour d'après le calendrier national. Gardez le carnet en lieu sûr et présentez-vous à la prochaine séance de vaccination du centre de santé, à la date inscrite sur le carnet.",
        "Mwana azali à jour na calendrier ya ekolo. Bomba carnet malamu mpe kende na séance ya vaccination oyo elandi na centre de santé, na date ekomami na carnet.",
        "Mwana kele na mpila ya mbote na kalandriye ya insi. Bumba mukanda mbote mpi kwenda na seance ya vaksa ya nima na centre de santé, na kilumbu me sonama na mukanda.",
        "Mtoto amepata chanjo zote kwa kalenda ya taifa. Tunza kadi mahali salama na hudhuria kipindi kijacho cha chanjo kituoni, tarehe iliyoandikwa kwenye kadi.",
        "Muana udi ne mavaksa onso bilondeshile kalandriye wa ditunga. Lama mukanda muaba muimpe ne ndaku ku tshikondo tshialua tshia mavaksa ku tshibambalu, ku dituku didi difundibue mu mukanda.",
      ),
    },
    severity_1: {
      action: "GO_VACCINATION_SESSION",
      text: t(
        "Il manque des doses : rendez-vous à la prochaine séance de vaccination du centre de santé avec le carnet. Un retard se rattrape, on ne recommence jamais la série depuis le début. La vaccination est gratuite dans les structures publiques.",
        "Bavaccins mosusu ezangi : kende na séance ya vaccination oyo elandi na centre de santé na carnet. Retard ekoki kozongisama, babandaka série lisusu te. Vaccination ezali ofele na bandako ya Leta.",
        "Bavaksa ya nkaka me konda : kwenda na seance ya vaksa ya nima na centre de santé ti mukanda. Retard lenda vutuka, bo ke yantika serie diaka ve. Vaksa kele ofele na banzo ya Leta.",
        "Kuna chanjo zinazokosekana: hudhuria kipindi kijacho cha chanjo kituoni ukiwa na kadi. Ucheleweshaji hurekebishwa, mfululizo hauanzishwi upya. Chanjo ni bure katika vituo vya serikali.",
        "Kudi mavaksa adi apange: ndaku ku tshikondo tshialua tshia mavaksa ku tshibambalu ne mukanda. Dishalajila didi mua kuakajibua, kabatu batuadija kabidi to. Mavaksa mmapebibue tshianana mu bibambalu bia mbulamatadi.",
      ),
    },
  }),
};
