/**
 * Risk Agent — deterministic scoring so that escalation behaviour is auditable and testable.
 * Model outputs feed in as signals; the rules decide.
 */
import type { ModuleType, Severity } from "@/lib/db/schema";
import type { AgricultureAssessment, EducationAssessment, HealthAssessment } from "../schemas";

export interface RiskInput {
  module: ModuleType;
  health?: HealthAssessment | null;
  agriculture?: AgricultureAssessment | null;
  education?: EducationAssessment | null;
  languageConfidence: number;
  domainConfidence: number;
  safetyViolations?: string[];
  lowConfidenceThreshold?: number;
}

export interface RiskResult {
  score: number; // 0..1
  level: Severity;
  flags: string[];
  escalationRequired: boolean;
  escalationReason: string | null;
  lowConfidence: boolean;
  confidence: number;
}

const SEVERITY_SCORE: Record<Severity, number> = { low: 0.15, medium: 0.4, high: 0.7, critical: 0.95 };

export function scoreRisk(input: RiskInput): RiskResult {
  const threshold = input.lowConfidenceThreshold ?? 0.55;
  const flags: string[] = [];
  let score = 0.1;
  let reason: string | null = null;

  if (input.module === "health" && input.health) {
    const h = input.health;
    score = SEVERITY_SCORE[h.severity];
    flags.push(...h.emergencyFlags.map((f) => `danger:${f}`));
    if (h.pregnancyStatus === "pregnant") {
      score = Math.max(score, 0.55);
      flags.push("grossesse");
    }
    if (h.ageGroup === "infant") {
      score = Math.max(score, 0.5);
      flags.push("nourrisson");
    }
    if (h.clinicReferral === "immediately") reason = "Signes de danger : orientation immédiate vers un centre de santé";
    else if (h.clinicReferral === "today") reason = "Consultation recommandée aujourd'hui";
  } else if (input.module === "agriculture" && input.agriculture) {
    const a = input.agriculture;
    score = SEVERITY_SCORE[a.severity];
    if (a.urgent) {
      score = Math.max(score, 0.7);
      flags.push("propagation");
      reason = "Risque de propagation ou de pertes importantes";
    }
    if (a.issueType === "livestock_illness") flags.push("elevage");
  } else if (input.module === "education" && input.education) {
    score = 0.1;
    if (input.education.learningDifficulty && input.education.learningDifficulty !== "none") flags.push(`difficulte:${input.education.learningDifficulty}`);
  }

  const confidence = Math.min(input.languageConfidence, input.domainConfidence);
  const lowConfidence = confidence < threshold;
  if (lowConfidence) flags.push("confiance_faible");
  if (input.safetyViolations?.length) flags.push("contenu_filtre");

  let level: Severity = score >= 0.85 ? "critical" : score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";
  // Health with low confidence never stays "low": a human should look.
  if (input.module === "health" && lowConfidence && level === "low") level = "medium";

  const escalationRequired = level === "critical" || level === "high" || (input.module === "health" && lowConfidence && score >= 0.35);
  if (escalationRequired && !reason) reason = lowConfidence ? "Compréhension incertaine d'un cas de santé" : "Niveau de risque élevé";

  return { score: Number(score.toFixed(2)), level, flags, escalationRequired, escalationReason: escalationRequired ? reason : null, lowConfidence, confidence: Number(confidence.toFixed(2)) };
}
