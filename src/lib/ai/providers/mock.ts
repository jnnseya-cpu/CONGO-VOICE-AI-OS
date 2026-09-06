/**
 * Offline provider. Produces schema-valid, keyword-driven answers so the whole
 * platform (UI, workflow, dashboards, tests) works without any external AI service.
 * It is deliberately conservative: unknown inputs get low confidence.
 */
import "server-only";
import type { LanguageCode } from "@/lib/db/schema";
import { detectAgriUrgentTerms, detectEmergencyTerms } from "../safety";
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmProvider,
  SttProvider,
  SynthesizeRequest,
  SynthesizeResult,
  TranscribeRequest,
  TranscribeResult,
  TtsProvider,
} from "../types";

const LANG_MARKERS: Record<LanguageCode, string[]> = {
  ln: ["mbote", "nazali", "malali", "mwana na ngai", "ngai", "boni", "nalingi", "fièvre te", "bilanga", "koyekola", "mokolo", "moto", "azali", "ya ngai", "nakoki"],
  sw: ["habari", "nina", "homa", "mtoto", "shamba", "mimi", "ninahitaji", "msaada", "mgonjwa", "ninaomba", "wangu", "sasa", "kuhusu", "nataka"],
  kg: ["mono", "kele", "nkento", "mbote na nge", "beto", "kiadi", "bilanga", "nzo", "kimbeefo", "nge"],
  lua: ["ndi", "muana wanyi", "meme", "tshia", "bualu", "mukaji", "disanka", "tshidimu", "wanyi"],
  fr: ["je", "mon", "ma", "enfant", "fièvre", "champ", "manioc", "maïs", "école", "devoir", "bonjour", "comment"],
};

