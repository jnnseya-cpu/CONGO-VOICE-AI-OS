/**
 * Risk Agent — deterministic scoring so that escalation behaviour is auditable and testable.
 * Model outputs feed in as signals; the rules decide.
 */
import type { ModuleType, Severity } from "@/lib/db/schema";
import type { AgricultureAssessment, EducationAssessment, HealthAssessment } from "../schemas";
import type { RiskBand, SeverityLevel } from "../protocols/types";

export interface RiskInput {
  module: ModuleType;
  health?: HealthAssessment | null;
  agriculture?: AgricultureAssessment | null;
  education?: EducationAssessment | null;
  languageConfidence: number;
  domainConfidence: number;
  safetyViolations?: string[];
  lowConfidenceThreshold?: number;
  /**
   * Severity decided by the deterministic health protocol engine (0–4). The risk agent may
   * RAISE it (low confidence, pregnancy, safeguarding) but never lower it.
   */
  severityLevel?: SeverityLevel | null;
  riskBand?: RiskBand | null;
  /**
   * Citations backing the recommendation. When the array is present and empty for health or
   * agriculture, the recommendation is blocked and a human must review it (AI-04 / AI-13).
   * Leave undefined to keep the legacy behaviour for callers that do not cite yet.
   */
  citations?: string[];
  /** A safeguarding disclosure always requires a human, whatever the clinical severity. */
  safeguarding?: boolean;
  /** Human review already demanded upstream (contract violation, prohibited claim…). */
  humanReviewRequired?: boolean;
}

export interface RiskResult {
  score: number; // 0..1
  level: Severity;
  flags: string[];
  escalationRequired: boolean;
  escalationReason: string | null;
  lowConfidence: boolean;
  confidence: number;
  /** Final protocol severity after the "raise only" rule; null outside protocol-driven modules. */
  severityLevel: SeverityLevel | null;
  riskBand: RiskBand | null;
  /** False when a health or agriculture recommendation carries no citation. */
  citationsOk: boolean;
  /** True when the recommendation must not be delivered as written (uncited or prohibited). */
  blocked: boolean;
  blockReason: string | null;
  humanReviewRequired: boolean;
}

const SEVERITY_SCORE: Record<Severity, number> = { low: 0.15, medium: 0.4, high: 0.7, critical: 0.95 };

/** 0 self-care · 1 monitor · 2 clinic within 24 h · 3 clinic today · 4 emergency now. */
const LEVEL_SCORE: Record<SeverityLevel, number> = { 0: 0.05, 1: 0.2, 2: 0.45, 3: 0.75, 4: 0.95 };
const LEVEL_TO_SEVERITY: Record<SeverityLevel, Severity> = { 0: "low", 1: "low", 2: "medium", 3: "high", 4: "critical" };
const SEVERITY_TO_LEVEL: Record<Severity, SeverityLevel> = { low: 1, medium: 2, high: 3, critical: 4 };
const LEVEL_BAND: Record<SeverityLevel, RiskBand> = { 0: "self_care", 1: "routine", 2: "urgent", 3: "urgent", 4: "emergency" };

/** Modules where every recommendation must cite an approved source. */
const CITATION_REQUIRED: ModuleType[] = ["health", "agriculture"];

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

  // Deterministic protocol severity: it sets the floor. Rules above may only raise it.
  let severityLevel: SeverityLevel | null = null;
  if (input.severityLevel !== null && input.severityLevel !== undefined) {
    severityLevel = input.severityLevel;
    score = Math.max(score, LEVEL_SCORE[severityLevel]);
    if (SEVERITY_SCORE[level] > LEVEL_SCORE[severityLevel]) {
      // Another signal is more alarming than the protocol: raise, never lower.
      severityLevel = SEVERITY_TO_LEVEL[level] > severityLevel ? SEVERITY_TO_LEVEL[level] : severityLevel;
    }
    level = LEVEL_TO_SEVERITY[severityLevel];
    flags.push(`protocole:niveau_${severityLevel}`);
  }

  // Citation enforcement (AI-04 / AI-13).
  const citationsOk = !(CITATION_REQUIRED.includes(input.module) && input.citations !== undefined && input.citations.length === 0);
  let blocked = false;
  let blockReason: string | null = null;
  if (!citationsOk) {
    blocked = true;
    blockReason = "Recommandation sans source approuvée : réponse de repli et revue humaine";
    flags.push("citation_manquante");
    score = Math.max(score, 0.5);
    if (level === "low") level = "medium";
    if (severityLevel !== null && severityLevel < 2) severityLevel = 2;
  }
  if (input.safetyViolations?.length) {
    blocked = true;
    blockReason = blockReason ?? "Contenu interdit filtré : revue humaine requise";
  }

  if (input.safeguarding) {
    flags.push("sauvegarde");
    score = Math.max(score, 0.7);
    if (level === "low" || level === "medium") level = "high";
    if (severityLevel !== null && severityLevel < 3) severityLevel = 3;
  }

  const escalationRequired =
    level === "critical" ||
    level === "high" ||
    blocked ||
    Boolean(input.safeguarding) ||
    (input.module === "health" && lowConfidence && score >= 0.35);
  if (escalationRequired && !reason) {
    reason = input.safeguarding
      ? "Divulgation relevant du dispositif de protection"
      : blocked
        ? blockReason
        : lowConfidence
          ? "Compréhension incertaine d'un cas de santé"
          : "Niveau de risque élevé";
  }

  const humanReviewRequired = Boolean(input.humanReviewRequired) || escalationRequired || blocked || Boolean(input.safeguarding);
  const riskBand: RiskBand | null = severityLevel !== null ? (blocked ? LEVEL_BAND[severityLevel] : (input.riskBand ?? LEVEL_BAND[severityLevel])) : (input.riskBand ?? null);

  return {
    score: Number(score.toFixed(2)),
    level,
    flags,
    escalationRequired,
    escalationReason: escalationRequired ? reason : null,
    lowConfidence,
    confidence: Number(confidence.toFixed(2)),
    severityLevel,
    riskBand,
    citationsOk,
    blocked,
    blockReason,
    humanReviewRequired,
  };
}
