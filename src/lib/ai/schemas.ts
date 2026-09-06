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
