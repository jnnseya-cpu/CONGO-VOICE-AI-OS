import { z } from "zod";

export const languageCode = z.enum(["fr", "ln", "kg", "sw", "lua"]);
export const moduleType = z.enum(["health", "agriculture", "education", "general"]);
export const severity = z.enum(["low", "medium", "high", "critical"]);

export const LanguageAnalysis = z.object({
  language: languageCode.describe("Dominant language of the message"),
  confidence: z.number().min(0).max(1),
  mixedLanguages: z.array(languageCode).describe("Other languages present, if the message mixes languages"),
  translationFr: z.string().describe("Faithful French translation of the message (or the message itself if French)"),
  module: moduleType.describe("Which service the citizen needs"),
  intent: z.string().describe("Short snake_case intent label, e.g. fever_child, cassava_leaf_disease, fractions_help"),
});
export type LanguageAnalysis = z.infer<typeof LanguageAnalysis>;

export const HealthAssessment = z.object({
  understanding: z.string().describe("What the citizen is describing, in plain French"),
  symptoms: z.array(z.string()),
  ageGroup: z.enum(["infant", "child", "adolescent", "adult", "elderly", "unknown"]),
  pregnancyStatus: z.enum(["pregnant", "not_pregnant", "unknown", "not_applicable"]),
  topic: z.enum([
    "fever_malaria",
    "child_illness",
    "maternal_health",
    "diarrhoea",
    "nutrition",
    "vaccination",
    "medication",
    "injury_emergency",
    "respiratory",
    "other",
  ]),
  emergencyFlags: z.array(z.string()).describe("Danger signs detected, empty if none"),
  severity,
  guidance: z.string().describe("Safe, non-diagnostic practical guidance in simple French, 3-6 short sentences"),
  clinicReferral: z.enum(["none", "within_days", "today", "immediately"]),
  followUpQuestions: z.array(z.string()).max(3),
  confidence: z.number().min(0).max(1),
});
export type HealthAssessment = z.infer<typeof HealthAssessment>;

export const AgricultureAssessment = z.object({
  understanding: z.string(),
  cropType: z.string().describe("Crop or livestock concerned, or 'unknown'"),
  issueType: z.enum([
    "crop_disease",
    "pest",
    "soil",
    "seed_selection",
    "fertiliser",
    "livestock_illness",
    "planting_calendar",
    "harvest_storage",
    "weather",
    "market_price",
    "other",
  ]),
  likelyDiagnosis: z.string().describe("Most likely issue, with the evidence used"),
  urgent: z.boolean().describe("True if spread risk or livestock death risk is high"),
  severity,
  recommendation: z.string().describe("Next practical, low-cost farm action in simple French"),
  lowCostInterventions: z.array(z.string()).max(4),
  followUpQuestions: z.array(z.string()).max(3),
  confidence: z.number().min(0).max(1),
});
export type AgricultureAssessment = z.infer<typeof AgricultureAssessment>;

export const EducationAssessment = z.object({
  understanding: z.string(),
  learnerAgeGroup: z.enum(["6-9", "10-12", "13-15", "16-18", "adult", "unknown"]),
  subject: z.enum(["maths", "french", "reading", "science", "history_geography", "civics", "exam_prep", "career", "parent_support", "other"]),
  topic: z.string(),
  difficultyLevel: z.enum(["beginner", "intermediate", "advanced"]),
  explanation: z.string().describe("Step-by-step explanation adapted to the age group, simple French"),
  quiz: z.array(z.object({ question: z.string(), answer: z.string() })).max(3),
  studyAction: z.string().describe("One concrete next study action"),
  learningDifficulty: z.string().describe("Learning gap signal detected, or 'none'"),
  followUpQuestions: z.array(z.string()).max(2),
  confidence: z.number().min(0).max(1),
});
export type EducationAssessment = z.infer<typeof EducationAssessment>;

