/**
 * Versioned clinical decision-tree DSL (FR-HE-01..04).
 *
 * A protocol is plain JSON: it can be stored in `protocol_versions.definition`, diffed,
 * reviewed by the Clinical Review Board and replayed. The engine in ./engine.ts is the
 * ONLY thing that decides severity — the language model never touches it.
 *
 * Severity scale (platform-wide):
 *   0 self-care · 1 monitor at home · 2 clinic within 24 h · 3 clinic today · 4 emergency now
 */
import type { LanguageCode } from "@/lib/db/schema";

export type SeverityLevel = 0 | 1 | 2 | 3 | 4;

/** Every citizen-facing string of a protocol exists in the five platform languages. */
export type LocalisedText = Record<LanguageCode, string>;

export type QuestionType =
  | "age_months"
  | "days"
  | "yes_no"
  | "multi_yes_no"
  | "choice"
  | "number"
  | "free";

/** JSON-serialisable, side-effect-free predicate over collected answers. */
export type ProtocolCondition =
  | { q: string; op: "eq" | "ne"; value: string | number | boolean }
  | { q: string; op: "lt" | "lte" | "gt" | "gte"; value: number }
  | { q: string; op: "includes" | "excludes"; value: string }
  | { q: string; op: "answered" | "unanswered" }
  | { q: string; op: "count_gte"; value: number }
  | { all: ProtocolCondition[] }
  | { any: ProtocolCondition[] }
  | { not: ProtocolCondition };

export interface ProtocolRedFlag {
  /** Stable rule id reported in `triggered_rule_ids` and auditable, e.g. RF-FEVU5-CONVULSION. */
  id: string;
  when: ProtocolCondition;
  /** Short French label of the danger sign (internal / worker-facing). */
  label: string;
}

export interface ProtocolOption {
  value: string;
  label: LocalisedText;
}

export interface ProtocolQuestion {
  id: string;
  ask: LocalisedText;
  type: QuestionType;
  options?: ProtocolOption[];
  /** Unanswered optional questions never block the tree; required ones ask a clarification. */
  optional?: boolean;
  redFlags?: ProtocolRedFlag[];
  /** Red flags always mean "severity 4, now" — kept explicit so the JSON is self-describing. */
  onRedFlag?: { severity: 4; action: string };
  /** First matching branch wins; `null` ends the tree. */
  branches?: Array<{ when: ProtocolCondition; next: string | null }>;
  next?: string | null;
}

export interface ProtocolRule {
  id: string;
  when: ProtocolCondition;
  severity: SeverityLevel;
}

export interface ProtocolOutcome {
  /** Machine action code, e.g. "REFER_EMERGENCY_NOW". */
  action: string;
  text: LocalisedText;
}

export type OutcomeKey = "severity_0" | "severity_1" | "severity_2" | "severity_3" | "severity_4";

export interface HealthProtocol {
  id: string;
  version: string;
  title: string;
  approvedBy: string;
  module: "health";
  /** Knowledge-base documents backing this protocol (AI-04 citation source). */
  citations: string[];
  /** Self-care leaflets offered with low-severity outcomes (HEA-003). */
  selfCareContentIds: string[];
  entry: string;
  defaultSeverity: SeverityLevel;
  questions: Record<string, ProtocolQuestion>;
  rules: ProtocolRule[];
  outcomes: Record<OutcomeKey, ProtocolOutcome>;
}

export type AnswerValue = string | number | boolean | string[] | null;
export type AnswerMap = Record<string, AnswerValue>;

export const RISK_BANDS = ["emergency", "urgent", "routine", "self_care", "insufficient_information"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const CARE_DESTINATIONS = ["self_care_home", "community_health_worker", "health_centre", "hospital", "emergency_referral"] as const;
export type CareDestinationType = (typeof CARE_DESTINATIONS)[number];

export const TIME_TO_ACTION = ["immediate", "same_day", "within_24h", "within_72h", "routine_visit", "none"] as const;
export type TimeToAction = (typeof TIME_TO_ACTION)[number];

/** Deterministic severity → contract mapping (HEA-001). */
export const SEVERITY_BAND: Record<SeverityLevel, RiskBand> = {
  0: "self_care",
  1: "routine",
  2: "urgent",
  3: "urgent",
  4: "emergency",
};

export const SEVERITY_TIME: Record<SeverityLevel, TimeToAction> = {
  0: "none",
  1: "within_72h",
  2: "within_24h",
  3: "same_day",
  4: "immediate",
};

export const SEVERITY_DESTINATION: Record<SeverityLevel, CareDestinationType> = {
  0: "self_care_home",
  1: "community_health_worker",
  2: "health_centre",
  3: "health_centre",
  4: "emergency_referral",
};

/** Hours until the follow-up contact is due (HEA-005). */
export const SEVERITY_FOLLOW_UP_HOURS: Record<SeverityLevel, number> = { 0: 168, 1: 72, 2: 24, 3: 6, 4: 2 };

export function outcomeKey(severity: SeverityLevel): OutcomeKey {
  return `severity_${severity}` as OutcomeKey;
}
