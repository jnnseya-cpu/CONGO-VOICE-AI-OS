/**
 * Offline provider. Produces schema-valid, keyword-driven answers so the whole
 * platform (UI, workflow, dashboards, tests) works without any external AI service.
 * It is deliberately conservative: unknown inputs get low confidence.
 */
import "server-only";
import type { LanguageCode } from "@server/db/schema";
import { detectAgriUrgentTerms, detectEmergencyTerms } from "../safety";
import { detectSafeguarding } from "../safety";
import { deterministicAnswers, extractEntities, selectProtocolId } from "../protocols/extraction";
import { getProtocol } from "../protocols/definitions";
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
      case "agriculture_field_assessment":
        output = this.agricultureField(text, (req.images ?? []).length > 0);
        break;
      case "education_teaching_session":
        output = this.teachingSession(text, req.user);
        break;
      case "education_quiz_set":
        output = this.quizSet(req.user);
        break;
      case "education_revision_plan":
        output = this.revisionPlan(req.user);
        break;
      case "education_parent_summary":
        output = this.parentSummary(text);
        break;
      case "health_entities":
        output = this.healthEntities(text);
        break;
      case "health_protocol_answers":
        output = this.healthProtocolAnswers(text, req.user);
        break;
      case "health_explanation":
        output = this.healthExplanation(req.user);
        break;
      case "safeguarding_flag":
        output = this.safeguardingFlag(text);
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
    const moduleType = detectModule(text);
    return {
      language: d.language,
      confidence: d.confidence,
      mixedLanguages: d.mixed,
      translationFr: text,
      module: moduleType,
      intent: `${moduleType}_${text.toLowerCase().split(/\s+/).slice(0, 2).join("_").replace(/[^a-z_]/g, "") || "request"}`,
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
    const moduleType = detectModule(text);
    return {
      understanding: `Demande générale : ${text.slice(0, 160)}`,
      answer:
        moduleType === "general"
          ? "Je peux vous aider pour la santé, l'agriculture ou l'école. Dites-moi simplement ce qui vous préoccupe, dans votre langue."
          : `Cette demande concerne le service ${moduleType === "health" ? "santé" : moduleType === "agriculture" ? "agriculture" : "éducation"} ; je la transmets à ce service.`,
      suggestedModule: moduleType,
      confidence: moduleType === "general" ? 0.5 : 0.7,
    };
  }

  /* ----------------------------------------------------------------------------------------
   * Agriculture: differential candidates, tiered actions, farm context.
   * -------------------------------------------------------------------------------------- */

  private agricultureField(text: string, hasImage: boolean) {
    const t = text.toLowerCase();
    const urgentTerms = detectAgriUrgentTerms(text);
    const livestock = /chèvre|chevre|mouton|poule|poulet|volaille|porc|cochon|vache|bétail|betail|mbuzi|kuku|ngombe|ntaba|nsoso|nguruwe/.test(t);
    const crop = /manioc|mihogo|kwanga|songo/.test(t)
      ? "manioc"
      : /maïs|mais|mahindi|masangu/.test(t)
        ? "maïs"
        : /riz|mchele|loso/.test(t)
          ? "riz"
          : /haricot|maharagwe|madesu/.test(t)
            ? "haricot"
            : /arachide|karanga|nguba/.test(t)
              ? "arachide"
              : /plantain|banane|ndizi/.test(t)
                ? "banane plantain"
                : livestock
                  ? /poule|poulet|volaille|kuku|nsoso/.test(t)
                    ? "poule"
                    : /chèvre|chevre|mbuzi|ntaba/.test(t)
                      ? "chèvre"
                      : /porc|cochon|nguruwe/.test(t)
                        ? "porc"
                        : "bétail"
                  : "inconnu";
    const issueType = /prix|marché|marche|bei|soko|zando/.test(t)
      ? "market_price"
      : /planter|semer|semis|calendrier|bouturer/.test(t)
        ? "planting_calendar"
        : /pluie|mvua|mbula|saison|météo|meteo/.test(t)
          ? "weather"
          : /stock|grenier|charançon|charancon|moisi|conserv/.test(t)
            ? "harvest_storage"
            : livestock
              ? "livestock_illness"
              : /insecte|chenille|criquet|wadudu|viwavi|trou/.test(t)
                ? "pest"
                : /feuille|jaun|tache|mosa|ugonjwa|maladie|bokono|pourri/.test(t)
                  ? "crop_disease"
                  : /engrais|mbolea|fertilis/.test(t)
                    ? "fertiliser"
                    : /sol|terre|udongo|mabele/.test(t)
                      ? "soil"
                      : /semence|mbegu|mboto|bouture/.test(t)
                        ? "seed_selection"
                        : "other";

    const candidates: Array<{ label: string; probability: number; evidenceFor: string[]; evidenceAgainst: string[] }> = [];
    if (issueType === "crop_disease" && crop === "manioc") {
      candidates.push(
        { label: "Mosaïque africaine du manioc", probability: hasImage ? 0.62 : 0.48, evidenceFor: ["Feuilles jaunes et déformées décrites", "Manioc, culture hôte habituelle"], evidenceAgainst: ["Pas d'observation de mouches blanches confirmée"] },
        { label: "Striure brune du manioc", probability: 0.22, evidenceFor: ["Symptômes foliaires sur manioc"], evidenceAgainst: ["Pas de nécrose brune décrite sur les racines"] },
        { label: "Carence en azote", probability: 0.12, evidenceFor: ["Jaunissement des feuilles"], evidenceAgainst: ["Déformation des feuilles inhabituelle pour une carence"] },
      );
    } else if (issueType === "pest" && crop === "maïs") {
      candidates.push(
        { label: "Chenille légionnaire d'automne", probability: hasImage ? 0.66 : 0.52, evidenceFor: ["Trous dans les feuilles", "Dégâts dans le cornet du maïs"], evidenceAgainst: ["Chenille non observée directement"] },
        { label: "Foreur de tiges", probability: 0.2, evidenceFor: ["Perforations sur le plant"], evidenceAgainst: ["Pas de trou d'entrée dans la tige signalé"] },
        { label: "Dégâts de criquets", probability: 0.08, evidenceFor: ["Feuilles entamées"], evidenceAgainst: ["Aucun essaim signalé"] },
      );
    } else if (issueType === "livestock_illness" && crop === "poule") {
      candidates.push(
        { label: "Maladie de Newcastle", probability: 0.58, evidenceFor: ["Mortalité rapide de volailles", "Signes nerveux (cou tordu) décrits"], evidenceAgainst: ["Statut vaccinal inconnu"] },
        { label: "Coccidiose", probability: 0.18, evidenceFor: ["Mortalité en élevage familial"], evidenceAgainst: ["Pas de sang dans les fientes signalé"] },
        { label: "Intoxication alimentaire", probability: 0.1, evidenceFor: ["Mortalité groupée"], evidenceAgainst: ["Aucun changement d'aliment signalé"] },
      );
    } else if (issueType === "livestock_illness") {
      candidates.push(
        { label: "Parasitisme interne", probability: 0.42, evidenceFor: ["Diarrhée et amaigrissement en petit élevage"], evidenceAgainst: ["Aucun déparasitage récent connu"] },
        { label: "Peste des petits ruminants", probability: 0.24, evidenceFor: ["Plusieurs animaux atteints", "Mortalité rapide"], evidenceAgainst: ["Signes respiratoires non confirmés"] },
        { label: "Trouble alimentaire", probability: 0.14, evidenceFor: ["Diarrhée"], evidenceAgainst: ["Changement de fourrage non signalé"] },
      );
    } else if (issueType === "crop_disease" || issueType === "pest") {
      candidates.push(
        { label: "Attaque parasitaire à confirmer", probability: 0.38, evidenceFor: ["Symptômes sur les feuilles décrits"], evidenceAgainst: ["Description encore trop générale"] },
        { label: "Problème de fertilité du sol", probability: 0.22, evidenceFor: ["Plants chétifs"], evidenceAgainst: ["Répartition des dégâts inconnue"] },
      );
    }

    const noCostActions =
      issueType === "crop_disease"
        ? ["Arrachez et brûlez les plants les plus atteints, loin du champ.", "Ne prélevez jamais de boutures sur un plant malade.", "Sarclez et espacez les plants pour aérer la parcelle."]
        : issueType === "pest"
          ? ["Inspectez le champ tôt le matin et écrasez les chenilles à la main.", "Retirez les plants trop attaqués pour couper le cycle.", "Alternez le maïs avec une légumineuse la saison suivante."]
          : issueType === "livestock_illness"
            ? ["Isolez immédiatement les animaux malades des animaux sains.", "Nettoyez l'abreuvoir et la mangeoire à l'eau savonneuse chaque jour.", "Ne consommez pas et ne vendez pas un animal mort de maladie ; enterrez-le profondément."]
            : ["Notez précisément ce que vous observez, sur quelle partie de la parcelle et depuis quand."];
    const lowCostActions =
      issueType === "pest"
        ? ["Versez une pincée de cendre de bois sèche dans le cornet des plants attaqués.", "Préparez un extrait de feuilles de neem et pulvérisez en fin de journée."]
        : issueType === "crop_disease"
          ? ["Procurez-vous des boutures saines de variété tolérante auprès du service agricole.", "Apportez du compost bien décomposé pour renforcer les plants."]
          : issueType === "livestock_illness"
            ? ["Donnez de l'eau propre à volonté et un abri sec et aéré.", "Séparez les jeunes animaux des adultes malades."]
            : ["Prenez une photo nette à la lumière du jour pour la prochaine consultation."];
    const purchaseActions =
      issueType === "pest"
        ? ["Si l'attaque dépasse un plant sur cinq, demandez à l'agent agricole un insecticide homologué adapté au maïs et suivez sa dose."]
        : issueType === "livestock_illness"
          ? ["Demandez au vétérinaire du secteur s'il faut vacciner le reste du troupeau."]
          : [];

    return {
      understanding: `Le producteur décrit : ${text.slice(0, 160)}${hasImage ? " (photo jointe)" : ""}`,
      farmContext: {
        subject: livestock ? "elevage" : issueType === "market_price" ? "marche" : issueType === "weather" ? "meteo" : issueType === "soil" ? "sol" : "culture",
        cropOrAnimal: crop,
        variety: "inconnu",
        growthStage: livestock ? "animal_adulte" : /jeune|levée|levee|semis/.test(t) ? "levee" : /fleur/.test(t) ? "floraison" : /récolte|recolte/.test(t) ? "maturite" : "croissance",
        symptoms: [
          /jaun/.test(t) && "feuilles jaunes",
          /tache/.test(t) && "taches sur les feuilles",
          /trou/.test(t) && "feuilles trouées",
          /mort|meurent|kufa/.test(t) && "mortalité",
          /diarrh|pulupulu/.test(t) && "diarrhée",
          /cou tordu|torticolis/.test(t) && "signes nerveux",
        ].filter(Boolean) as string[],
        affectedProportion: /tout le champ|toutes les plantes|shamba lote|bilanga mobimba|tout mon troupeau/.test(t)
          ? "tout_le_champ"
          : /moitié|moitie|beaucoup|plusieurs/.test(t)
            ? "environ_la_moitie"
            : /quelques|un plant|deux plants/.test(t)
              ? "quelques_plants"
              : "inconnu",
        recentInputs: /engrais|urée|uree|npk|traitement|produit/.test(t) ? "intrants mentionnés par le producteur" : "aucun signalé",
        observedSince: /depuis/.test(t) ? "durée mentionnée par le producteur" : "non précisé",
        locationHint: "non précisé",
      },
      issueType,
      candidates,
      missingEvidence: hasImage
        ? ["Une deuxième photo sous un autre angle (face inférieure des feuilles ou animal entier)"]
        : ["Une photo nette de la partie atteinte", "La proportion de la parcelle ou du troupeau touchée"],
      noCostActions,
      lowCostActions,
      purchaseActions,
      actionsToAvoid:
        issueType === "crop_disease"
          ? ["Ne replantez pas les boutures issues des plants malades.", "Ne jetez pas les plants arrachés au bord du champ."]
          : issueType === "livestock_illness"
            ? ["Ne vendez pas et ne consommez pas un animal malade ou mort de maladie.", "Ne jetez pas les carcasses dans la rivière ni près des habitations."]
            : ["Ne mélangez jamais plusieurs produits sans avis d'un agent qualifié."],
      zoonoticSigns:
        livestock && /rage|mordu|charbon|avort|lait|mort brutale|meurent/.test(t)
          ? ["Contact humain possible avec des animaux malades ou morts : prudence sanitaire"]
          : [],
      followUpQuestions: hasImage
        ? ["Quelle proportion du champ ou du troupeau est touchée ?", "Depuis combien de jours observez-vous cela ?"]
        : ["Pouvez-vous envoyer une photo nette de la partie atteinte ?", "Quelle proportion est touchée ?", "Depuis combien de jours cela dure-t-il ?"],
      followUpCapture: "Regardez la parcelle ou le troupeau dans 7 jours, comptez les plants ou animaux atteints et reprenez une photo au même endroit, puis dites-nous si cela progresse.",
      citations: [],
      confidence: urgentTerms.length > 0 ? 0.6 : issueType === "other" ? 0.4 : hasImage ? 0.68 : 0.55,
    };
  }

  /* ----------------------------------------------------------------------------------------
   * Education: teaching session, quiz, revision plan, parent summary.
   * -------------------------------------------------------------------------------------- */

  private teachingSession(text: string, user: string) {
    const t = text.toLowerCase();
    const level = extractField(user, "niveau") ?? "primaire_4";
    const subject = /fraction|math|calcul|divis|multipli|addition|soustr|hesabu|mituya|table/.test(t)
      ? "maths"
      : /lecture|lire|kusoma|kotanga|histoire à lire|conte/.test(t)
        ? "reading"
        : /français|francais|conjug|grammaire|verbe|orthograph/.test(t)
          ? "french"
          : /science|plante|eau|corps|électricité|electricite|animal/.test(t)
            ? "science"
            : /examen|exetat|tenafep|mtihani|état|etat/.test(t)
              ? "exam_prep"
              : /parent|mon enfant|ma fille|mon fils/.test(t)
                ? "parent_support"
                : "other";
    const topic = /fraction/.test(t)
      ? "les fractions"
      : /divis/.test(t)
        ? "la division"
        : /multipli|table/.test(t)
          ? "la multiplication"
          : /conjug|verbe/.test(t)
            ? "la conjugaison"
            : /lire|lecture/.test(t)
              ? "la lecture"
              : /plante/.test(t)
                ? "les besoins des plantes"
                : subject;
    const objective =
      topic === "les fractions"
        ? "Reconnaître une fraction simple et dire à quelle part d'un tout elle correspond"
        : topic === "la division"
          ? "Partager une quantité en parts égales et vérifier par la multiplication"
          : topic === "la multiplication"
            ? "Utiliser la table de multiplication pour résoudre un problème du marché"
            : `Comprendre ${topic}`;
    const explanation =
      topic === "les fractions"
        ? "Une fraction, c'est une part d'un tout. Prends un pain de manioc coupé en 4 parts égales : chaque part est un quart, on écrit 1/4. Le chiffre du bas dit en combien de parts on a coupé. Le chiffre du haut dit combien de parts on prend. Si tu prends 2 parts sur 4, tu as 2/4, et c'est exactement la moitié, 1/2."
        : topic === "la division"
          ? "Diviser, c'est partager en parts égales. Tu as 12 mangues et 3 enfants : chacun reçoit 4 mangues, donc 12 divisé par 3 égale 4. Pour vérifier, tu multiplies : 3 fois 4 égale 12. Si le compte tombe juste, ta division est bonne."
          : topic === "la multiplication"
            ? "Multiplier, c'est additionner plusieurs fois la même quantité. Si un sachet d'arachides coûte 500 francs et que tu en achètes 4, tu paies 500 + 500 + 500 + 500, donc 4 fois 500, égale 2000 francs. La table de multiplication te fait gagner du temps."
            : "Dis-moi la matière, ta classe et l'exercice exact. Je t'expliquerai étape par étape avec un exemple de tous les jours.";
    const localExample =
      topic === "les fractions"
        ? "Au marché, une mesure de riz partagée en 4 petites boîtes : une boîte, c'est 1/4 de la mesure."
        : topic === "la division"
          ? "Partager 20 bananes entre 5 enfants du quartier."
          : "Compter la monnaie en francs congolais après un achat au marché.";
    const answerFor =
      topic === "les fractions" ? "1/2" : topic === "la division" ? "4" : topic === "la multiplication" ? "2000" : "à préciser ensemble";
    return {
      understanding: `L'apprenant demande : ${text.slice(0, 160)}`,
      subject,
      topic,
      objective,
      difficultyLevel: level.startsWith("secondaire") ? "intermediate" : "beginner",
      steps: [
        { stage: "objectif", content: objective },
        { stage: "verification_prealable", content: "Avant de commencer : sais-tu partager 10 mangues entre 2 enfants ?" },
        { stage: "micro_explication", content: explanation },
        { stage: "exemple", content: localExample },
        { stage: "essai_guide", content: "Essayons ensemble : je te guide pas à pas." },
        { stage: "retour", content: "Je t'explique ce qui est juste et ce qu'il faut corriger, sans jamais dire seulement « faux »." },
        { stage: "essai_autonome", content: "À toi maintenant, tout seul." },
        { stage: "signal_maitrise", content: "Tu maîtrises quand tu expliques la règle avec tes propres mots et que tu réussis deux essais de suite." },
        { stage: "recapitulatif", content: "On retient : une part d'un tout, le chiffre du bas compte les parts, le chiffre du haut celles qu'on prend." },
        { stage: "suite", content: "La prochaine fois, nous comparerons deux fractions simples." },
      ],
      explanation,
      localExample,
      guidedAttempt: {
        prompt: topic === "les fractions" ? "Un pain est coupé en 8 parts, tu en prends 4. Quelle fraction as-tu ?" : "20 divisé par 5, combien ?",
        expectedAnswer: topic === "les fractions" ? "4/8, c'est-à-dire 1/2" : "4",
        hint: "Compte d'abord le nombre total de parts, puis celles que tu prends.",
      },
      independentAttempt: {
        prompt: topic === "les fractions" ? "Une mesure de riz est partagée en 4 ; tu en prends 2. Quelle fraction, et à quoi est-elle égale ?" : "18 divisé par 3, combien ?",
        expectedAnswer: topic === "les fractions" ? "2/4 égale 1/2" : "6",
      },
      checkQuestions:
        topic === "les fractions"
          ? [
              { question: "Que représente le chiffre du bas d'une fraction ?", answer: "Le nombre de parts égales du tout" },
              { question: "2/4 est égal à quelle fraction plus simple ?", answer: "1/2" },
            ]
          : [{ question: "Comment vérifier une division ?", answer: "En multipliant le résultat par le diviseur" }],
      misconceptions: [
        { label: "Confondre le chiffre du haut et celui du bas", feedback: "Le chiffre du bas dit en combien de parts on coupe, celui du haut combien on en prend. Redessine le pain en parts pour le voir." },
        { label: "Croire qu'une fraction est toujours plus petite qu'un morceau", feedback: "Plus on coupe en parts, plus chaque part est petite : 1/8 est plus petit que 1/4." },
      ],
      hints: [
        "Relis l'énoncé et dis à voix haute ce que l'on cherche.",
        "Fais un dessin : découpe le tout en parts égales.",
        "Compare avec un exemple que tu connais, comme partager des mangues.",
      ],
      workedExample: `Exemple résolu sur un exercice SEMBLABLE (pas le tien) : une galette coupée en 6 parts, on en prend 3. On écrit 3/6, et comme 3 est la moitié de 6, cela fait 1/2. Réponse : ${answerFor === "à préciser ensemble" ? "1/2" : "1/2"}.`,
      recap: "Une fraction, c'est une part d'un tout : le bas compte les parts, le haut celles qu'on prend.",
      nextStep: "Refais deux exercices semblables demain, à voix haute.",
      studyAction: "Découpe une feuille en 4 puis en 8 et nomme chaque part à voix haute.",
      learningDifficulty: subject === "maths" ? "compréhension des parts égales" : "none",
      citations: [],
      confidence: subject === "other" ? 0.42 : 0.72,
    };
  }

  private quizSet(user: string) {
    const topic = (extractField(user, "sujet") ?? extractField(user, "topic") ?? "les fractions").toLowerCase();
    const subject = /fraction|divis|multipli|math|calcul/.test(topic) ? "maths" : /lecture|lire/.test(topic) ? "reading" : /conjug|verbe|français|francais/.test(topic) ? "french" : /plante|eau|corps|science/.test(topic) ? "science" : "other";
    const objective = `Vérifier la maîtrise de ${topic}`;
    const fractions = [
      { id: "q1", prompt: "Un pain est coupé en 4 parts égales. Tu prends 1 part. Quelle fraction as-tu ?", expectedAnswer: "1/4", acceptableAnswers: ["un quart", "1 sur 4", "1/4"], answerType: "mot", rubric: "L'élève écrit ou dit la fraction avec le bon numérateur et le bon dénominateur.", rubricCriteria: ["Numérateur correct", "Dénominateur correct"], misconceptions: [{ trigger: "4/1", label: "Inversion du haut et du bas", feedback: "Tu as inversé : le chiffre du bas dit en combien de parts on coupe (4), celui du haut combien tu prends (1). Cela s'écrit 1/4." }], hint: "Compte d'abord toutes les parts, puis celles que tu prends.", difficulty: "facile" },
      { id: "q2", prompt: "2/4, c'est la même chose que quelle fraction plus simple ?", expectedAnswer: "1/2", acceptableAnswers: ["une demie", "la moitié", "1 sur 2", "1/2"], answerType: "mot", rubric: "L'élève reconnaît une fraction équivalente simplifiée.", rubricCriteria: ["Reconnaît l'équivalence", "Simplifie correctement"], misconceptions: [{ trigger: "2/2", label: "Confusion avec le tout", feedback: "2/2 c'est le pain entier. Ici tu n'as que 2 parts sur 4, donc la moitié : 1/2." }], hint: "Deux parts sur quatre, c'est la moitié du pain.", difficulty: "facile" },
      { id: "q3", prompt: "Quelle fraction est la plus grande : 1/4 ou 1/8 ?", expectedAnswer: "1/4", acceptableAnswers: ["un quart", "1 sur 4"], answerType: "mot", rubric: "L'élève compare deux fractions de même numérateur.", rubricCriteria: ["Comprend que plus on coupe, plus les parts sont petites"], misconceptions: [{ trigger: "1/8", label: "Croire que le plus grand chiffre donne la plus grande part", feedback: "Plus on coupe le pain en parts, plus chaque part est petite. 8 parts donnent des parts plus petites que 4 parts : 1/4 est plus grand." }], hint: "Imagine le même pain coupé en 4, puis en 8.", difficulty: "moyen" },
      { id: "q4", prompt: "Tu as 12 mangues et tu les partages entre 4 enfants. Combien chacun en reçoit-il ?", expectedAnswer: "3", acceptableAnswers: ["trois", "3 mangues"], answerType: "nombre", rubric: "L'élève effectue un partage en parts égales.", rubricCriteria: ["Résultat exact", "Parts égales"], misconceptions: [{ trigger: "4", label: "Confusion entre le diviseur et le résultat", feedback: "4 est le nombre d'enfants, pas le nombre de mangues par enfant. 12 partagé en 4 fait 3." }], hint: "Distribue une mangue à chaque enfant, puis recommence.", difficulty: "moyen" },
      { id: "q5", prompt: "Trois enfants se partagent 3/4 d'un pain, en parts égales. Chacun reçoit-il plus ou moins d'un quart de pain ?", expectedAnswer: "un quart", acceptableAnswers: ["exactement un quart", "1/4", "autant qu'un quart"], answerType: "phrase", rubric: "L'élève relie le partage d'une fraction à une part connue.", rubricCriteria: ["Raisonnement expliqué", "Résultat correct"], misconceptions: [{ trigger: "plus", label: "Oubli du partage entre trois", feedback: "Les 3/4 sont partagés entre 3 enfants : chacun reçoit une des trois parts, donc exactement 1/4." }], hint: "3/4, ce sont trois parts d'un quart.", difficulty: "difficile" },
    ];
    const generic = fractions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
    return { subject, topic, objective, questions: generic };
  }

  private revisionPlan(user: string) {
    const weeksRaw = Number(extractField(user, "semaines_avant_examen") ?? "6");
    const weeks = Math.max(1, Math.min(12, Number.isFinite(weeksRaw) ? Math.round(weeksRaw) : 6));
    const target = (extractField(user, "examen") ?? "tenafep").toLowerCase();
    const examTarget = target.includes("etat") || target.includes("état") ? "examen_etat" : target.includes("tenafep") ? "tenafep" : "none";
    const focusPool = [
      ["Opérations : addition et soustraction posées", "Vocabulaire des problèmes"],
      ["Multiplication et tables", "Lecture à voix haute"],
      ["Division et partages", "Compréhension de texte"],
      ["Fractions simples", "Conjugaison du présent"],
      ["Mesures : longueur, masse, monnaie", "Conjugaison du passé composé"],
      ["Géométrie : figures et périmètre", "Rédaction courte"],
      ["Sciences : plantes, eau, corps humain", "Orthographe des mots courants"],
      ["Révision générale et anciens sujets", "Gestion du temps le jour de l'examen"],
    ];
    return {
      examTarget,
      weeks: Array.from({ length: weeks }, (_, i) => ({
        week: i + 1,
        focus: focusPool[i % focusPool.length],
        activities: ["Réviser 30 minutes le soir, à voix haute", "Refaire deux exercices de la semaine précédente", "Expliquer une notion à un frère, une sœur ou un camarade"],
        checkpoint: "Faire 5 questions orales sur les objectifs de la semaine et compter les réussites.",
      })),
      dailyRoutine: ["30 minutes de révision à heure fixe", "Commencer par revoir la veille pendant 5 minutes", "Terminer en disant à voix haute ce qui a été appris"],
      advice: "Répartis les révisions sur plusieurs jours et reviens sur chaque sujet plusieurs fois : on retient beaucoup mieux en révisant par petites séances espacées qu'en une seule longue soirée.",
    };
  }

  private parentSummary(text: string) {
    return {
      summary: `Votre enfant travaille en ce moment sur ${text.slice(0, 100) || "les notions de base"}. Il a fait plusieurs essais et progresse sur les étapes simples.`,
      strengths: ["Participe et essaie plusieurs fois", "Comprend les exemples de la vie de tous les jours"],
      toWorkOn: ["Vérifier son résultat avant de répondre", "Expliquer sa démarche à voix haute"],
      homeActivities: ["Partager des mangues ou du pain à table et nommer les parts", "Faire compter la monnaie après un achat au marché", "Écouter l'enfant expliquer ce qu'il a appris aujourd'hui"],
      encouragement: "Encouragez chaque essai : l'enfant apprend surtout quand il ose se tromper et recommencer.",
    };
  }

  /* ---------------------------------------------------------------------------------------
   * Health protocol engine (FR-HE-01..17)
   * The offline provider reuses the same deterministic extractor as the safety net, so red
   * flags spoken in any of the five languages still reach the engine with no model at all.
   * ------------------------------------------------------------------------------------- */

  private healthEntities(text: string) {
    const e = extractEntities(text);
    const ageGroup = e.subject === "newborn" ? "newborn" : e.ageGroup;
    return {
      understanding: `La personne signale : ${text.slice(0, 160)}`,
      symptoms: e.symptoms.slice(0, 8),
      durationDays: e.durationDays === null ? null : Math.round(e.durationDays),
      ageMonths: e.ageMonths,
      ageGroup,
      pregnancyStatus: e.pregnant === true ? "pregnant" : "unknown",
      subject: e.subject,
      locationHint: e.locationHint ?? "non précisé",
      suggestedProtocolId: selectProtocolId(text, e),
      confidence: e.dangerSigns.length || e.symptoms.length ? 0.7 : 0.4,
    };
  }

  private healthProtocolAnswers(text: string, user: string) {
    const protocolId = user.match(/<protocole id="([^"]+)"/)?.[1] ?? null;
    const protocol = protocolId ? getProtocol(protocolId) : null;
    if (!protocol) return { answers: [], unanswered: [], confidence: 0.3 };
    const entities = extractEntities(text);
    const answers = deterministicAnswers(protocol, text, entities);
    const answered = Object.keys(answers);
    return {
      answers: answered.slice(0, 20).map((questionId) => ({ questionId, value: answers[questionId] as string | number | boolean | string[] })),
      unanswered: Object.keys(protocol.questions).filter((q) => !answered.includes(q)).slice(0, 20),
      confidence: answered.length ? 0.7 : 0.35,
    };
  }

  private healthExplanation(user: string) {
    const outcome = user.match(/<texte_du_protocole>([\s\S]*?)<\/texte_du_protocole>/)?.[1]?.trim() ?? "";
    const level = Number(user.match(/niveau_de_gravite:\s*(\d)/)?.[1] ?? "2");
    const citations = Array.from(new Set(Array.from(user.matchAll(/\[([A-Z]{2}-[A-Z0-9-]+)\]/g)).map((m) => m[1]))).slice(0, 6);
    const lead =
      level >= 4
        ? "Il faut partir maintenant vers une structure de santé."
        : level === 3
          ? "Il faut aller au centre de santé aujourd'hui."
          : level === 2
            ? "Il faut aller au centre de santé dans les 24 heures."
            : level === 1
              ? "Vous pouvez surveiller à la maison et revoir la situation sous deux à trois jours."
              : "Les soins à la maison suffisent pour le moment.";
    const explanation = `${lead} ${outcome}`.trim();
    return {
      explanation,
      summary: summarise60(`${lead} ${outcome}`),
      citations,
      confidence: citations.length ? 0.7 : 0.4,
    };
  }

  private safeguardingFlag(text: string) {
    const d = detectSafeguarding(text);
    const t = text.toLowerCase();
    return {
      disclosure: d.detected,
      category: d.categories[0] ?? "aucune",
      concernsChild: /enfant|bébé|bebe|mwana|mtoto|muana|fille de|fils de|élève|eleve/.test(t),
      immediateDanger: d.categories.some((c) => c === "auto_agression" || c === "foyer_dangereux" || c === "violence_sexuelle"),
      confidence: d.detected ? 0.75 : 0.5,
    };
  }
}

/** Health summaries are capped at 60 words (FR-HE-16). */
function summarise60(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= 60 ? words.join(" ") : words.slice(0, 60).join(" ");
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

/** Reads one `key: value` line from the <context> block of a prompt envelope. */
function extractField(user: string, key: string): string | null {
  const m = user.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"));
  return m ? m[1].trim() : null;
}