export const GeneralAssessment = z.object({
  understanding: z.string(),
  answer: z.string().describe("Helpful orientation towards the right service, in simple French"),
  suggestedModule: moduleType,
  confidence: z.number().min(0).max(1),
});
export type GeneralAssessment = z.infer<typeof GeneralAssessment>;

export const Localisation = z.object({
  text: z.string().describe("The message rendered in the target language, simple and spoken-friendly"),
});

/** The seven-part answer every module must return. */
export const FinalAnswer = z.object({
  asking: z.string(),
  understanding: z.string(),
  risk: z.object({ level: severity, score: z.number().min(0).max(1), flags: z.array(z.string()) }),
  action: z.string(),
  escalation: z.object({ required: z.boolean(), to: z.string().nullable(), reason: z.string().nullable() }),
  confidence: z.object({ score: z.number().min(0).max(1), low: z.boolean() }),
  summary: z.string(),
});
export type FinalAnswer = z.infer<typeof FinalAnswer>;

/* ==========================================================================================
 * AGRICULTURE INTELLIGENCE (FR-AG-01..10, AGR-001..005)
 * Additive schemas: the legacy AgricultureAssessment shape above stays untouched.
 * ========================================================================================== */

export const agriIssueType = z.enum([
  "crop_disease",
  "pest",
  "soil",
  "seed_selection",
  "fertiliser",
  "livestock_illness",
  "planting_calendar",
  "harvest_storage",
  "weather",
  "market_price",
  "other",
]);

export const growthStage = z.enum([
  "preparation",
  "semis",
  "levee",
  "croissance",
  "floraison",
  "fructification",
  "maturite",
  "post_recolte",
  "jeune_animal",
  "animal_adulte",
  "inconnu",
]);

export const affectedProportion = z.enum([
  "quelques_plants",
  "moins_d_un_quart",
  "environ_la_moitie",
  "plus_de_la_moitie",
  "tout_le_champ",
  "inconnu",
]);

/** Farm context extracted from the message and the attachments (FR-AG-01). */
export const FarmContext = z.object({
  subject: z.enum(["culture", "elevage", "sol", "marche", "meteo", "inconnu"]),
  cropOrAnimal: z.string().describe("Culture ou espèce animale concernée, ou 'inconnu'"),
  variety: z.string().describe("Variété ou race si elle est citée, sinon 'inconnu'"),
  growthStage,
  symptoms: z.array(z.string()).max(8).describe("Signes observés, décrits par le producteur ou visibles sur la photo"),
  affectedProportion,
  recentInputs: z.string().describe("Semences, engrais, traitements ou aliments utilisés récemment, sinon 'aucun signalé'"),
  observedSince: z.string().describe("Depuis quand le problème est observé, sinon 'non précisé'"),
  locationHint: z.string().describe("Précision de lieu donnée par le producteur (territoire, village, parcelle), sinon 'non précisé'"),
});
export type FarmContext = z.infer<typeof FarmContext>;

/** One differential candidate with its supporting and contradicting evidence (FR-AG-02). */
export const AgriCandidate = z.object({
  label: z.string().describe("Nom courant du problème, en français"),
  probability: z.number().min(0).max(1),
  evidenceFor: z.array(z.string()).max(4).describe("Indices observés qui soutiennent cette hypothèse"),
  evidenceAgainst: z.array(z.string()).max(4).describe("Indices qui la contredisent ou manquent"),
});
export type AgriCandidate = z.infer<typeof AgriCandidate>;

