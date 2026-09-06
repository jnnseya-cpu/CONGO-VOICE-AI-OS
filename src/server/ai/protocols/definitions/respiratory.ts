/** Cough and difficult breathing (PCIME: pneumonia danger signs). */
import type { HealthProtocol } from "../types";
import { APPROVED_BY, ASK_AGE_MONTHS, ASK_DURATION_DAYS, DANGER_ASK, DANGER_OPTIONS, ON_RED_FLAG, dangerRedFlags, outcomes, t } from "./shared";

export const coughBreathing: HealthProtocol = {
  id: "cough_breathing",
  version: "1.0.0",
  title: "Toux et difficulté respiratoire",
  approvedBy: APPROVED_BY,
  module: "health",
  citations: ["KB-HE-RESP-01", "KB-HE-TRIAGE-01"],
  selfCareContentIds: ["KB-HE-RESP-01"],
  entry: "danger_signs",
  defaultSeverity: 1,
  questions: {
    danger_signs: {
      id: "danger_signs",
      ask: DANGER_ASK,
      type: "multi_yes_no",
      options: DANGER_OPTIONS,
      redFlags: dangerRedFlags("COUGH"),
      onRedFlag: ON_RED_FLAG,
      next: "age_months",
    },
    age_months: {
      id: "age_months",
      ask: ASK_AGE_MONTHS,
      type: "age_months",
      optional: true,
      redFlags: [
        { id: "RF-COUGH-YOUNG-INFANT", when: { q: "age_months", op: "lt", value: 2 }, label: "Toux ou gêne respiratoire chez un nourrisson de moins de 2 mois" },
      ],
      onRedFlag: ON_RED_FLAG,
      next: "chest_indrawing",
    },
    chest_indrawing: {
      id: "chest_indrawing",
      ask: t(
        "Quand la personne respire, la partie basse des côtes s'enfonce-t-elle vers l'intérieur ?",
        "Tango moto azali kopema, nse ya mikuwa ya ntolo ezali kokota na kati ?",
        "Ntangu muntu ke pema, nsi ya mikuwa ya ntulu ke kota na kati ?",
        "Mtu anapopumua, sehemu ya chini ya mbavu inaingia ndani ?",
        "Padi muntu upetesha lupepele, muaba wa panshi pa nkufu udi ubuela munda ?",
      ),
      type: "yes_no",
      redFlags: [{ id: "RF-COUGH-CHEST-INDRAWING", when: { q: "chest_indrawing", op: "eq", value: true }, label: "Tirage sous-costal" }],
      onRedFlag: ON_RED_FLAG,
      next: "stridor",
    },
    stridor: {
      id: "stridor",
      ask: t(
        "Entend-on un sifflement ou un bruit fort quand la personne respire au repos ?",
        "Bazali koyoka makelele to mongongo makasi tango azali kopema na kimia ?",
        "Bo ke wa makelele to nzila ya ngolo ntangu yandi ke pema na kimia ?",
        "Kuna mluzi au sauti kubwa wakati mtu anapumua akiwa amepumzika ?",
        "Badi bumvua tshiona anyi dîyi dikole padi muntu upetesha lupepele mu ditalala ?",
      ),
      type: "yes_no",
      redFlags: [{ id: "RF-COUGH-STRIDOR", when: { q: "stridor", op: "eq", value: true }, label: "Stridor au repos" }],
      onRedFlag: ON_RED_FLAG,
      next: "fast_breathing",
    },
    fast_breathing: {
      id: "fast_breathing",
      ask: t(
        "La respiration est-elle plus rapide que d'habitude ?",
        "Kopema ezali mbangu koleka momesano ?",
        "Kupema kele nswalu kuluta mpila ya mbote ?",
        "Kupumua ni kwa haraka kuliko kawaida ?",
        "Kupetesha lupepele kudi lubilu kupita bu kashidi ?",
      ),
      type: "yes_no",
      next: "cough_days",
    },
    cough_days: {
      id: "cough_days",
      ask: ASK_DURATION_DAYS,
      type: "days",
      next: "wheeze_history",
    },
    wheeze_history: {
      id: "wheeze_history",
      ask: t(
        "Est-ce que cela revient souvent, avec la poitrine qui siffle ?",
        "Yango ezali kozonga mbala mingi, na ntolo oyo ezali kobeta piololo ?",
        "Yo ke vutuka mbala mingi, ti ntulu ke bula mpiololo ?",
        "Hali hii hurudia mara kwa mara, kifua kikipiga mluzi ?",
        "Bualu ebu budi bupingana misangu ya bungi, ne tshiadi tshiela tshiona ?",
      ),
      type: "yes_no",
      optional: true,
      next: null,
    },
  },
  rules: [
    { id: "R-COUGH-FAST-BREATHING", when: { q: "fast_breathing", op: "eq", value: true }, severity: 3 },
    { id: "R-COUGH-INFANT-U12M", when: { all: [{ q: "age_months", op: "gte", value: 2 }, { q: "age_months", op: "lt", value: 12 }] }, severity: 2 },
    { id: "R-COUGH-TB-SUSPECT", when: { q: "cough_days", op: "gte", value: 14 }, severity: 2 },
    { id: "R-COUGH-PROLONGED", when: { all: [{ q: "cough_days", op: "gte", value: 5 }, { q: "cough_days", op: "lt", value: 14 }] }, severity: 2 },
    { id: "R-COUGH-RECURRENT-WHEEZE", when: { q: "wheeze_history", op: "eq", value: true }, severity: 2 },
  ],
  outcomes: outcomes({
    severity_1: {
      action: "MONITOR_COUGH_AT_HOME",
      text: t(
        "Soignez à la maison : faites boire souvent, gardez la personne au calme et à l'abri de la fumée, comptez la respiration chaque jour. Allez au centre de santé si la respiration devient rapide ou difficile.",
        "Batela na ndako : pesa mai mbala mingi, tika ye na kimia mpe mosika na milinga, tanga kopema mokolo na mokolo. Kende na centre de santé soki kopema ekomi mbangu to mpasi.",
        "Tala na nzo : pesa masa mbala mingi, bika yandi na kimia mpi ntama ti midinga, tanga kupema konso kilumbu. Kwenda na centre de santé kana kupema me kuma nswalu to mpasi.",
        "Hudumia nyumbani: mnywesheni maji mara kwa mara, mwekeni mahali tulivu bila moshi, hesabu pumzi kila siku. Nenda kituo cha afya kupumua kukiwa haraka au kwa shida.",
        "Mulame ku nzubu: mumunuishe mâyi misangu ya bungi, mumushiye mu ditalala kule ne mîshi, bala kupetesha lupepele dituku dionso. Ndaku ku tshibambalu bikala kupetesha lupepele kuikale lubilu anyi kua bukole.",
      ),
    },
  }),
};
