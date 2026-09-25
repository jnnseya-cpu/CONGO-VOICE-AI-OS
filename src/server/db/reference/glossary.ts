/**
 * Starter terminology (FR-LG-05).
 *
 * Every entry here is a term where a shifting translation costs something
 * concrete: a citizen who cannot tell that two answers said the same thing, or
 * a health worker reading a transcript who cannot tell what was actually told
 * to the household.
 *
 * REFERENCE DATA. The French side is the programme's own canonical wording. The
 * national-language renderings are a first pass and carry `review` status until
 * the language panel for each language has signed them off; nothing is enforced
 * on an answer until an entry is set to `active`. The variants are the wrong
 * renderings seen during offline testing, which is what the enforcement
 * rewrites.
 */
import type { ModuleType } from "../schema";

export interface GlossarySeed {
  module: ModuleType;
  termFr: string;
  translations: Partial<Record<"ln" | "kg" | "sw" | "lua", string>>;
  variants?: Partial<Record<"ln" | "kg" | "sw" | "lua", string[]>>;
  notes: string;
}

export const GLOSSARY_SEED: GlossarySeed[] = [
  /* ------------------------------------------------------------------ health */
  {
    module: "health",
    termFr: "signes de danger",
    translations: { ln: "bilembo ya likama", kg: "bidimbu ya kigonsa", sw: "dalili za hatari", lua: "bimanyinu bia njiwu" },
    variants: { ln: ["makambo ya mabe", "bilembo ya mabe"], sw: ["ishara mbaya"] },
    notes: "The phrase the whole triage rests on. It must be the same words every time so a household recognises it.",
  },
  {
    module: "health",
    termFr: "centre de santé",
    translations: { ln: "centre ya santé", kg: "nzo ya mavimpi", sw: "kituo cha afya", lua: "tshibombelu tshia bukole" },
    variants: { ln: ["lopitalo"], sw: ["hospitali"] },
    notes: "A health centre is not a hospital; sending someone to the wrong level of care wastes a day they may not have.",
  },
  {
    module: "health",
    termFr: "relais communautaire",
    translations: { ln: "moto ya santé ya mboka", kg: "muntu ya mavimpi ya bwala", sw: "mhudumu wa afya wa kijiji", lua: "muntu wa bukole wa mu tshimenga" },
    notes: "The role a citizen is told will call them back. An invented word here means nobody recognises who arrives.",
  },
  {
    module: "health",
    termFr: "solution de réhydratation orale",
    translations: { ln: "SRO", kg: "SRO", sw: "ORS", lua: "SRO" },
    variants: { ln: ["mai ya sukali na mungwa"], sw: ["maji ya sukari na chumvi"] },
    notes: "The sachet has a name printed on it. A descriptive paraphrase sends someone to mix something else.",
  },
  {
    module: "health",
    termFr: "paludisme",
    translations: { ln: "palu", kg: "palu", sw: "malaria", lua: "palu" },
    notes: "The word used at the health centre, so the citizen can repeat it there.",
  },
  {
    module: "health",
    termFr: "consultation prénatale",
    translations: { ln: "CPN", kg: "CPN", sw: "kliniki ya ujauzito", lua: "CPN" },
    notes: "The service is recorded under this name in the maternal health card.",
  },
  /* ------------------------------------------------------------- agriculture */
  {
    module: "agriculture",
    termFr: "chenille légionnaire",
    translations: { ln: "mbinzo ya masango", kg: "nzinzi ya masangu", sw: "viwavi jeshi", lua: "tshisumbi tshia ntete" },
    notes: "A notifiable pest. The extension officer and the farmer have to be naming the same insect.",
  },
  {
    module: "agriculture",
    termFr: "mosaïque du manioc",
    translations: { ln: "maladi ya mosaïque ya songo", kg: "kimbevo ya mosaïque ya manioko", sw: "batobato ya muhogo", lua: "disama dia mosaïque dia manioko" },
    notes: "Distinguishing mosaic from brown streak changes the advice entirely.",
  },
  {
    module: "agriculture",
    termFr: "registre des intrants",
    translations: { ln: "liste ya biloko endimami", kg: "liste ya bima ya kundima", sw: "orodha ya pembejeo zilizoidhinishwa", lua: "mukanda wa bintu bitabujibue" },
    notes: "What makes the difference between an approved product and one a trader is trying to sell.",
  },
  {
    module: "agriculture",
    termFr: "engrais",
    translations: { ln: "engrais", kg: "engrais", sw: "mbolea", lua: "engrais" },
    notes: "Kept as the word used at the depot rather than a coined term.",
  },
  /* --------------------------------------------------------------- education */
  {
    module: "education",
    termFr: "TENAFEP",
    translations: { ln: "TENAFEP", kg: "TENAFEP", sw: "TENAFEP", lua: "TENAFEP" },
    notes: "The name of the national primary examination. It is never translated.",
  },
  {
    module: "education",
    termFr: "fractions",
    translations: { ln: "ba fractions", kg: "ba fractions", sw: "sehemu", lua: "ba fractions" },
    notes: "The word the child will see written in the textbook.",
  },
  /* ----------------------------------------------------------------- general */
  {
    module: "general",
    termFr: "ce service ne remplace pas",
    translations: { ln: "service oyo ezali na esika ya", kg: "kisalu yai ke zola ve kufuta", sw: "huduma hii haichukui nafasi ya", lua: "mudimu eu kawena upingana" },
    notes: "The opening of the disclaimer. Its meaning must not drift between languages.",
  },
];