/** Full field assessment. Severity, urgency, notifiability and chemical safety are decided in code. */
export const AgricultureFieldAssessment = z.object({
  understanding: z.string(),
  farmContext: FarmContext,
  issueType: agriIssueType,
  candidates: z.array(AgriCandidate).max(3).describe("Au maximum trois hypothèses, de la plus à la moins probable"),
  missingEvidence: z.array(z.string()).max(4).describe("Ce qu'il faudrait voir ou savoir pour trancher"),
  noCostActions: z.array(z.string()).max(5).describe("Pratiques culturales sans dépense"),
  lowCostActions: z.array(z.string()).max(5).describe("Actions avec des intrants locaux bon marché"),
  purchaseActions: z.array(z.string()).max(4).describe("Actions nécessitant un achat, toujours via l'agent agricole"),
  actionsToAvoid: z.array(z.string()).max(5).describe("Ce qu'il ne faut surtout pas faire"),
  zoonoticSigns: z.array(z.string()).max(4).describe("Signes pouvant concerner la santé humaine, sinon liste vide"),
  followUpQuestions: z.array(z.string()).max(3),
  followUpCapture: z.string().describe("Ce que le producteur doit observer et rapporter, et quand"),
  citations: z.array(z.string()).max(5).describe("Identifiants de documents approuvés utilisés, entre crochets dans les sources"),
  confidence: z.number().min(0).max(1),
});
export type AgricultureFieldAssessment = z.infer<typeof AgricultureFieldAssessment>;

/* ==========================================================================================
 * EDUCATION INTELLIGENCE (FR-ED-01..10, EDU-001..005)
 * ========================================================================================== */

export const educationMode = z.enum(["explain", "quiz", "read", "homework", "exam_prep", "parent", "teacher"]);
export const ageBand = z.enum(["6-8", "9-11", "12-14", "15-18", "adult", "unknown"]);
export const schoolLevel = z.enum([
  "primaire_1",
  "primaire_2",
  "primaire_3",
  "primaire_4",
  "primaire_5",
  "primaire_6",
  "secondaire_1",
  "secondaire_2",
  "secondaire_3",
  "secondaire_4",
  "secondaire_5",
  "secondaire_6",
  "inconnu",
]);
export const educationSubject = z.enum([
  "maths",
  "french",
  "reading",
  "science",
  "history_geography",
  "civics",
  "exam_prep",
  "career",
  "parent_support",
  "other",
]);

export const lessonStage = z.enum([
  "objectif",
  "verification_prealable",
  "micro_explication",
  "exemple",
  "essai_guide",
  "retour",
  "essai_autonome",
  "signal_maitrise",
  "recapitulatif",
  "suite",
]);

export const LessonStep = z.object({ stage: lessonStage, content: z.string() });

/** One teach → check → adapt cycle (FR-ED-02 / FR-ED-03). */
export const EducationTeachingSession = z.object({
  understanding: z.string(),
  subject: educationSubject,
  topic: z.string(),
  objective: z.string().describe("Objectif d'apprentissage de la session, formulé pour l'élève"),
  difficultyLevel: z.enum(["beginner", "intermediate", "advanced"]),
  steps: z.array(LessonStep).max(10).describe("Les étapes de la boucle enseigner-vérifier-adapter, dans l'ordre"),
  explanation: z.string().describe("Micro-explication à lire à voix haute en moins de 90 secondes (200 mots maximum)"),
  localExample: z.string().describe("Un exemple concret de la vie congolaise"),
  guidedAttempt: z.object({ prompt: z.string(), expectedAnswer: z.string(), hint: z.string() }),
  independentAttempt: z.object({ prompt: z.string(), expectedAnswer: z.string() }),
  checkQuestions: z.array(z.object({ question: z.string(), answer: z.string() })).max(3),
  misconceptions: z.array(z.object({ label: z.string(), feedback: z.string() })).max(3),
  hints: z.array(z.string()).max(4).describe("Indices progressifs pour un devoir, du plus léger au plus fort"),
  workedExample: z.string().describe("Exemple résolu sur un exercice SEMBLABLE, jamais l'exercice noté lui-même"),
  recap: z.string(),
  nextStep: z.string(),
  studyAction: z.string(),
  learningDifficulty: z.string().describe("Difficulté d'apprentissage repérée, ou 'none'"),
  citations: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});