function detectLanguage(text: string): { language: LanguageCode; confidence: number; mixed: LanguageCode[] } {
  const t = ` ${text.toLowerCase()} `;
  const scores = (Object.keys(LANG_MARKERS) as LanguageCode[]).map((lang) => ({
    lang,
    score: LANG_MARKERS[lang].filter((m) => t.includes(` ${m} `) || t.includes(` ${m}`)).length,
  }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  if (!best || best.score === 0) return { language: "fr", confidence: 0.4, mixed: [] };
  const mixed = scores.slice(1).filter((s) => s.score > 0).map((s) => s.lang);
  return { language: best.lang, confidence: Math.min(0.95, 0.5 + best.score * 0.12), mixed };
}

function detectModule(text: string): "health" | "agriculture" | "education" | "general" {
  const t = text.toLowerCase();
  const health = ["fièvre", "malade", "enfant", "grossesse", "enceinte", "diarrh", "vomi", "paludisme", "malaria", "vaccin", "toux", "douleur", "homa", "mgonjwa", "mtoto", "malali", "mwana", "kimbeefo", "kabeela", "médicament", "clinique", "sang"];
  const agri = ["champ", "manioc", "maïs", "plante", "feuille", "récolte", "semence", "engrais", "chèvre", "poule", "vache", "bétail", "insecte", "chenille", "sol", "pluie", "marché", "prix", "shamba", "bilanga", "mahindi", "mihogo", "mbuma"];
  const edu = ["école", "devoir", "fraction", "mathématique", "maths", "lecture", "leçon", "examen", "exercice", "élève", "apprendre", "koyekola", "shule", "somo", "kalasi", "kelasi", "diviser", "multiplier", "conjug"];
  const s = (list: string[]) => list.filter((k) => t.includes(k)).length;
  const scores = { health: s(health), agriculture: s(agri), education: s(edu) };
  const best = (Object.entries(scores) as Array<[keyof typeof scores, number]>).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "general";
}

export class MockProvider implements LlmProvider, SttProvider, TtsProvider {
  readonly key = "mock";
  readonly supportsVision = true;
  readonly languages = "all" as const;

  async generateJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const text = extractUserText(req.user);
    let output: unknown;
    switch (req.schemaName) {
      case "language_analysis":
        output = this.language(text);
        break;
      case "health_assessment":
        output = this.health(text);
        break;
      case "agriculture_assessment":
        output = this.agriculture(text, (req.images ?? []).length > 0);
        break;
      case "education_assessment":
        output = this.education(text);
        break;
      case "general_assessment":
        output = this.general(text);
        break;
      case "localisation":
        output = { text: extractTarget(req.user) };
        break;
      default:
        output = {};
    }
    const parsed = req.schema.safeParse(output);
    if (!parsed.success) throw new Error(`mock output invalid for ${req.schemaName}: ${parsed.error.message}`);
    return { output: parsed.data, model: "mock-rules-v1", inputTokens: 0, outputTokens: 0 };
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    // Without a speech model we cannot decode audio; surface that honestly with low confidence.
    return { text: "", language: req.languageHint ?? null, confidence: 0, model: "mock-stt", audioSeconds: Math.round(req.audio.length / 16000) };
  }

  async synthesize(_req: SynthesizeRequest): Promise<SynthesizeResult | null> {
    return null; // client falls back to on-device speech synthesis
  }

  private language(text: string) {
    const d = detectLanguage(text);
    const module = detectModule(text);
    return {
      language: d.language,
      confidence: d.confidence,
      mixedLanguages: d.mixed,
      translationFr: text,
      module,
      intent: `${module}_${text.toLowerCase().split(/\s+/).slice(0, 2).join("_").replace(/[^a-z_]/g, "") || "request"}`,
    };
  }

  private health(text: string) {
    const t = text.toLowerCase();
    const flags = detectEmergencyTerms(text);
    const child = /enfant|bébé|mwana|mtoto|muana|fils|fille/.test(t);
    const pregnant = /enceinte|grossesse|mimba|zemi|mujajimba/.test(t);
    const fever = /fièvre|homa|fievre|chaud|malali ya moto/.test(t);
    const diarrhoea = /diarrh|kuhara|selles|pulupulu/.test(t);
    const topic = pregnant ? "maternal_health" : diarrhoea ? "diarrhoea" : fever ? "fever_malaria" : child ? "child_illness" : /vaccin/.test(t) ? "vaccination" : "other";
    const severity = flags.length > 0 ? "critical" : pregnant || (fever && child) ? "high" : fever || diarrhoea ? "medium" : "low";
    const guidance =
      severity === "critical"
        ? "Des signes de danger sont présents. Rendez-vous immédiatement au centre de santé le plus proche. En attendant, gardez la personne au calme, allongée, et ne lui donnez rien à avaler si elle est somnolente."
        : topic === "fever_malaria"
          ? "Une fièvre peut être un signe de paludisme, fréquent dans la région. Faites boire souvent de petites quantités d'eau propre, découvrez la personne et rafraîchissez-la avec un linge humide. Faites faire un test de paludisme au centre de santé dans la journée. Revenez vite si la fièvre monte, si la personne vomit tout ou ne réagit plus normalement."
          : topic === "diarrhoea"
            ? "Le plus important est d'éviter la déshydratation. Donnez à boire souvent : solution de réhydratation orale (SRO) si disponible, sinon eau propre bouillie. Continuez à alimenter ou à allaiter. Consultez le centre de santé si les selles contiennent du sang, si la personne ne peut plus boire ou si cela dure plus de deux jours."
            : topic === "maternal_health"
              ? "Pendant la grossesse, tout saignement, forte douleur du ventre, maux de tête violents ou fièvre doivent être vus rapidement par une sage-femme ou un centre de santé. Assurez-vous d'avoir vos consultations prénatales et dormez sous une moustiquaire."
              : "Décrivez les symptômes principaux, depuis quand ils durent et l'âge de la personne. Le service vous indiquera si une visite au centre de santé est nécessaire.";
    return {
      understanding: `La personne signale : ${text.slice(0, 160)}`,
      symptoms: [fever && "fièvre", diarrhoea && "diarrhée", /toux|kikohozi/.test(t) && "toux", /vomi|kutapika/.test(t) && "vomissements", /douleur|maumivu|mpasi/.test(t) && "douleur"].filter(Boolean) as string[],
      ageGroup: child ? "child" : "unknown",
      pregnancyStatus: pregnant ? "pregnant" : "unknown",
      topic,
      emergencyFlags: flags,
      severity,
      guidance,
      clinicReferral: severity === "critical" ? "immediately" : severity === "high" ? "today" : severity === "medium" ? "within_days" : "none",
      followUpQuestions: flags.length > 0 ? [] : ["Depuis combien de jours cela dure-t-il ?", "Quel âge a la personne malade ?", "Y a-t-il d'autres signes, comme des vomissements ou une faiblesse inhabituelle ?"].slice(0, 3),
      confidence: flags.length > 0 || fever || diarrhoea ? 0.72 : 0.45,
    };
  }

  private agriculture(text: string, hasImage: boolean) {
    const t = text.toLowerCase();
    const urgentTerms = detectAgriUrgentTerms(text);
    const crop = /manioc|mihogo|kwanga|songo/.test(t) ? "manioc" : /maïs|mais|mahindi|masangu/.test(t) ? "maïs" : /riz|mchele|loso/.test(t) ? "riz" : /haricot|maharagwe|madesu/.test(t) ? "haricot" : /chèvre|poule|vache|porc|bétail|mbuzi|kuku|ngombe|ntaba|nsoso/.test(t) ? "élevage" : "unknown";
    const issueType = /feuille|jaun|tache|mosa|ugonjwa|maladie|bokono/.test(t) ? "crop_disease" : /insecte|chenille|criquet|wadudu|viwavi|nyama ya moke/.test(t) ? "pest" : /sol|terre|udongo|mabele/.test(t) ? "soil" : /semence|mbegu|mboto/.test(t) ? "seed_selection" : /engrais|mbolea/.test(t) ? "fertiliser" : crop === "élevage" ? "livestock_illness" : /prix|marché|bei|soko|zando/.test(t) ? "market_price" : /pluie|mvua|mbula|saison/.test(t) ? "weather" : "other";
    const urgent = urgentTerms.length > 0;
    return {
      understanding: `Le producteur décrit : ${text.slice(0, 160)}${hasImage ? " (photo jointe)" : ""}`,
      cropType: crop,
      issueType,
      likelyDiagnosis:
        issueType === "crop_disease" && crop === "manioc"
          ? "Feuilles jaunes et déformées sur manioc : mosaïque africaine du manioc probable (virus transmis par la mouche blanche). À confirmer sur place."
          : issueType === "pest" && crop === "maïs"
            ? "Trous dans les feuilles et sciure dans le cornet du maïs : chenille légionnaire d'automne probable."
            : "Informations insuffisantes pour un diagnostic précis ; une photo nette des feuilles ou de l'animal aiderait.",
      urgent,
      severity: urgent ? "high" : issueType === "crop_disease" || issueType === "pest" || issueType === "livestock_illness" ? "medium" : "low",
      recommendation:
        issueType === "crop_disease"
          ? "Arrachez et brûlez les plants très atteints, ne replantez pas leurs boutures. Utilisez des boutures saines de variétés tolérantes et espacez les plants. Signalez le problème à l'agent agricole de votre secteur."
          : issueType === "pest"
            ? "Inspectez le champ tôt le matin, ramassez et écrasez les chenilles, versez un peu de sable ou de cendre dans le cornet des plants. Traitez localement seulement les zones touchées et informez l'agent agricole si l'attaque dépasse un plant sur cinq."
            : "Précisez la culture, l'âge des plants, ce que vous observez et depuis quand. Une photo aidera le service à vous orienter.",
      lowCostInterventions: issueType === "pest" ? ["Ramassage manuel tôt le matin", "Cendre ou sable dans le cornet", "Rotation avec légumineuses"] : issueType === "crop_disease" ? ["Boutures saines certifiées", "Arrachage des plants malades", "Espacement des plants"] : [],
      followUpQuestions: ["Quelle proportion du champ est touchée ?", "Depuis quand observez-vous cela ?", "Pouvez-vous envoyer une photo nette ?"].slice(0, 3),
      confidence: issueType === "other" ? 0.4 : hasImage ? 0.7 : 0.6,
    };
  }

  private education(text: string) {
    const t = text.toLowerCase();
    const subject = /fraction|math|calcul|divis|multipli|addition|soustr|hesabu|mituya/.test(t) ? "maths" : /lecture|lire|kusoma|kotanga/.test(t) ? "reading" : /français|conjug|grammaire|verbe/.test(t) ? "french" : /science|plante|eau|corps|électricité/.test(t) ? "science" : /examen|exetat|mtihani/.test(t) ? "exam_prep" : /parent|mon enfant/.test(t) ? "parent_support" : "other";
    const topic = /fraction/.test(t) ? "les fractions" : /divis/.test(t) ? "la division" : /multipli/.test(t) ? "la multiplication" : subject;
    const explanation =
      topic === "les fractions"
        ? "Une fraction, c'est une part d'un tout. Imagine un pain de manioc coupé en 4 parts égales : chaque part est 1/4. Le chiffre du bas (4) dit en combien de parts on a coupé ; le chiffre du haut dit combien de parts on prend. Si tu prends 2 parts, tu as 2/4, c'est la même chose que la moitié, 1/2."
        : topic === "la division"
          ? "Diviser, c'est partager en parts égales. 12 mangues partagées entre 3 enfants : chacun reçoit 4 mangues, donc 12 ÷ 3 = 4. On peut vérifier avec la multiplication : 3 × 4 = 12."
          : "Dis-moi la matière, la classe et l'exercice exact. Je t'expliquerai étape par étape avec des exemples de la vie de tous les jours.";
    return {
      understanding: `L'apprenant demande : ${text.slice(0, 160)}`,
      learnerAgeGroup: /primaire|10 ans|9 ans|8 ans/.test(t) ? "6-9" : "unknown",
      subject,
      topic,
      difficultyLevel: "beginner",
      explanation,
      quiz: topic === "les fractions" ? [{ question: "Un pain coupé en 8 parts, tu en prends 4. Quelle fraction as-tu ?", answer: "4/8, c'est-à-dire 1/2" }, { question: "Que représente le chiffre du bas d'une fraction ?", answer: "Le nombre de parts égales du tout" }] : topic === "la division" ? [{ question: "20 ÷ 5 = ?", answer: "4" }] : [],
      studyAction: topic === "les fractions" ? "Découpe une feuille en 4 puis en 8 et nomme chaque part à voix haute." : "Refais l'exercice à voix haute en expliquant chaque étape.",
      learningDifficulty: subject === "maths" ? "compréhension des parts égales" : "none",
      followUpQuestions: ["En quelle classe es-tu ?", "Veux-tu un autre exemple ?"],
      confidence: subject === "other" ? 0.4 : 0.7,
    };
  }

  private general(text: string) {
    const module = detectModule(text);
    return {
      understanding: `Demande générale : ${text.slice(0, 160)}`,
      answer:
        module === "general"
          ? "Je peux vous aider pour la santé, l'agriculture ou l'école. Dites-moi simplement ce qui vous préoccupe, dans votre langue."
          : `Cette demande concerne le service ${module === "health" ? "santé" : module === "agriculture" ? "agriculture" : "éducation"} ; je la transmets à ce service.`,
      suggestedModule: module,
      confidence: module === "general" ? 0.5 : 0.7,
    };
  }
}

/** Prompts wrap the citizen message in <message> tags; recover it for the rule engine. */
function extractUserText(user: string): string {
  const m = user.match(/<message>([\s\S]*?)<\/message>/);
  return (m ? m[1] : user).trim();
}
function extractTarget(user: string): string {
  const m = user.match(/<text>([\s\S]*?)<\/text>/);
  return (m ? m[1] : user).trim();
}
