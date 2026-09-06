/**
 * USSD / DTMF menu content (FR-CH-20): two levels — module, then the five most common
 * questions of that module. Each entry carries a short menu label (USSD screens are
 * 160 characters) and the full French question sent through the canonical pipeline.
 */
import type { LanguageCode, ModuleType } from "@/lib/db/schema";

export interface MenuQuestion {
  /** Short label shown on the USSD screen, per language. */
  label: Record<LanguageCode, string>;
  /** Canonical French question handed to the orchestrator. */
  questionFr: string;
}

export const COMMON_QUESTIONS: Record<Exclude<ModuleType, "general">, MenuQuestion[]> = {
  health: [
    {
      label: {
        fr: "Fievre enfant",
        ln: "Fievre ya mwana",
        kg: "Fievre ya mwana",
        sw: "Homa ya mtoto",
        lua: "Kabeela ka muana",
      },
      questionFr: "Mon enfant a de la fièvre depuis deux jours, que dois-je faire ?",
    },
    {
      label: {
        fr: "Diarrhee",
        ln: "Pulupulu",
        kg: "Pulupulu",
        sw: "Kuhara",
        lua: "Mishi",
      },
      questionFr: "Mon enfant a la diarrhée et ne veut pas boire, que dois-je faire ?",
    },
    {
      label: {
        fr: "Grossesse",
        ln: "Zemi",
        kg: "Divumu",
        sw: "Ujauzito",
        lua: "Difu",
      },
      questionFr: "Je suis enceinte, quels sont les signes de danger pendant la grossesse ?",
    },
    {
      label: {
        fr: "Vaccination",
        ln: "Vaccin",
        kg: "Vaccin",
        sw: "Chanjo",
        lua: "Vaccin",
      },
      questionFr: "Quand dois-je faire vacciner mon bébé et quels vaccins sont prévus ?",
    },
    {
      label: {
        fr: "Paludisme",
        ln: "Palu",
        kg: "Palu",
        sw: "Malaria",
        lua: "Palu",
      },
      questionFr: "Comment reconnaître et prévenir le paludisme dans ma famille ?",
    },
  ],
  agriculture: [
    {
      label: {
        fr: "Maladie manioc",
        ln: "Maladi ya songo",
        kg: "Kimbevo ya madiokia",
        sw: "Ugonjwa wa muhogo",
        lua: "Disama dia mutshi",
      },
      questionFr: "Les feuilles de mon manioc jaunissent et se recroquevillent, que faire ?",
    },
    {
      label: {
        fr: "Chenilles mais",
        ln: "Bankusu ya masangu",
        kg: "Bimpasi ya masangu",
        sw: "Viwavi vya mahindi",
        lua: "Bishi bia ntete",
      },
      questionFr: "Il y a des chenilles dans le cornet de mon maïs, comment les traiter ?",
    },
    {
      label: {
        fr: "Periode semis",
        ln: "Tango ya kolona",
        kg: "Ntangu ya kukuna",
        sw: "Wakati wa kupanda",
        lua: "Tshikondo tshia kukuna",
      },
      questionFr: "Quel est le bon moment pour semer avec les pluies qui commencent ?",
    },
    {
      label: {
        fr: "Sante betail",
        ln: "Santé ya banyama",
        kg: "Mavimpi ya bambisi",
        sw: "Afya ya mifugo",
        lua: "Makanda a nyama",
      },
      questionFr: "Mes chèvres ont la diarrhée et certaines sont mortes, que dois-je faire ?",
    },
    {
      label: {
        fr: "Prix marche",
        ln: "Ntalo ya zando",
        kg: "Ntalu ya zandu",
        sw: "Bei sokoni",
        lua: "Mushinga wa tshisalu",
      },
      questionFr: "Quels sont les prix actuels du marché pour ma récolte et où vendre ?",
    },
  ],
  education: [
    {
      label: {
        fr: "Fractions",
        ln: "Fractions",
        kg: "Fractions",
        sw: "Sehemu",
        lua: "Fractions",
      },
      questionFr: "Je ne comprends pas les fractions, pouvez-vous m'expliquer simplement ?",
    },
    {
      label: {
        fr: "Aide lecture",
        ln: "Kotanga",
        kg: "Kutanga",
        sw: "Kusoma",
        lua: "Kubala",
      },
      questionFr: "Mon enfant a du mal à lire, comment l'aider à la maison ?",
    },
    {
      label: {
        fr: "Revision examen",
        ln: "Révision examen",
        kg: "Révision examen",
        sw: "Marudio ya mtihani",
        lua: "Révision examen",
      },
      questionFr: "Comment organiser mes révisions pour l'examen d'État ?",
    },
    {
      label: {
        fr: "Multiplication",
        ln: "Multiplication",
        kg: "Multiplication",
        sw: "Kuzidisha",
        lua: "Multiplication",
      },
      questionFr: "Expliquez-moi la multiplication et la division avec un exemple simple.",
    },
    {
      label: {
        fr: "Conjugaison",
        ln: "Conjugaison",
        kg: "Conjugaison",
        sw: "Nyakati za vitenzi",
        lua: "Conjugaison",
      },
      questionFr: "Comment conjuguer les verbes au futur en français ?",
    },
  ],
};

export function menuQuestions(module: ModuleType): MenuQuestion[] {
  if (module === "general") return [];
  return COMMON_QUESTIONS[module];
}

export function questionLabel(q: MenuQuestion, language: LanguageCode): string {
  return q.label[language] ?? q.label.fr;
}