export type EducationTeachingSession = z.infer<typeof EducationTeachingSession>;

export const QuizQuestion = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedAnswer: z.string(),
  acceptableAnswers: z.array(z.string()).max(6).describe("Autres formulations orales acceptables de la bonne réponse"),
  answerType: z.enum(["nombre", "mot", "phrase"]),
  rubric: z.string().describe("Critère de réussite, formulé simplement"),
  rubricCriteria: z.array(z.string()).max(3),
  misconceptions: z
    .array(z.object({ trigger: z.string().describe("Réponse fausse typique"), label: z.string(), feedback: z.string().describe("Explication de l'erreur et geste correctif") }))
    .max(3),
  hint: z.string(),
  difficulty: z.enum(["facile", "moyen", "difficile"]),
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const EducationQuizSet = z.object({
  subject: educationSubject,
  topic: z.string(),
  objective: z.string(),
  questions: z.array(QuizQuestion).min(1).max(5),
});
export type EducationQuizSet = z.infer<typeof EducationQuizSet>;

export const RevisionWeek = z.object({
  week: z.number().int().min(1).max(52),
  focus: z.array(z.string()).max(4),
  activities: z.array(z.string()).max(4),
  checkpoint: z.string(),
});

export const EducationRevisionPlan = z.object({
  examTarget: z.enum(["tenafep", "examen_etat", "none"]),
  weeks: z.array(RevisionWeek).max(16),
  dailyRoutine: z.array(z.string()).max(5),
  advice: z.string(),
});
export type EducationRevisionPlan = z.infer<typeof EducationRevisionPlan>;

/** Parent-facing summary: progress and support, never the child's words. */
export const EducationParentSummary = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).max(3),
  toWorkOn: z.array(z.string()).max(3),
  homeActivities: z.array(z.string()).max(3),
  encouragement: z.string(),
});
export type EducationParentSummary = z.infer<typeof EducationParentSummary>;

/* ==========================================================================================
 * HEALTH PROTOCOL ENGINE (FR-HE-01..17, HEA-001..005)
 * Additive schemas. The model only extracts and explains: severity, risk band and escalation
 * are decided by the deterministic engine in src/lib/ai/protocols.
 * ========================================================================================== */

export const riskBand = z.enum(["emergency", "urgent", "routine", "self_care", "insufficient_information"]);
export const careDestinationType = z.enum(["self_care_home", "community_health_worker", "health_centre", "hospital", "emergency_referral"]);
export const timeToAction = z.enum(["immediate", "same_day", "within_24h", "within_72h", "routine_visit", "none"]);

/** Structured entities read from free speech (FR-HE-10). No severity, no advice. */
export const HealthEntityExtraction = z.object({
  understanding: z.string().describe("Ce que la personne décrit, en français simple, sans diagnostic"),
  symptoms: z.array(z.string()).max(8).describe("Symptômes cités, en français"),
  durationDays: z.number().int().min(0).max(3650).nullable().describe("Depuis combien de jours, ou null si non dit"),
  ageMonths: z.number().min(0).max(1400).nullable().describe("Âge de la personne concernée en mois, ou null si non dit"),
  ageGroup: z.enum(["newborn", "infant", "child", "adolescent", "adult", "elderly", "unknown"]),
  pregnancyStatus: z.enum(["pregnant", "not_pregnant", "unknown", "not_applicable"]),
  subject: z.enum(["self", "child_under_5", "newborn", "pregnant_woman", "elderly", "other", "unknown"]).describe("Pour qui la demande est faite"),
  locationHint: z.string().describe("Lieu cité (province, territoire, zone de santé, village), sinon 'non précisé'"),
  suggestedProtocolId: z.enum([
    "child_fever_u5",
    "adult_fever",
    "cough_breathing",
    "diarrhoea_dehydration",
    "pregnancy_danger_signs",
    "newborn_danger_signs",
    "injury_bleeding",
    "malnutrition_screening",
    "vaccination_schedule",
    "general_symptom_intake",
  ]),
  confidence: z.number().min(0).max(1),
});
export type HealthEntityExtraction = z.infer<typeof HealthEntityExtraction>;

/** One protocol answer proposed by the model, always re-checked by the deterministic pass. */
export const ProtocolAnswer = z.object({
  questionId: z.string().describe("Identifiant exact de la question du protocole"),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .describe("Réponse : booléen pour yes_no, nombre pour age_months/days/number, valeur d'option pour choice, liste de valeurs pour multi_yes_no"),
});
export type ProtocolAnswer = z.infer<typeof ProtocolAnswer>;

/** Mapping of free speech onto protocol answers (FR-HE-01). */
export const HealthProtocolAnswers = z.object({
  answers: z.array(ProtocolAnswer).max(20).describe("Uniquement les réponses réellement contenues dans le message ; ne rien inventer"),
  unanswered: z.array(z.string()).max(20).describe("Identifiants des questions auxquelles le message ne répond pas"),
  confidence: z.number().min(0).max(1),
});
export type HealthProtocolAnswers = z.infer<typeof HealthProtocolAnswers>;

/** Plain-language explanation of an outcome already decided by the engine (FR-HE-16). */
export const HealthExplanation = z.object({
  explanation: z.string().describe("Explication en français simple de la conduite à tenir, action d'abord, 3 à 5 phrases courtes"),
  summary: z.string().describe("Résumé de 60 mots maximum pour l'agent de santé"),
  citations: z.array(z.string()).max(6).describe("Identifiants des sources approuvées utilisées"),
  confidence: z.number().min(0).max(1),
});
export type HealthExplanation = z.infer<typeof HealthExplanation>;

/** Model-side safeguarding signal, merged with the keyword detector (PRD 5.6). */
export const SafeguardingFlag = z.object({
  disclosure: z.boolean().describe("Vrai si la personne évoque violence, abus, exploitation, automutilation ou foyer non sûr"),
  category: z.enum([
    "violence_physique",
    "violence_sexuelle",
    "exploitation",
    "negligence",
    "auto_agression",
    "foyer_dangereux",
    "mariage_precoce",
    "aucune",
  ]),
  concernsChild: z.boolean(),
  immediateDanger: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type SafeguardingFlag = z.infer<typeof SafeguardingFlag>;

/** Confidence vector reported with every triage result (HEA-001). */
export const HealthConfidenceDimensions = z.object({
  transcription: z.number().min(0).max(1),
  language: z.number().min(0).max(1),
  intent: z.number().min(0).max(1),
  evidence: z.number().min(0).max(1),
  knowledgeCoverage: z.number().min(0).max(1),
});
export type HealthConfidenceDimensions = z.infer<typeof HealthConfidenceDimensions>;

/** The health output contract (HEA-001..005, PRD 5.4). Validated before anything is returned. */
export const HealthTriageContract = z.object({
  protocolId: z.string(),
  protocolVersion: z.string(),
  severityLevel: z.number().int().min(0).max(4),
  riskBand,
  triggeredRuleIds: z.array(z.string()),
  recommendedTimeToAction: timeToAction,
  careDestinationType,
  clarifications: z.array(z.string()).max(2),
  selfCareContentIds: z.array(z.string()),
  citations: z.array(z.string()).min(1),
  prohibitedClaimCheck: z.object({ passed: z.boolean(), violations: z.array(z.string()) }),
  humanReviewRequired: z.boolean(),
  followUpDueAt: z.string().describe("ISO 8601"),
  confidenceDimensions: HealthConfidenceDimensions,
  explanationSummary: z.string(),
  safeguarding: z.boolean(),
});
export type HealthTriageContract = z.infer<typeof HealthTriageContract>;
