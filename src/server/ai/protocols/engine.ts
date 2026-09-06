/**
 * Deterministic protocol engine (FR-HE-01..04).
 *
 * Pure functions, no I/O, no model calls: given a protocol and a map of answers it walks the
 * versioned decision tree and returns the severity, the triggered rule ids and the outcome.
 * Any red flag ends the walk immediately with severity 4 (FR-HE-03).
 */
import type {
  AnswerMap,
  AnswerValue,
  CareDestinationType,
  HealthProtocol,
  ProtocolCondition,
  ProtocolQuestion,
  RiskBand,
  SeverityLevel,
  TimeToAction,
} from "./types";
import {
  SEVERITY_BAND,
  SEVERITY_DESTINATION,
  SEVERITY_FOLLOW_UP_HOURS,
  SEVERITY_TIME,
  outcomeKey,
} from "./types";

const MAX_STEPS = 64;

function isAnswered(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function asNumber(v: AnswerValue | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asList(v: AnswerValue | undefined): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

/** Evaluates a protocol condition. Unknown answers never make a condition true (fail-safe). */
export function evaluateCondition(cond: ProtocolCondition, answers: AnswerMap): boolean {
  if ("all" in cond) return cond.all.every((c) => evaluateCondition(c, answers));
  if ("any" in cond) return cond.any.some((c) => evaluateCondition(c, answers));
  if ("not" in cond) return !evaluateCondition(cond.not, answers);
  const value = answers[cond.q];
  switch (cond.op) {
    case "answered":
      return isAnswered(value);
    case "unanswered":
      return !isAnswered(value);
    case "eq":
      if (!isAnswered(value)) return false;
      if (typeof cond.value === "boolean") return value === cond.value;
      if (typeof cond.value === "number") return asNumber(value) === cond.value;
      return String(value) === String(cond.value);
    case "ne":
      if (!isAnswered(value)) return false;
      if (typeof cond.value === "boolean") return value !== cond.value;
      if (typeof cond.value === "number") return asNumber(value) !== cond.value;
      return String(value) !== String(cond.value);
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const n = asNumber(value);
      if (n === null) return false;
      if (cond.op === "lt") return n < cond.value;
      if (cond.op === "lte") return n <= cond.value;
      if (cond.op === "gt") return n > cond.value;
      return n >= cond.value;
    }
    case "includes":
      return asList(value).includes(String(cond.value));
    case "excludes":
      return isAnswered(value) && !asList(value).includes(String(cond.value));
    case "count_gte":
      return asList(value).length >= cond.value;
  }
}

/** Which question comes next, applying branches before the default `next`. */
export function nextQuestionId(question: ProtocolQuestion, answers: AnswerMap): string | null {
  for (const branch of question.branches ?? []) {
    if (evaluateCondition(branch.when, answers)) return branch.next;
  }
  return question.next ?? null;
}

export interface TriggeredRedFlag {
  ruleId: string;
  questionId: string;
  label: string;
  action: string;
}

export interface ProtocolRunResult {
  protocolId: string;
  protocolVersion: string;
  /** `complete` when the tree finished, `needs_answers` when required questions are missing. */
  status: "complete" | "needs_answers";
  severityLevel: SeverityLevel;
  riskBand: RiskBand;
  timeToAction: TimeToAction;
  careDestinationType: CareDestinationType;
  triggeredRuleIds: string[];
  redFlags: TriggeredRedFlag[];
  /** Questions asked so far, in walk order. */
  path: string[];
  /** Up to two clarifications for this turn (AI-02). */
  pendingQuestions: ProtocolQuestion[];
  outcomeAction: string;
  outcomeText: Record<string, string>;
  answers: AnswerMap;
  selfCareContentIds: string[];
  citations: string[];
  followUpHours: number;
  /** True when the protocol completed without any question actually being answered. */
  unanswered: boolean;
}

export const MAX_CLARIFICATIONS = 2;

/** Reference used as a citation when a recommendation comes from a protocol (AI-04). */
export function protocolCitation(protocol: HealthProtocol): string {
  return `${protocol.id}@${protocol.version}`;
}

export function runProtocol(protocol: HealthProtocol, rawAnswers: AnswerMap): ProtocolRunResult {
  const answers: AnswerMap = { ...rawAnswers };
  const path: string[] = [];
  const redFlags: TriggeredRedFlag[] = [];
  const pending: ProtocolQuestion[] = [];
  const seen = new Set<string>();
  let cursor: string | null = protocol.entry;
  let steps = 0;
  let answeredCount = 0;

  while (cursor && steps++ < MAX_STEPS) {
    const question: ProtocolQuestion | undefined = protocol.questions[cursor];
    if (!question || seen.has(question.id)) break;
    seen.add(question.id);
    path.push(question.id);
    const answered = isAnswered(answers[question.id]);
    if (answered) answeredCount++;

    if (answered) {
      for (const flag of question.redFlags ?? []) {
        if (evaluateCondition(flag.when, answers)) {
          redFlags.push({
            ruleId: flag.id,
            questionId: question.id,
            label: flag.label,
            action: question.onRedFlag?.action ?? protocol.outcomes.severity_4.action,
          });
        }
      }
      // FR-HE-03: a red flag stops the tree at once — severity 4 without further questions.
      if (redFlags.length > 0) break;
      cursor = nextQuestionId(question, answers);
      continue;
    }

    if (question.optional) {
      cursor = nextQuestionId(question, answers);
      continue;
    }
    if (pending.length < MAX_CLARIFICATIONS) pending.push(question);
    if (pending.length >= MAX_CLARIFICATIONS) break;
    // A branching question cannot be looked past until it is answered.
    if (question.branches?.length) break;
    cursor = question.next ?? null;
  }

  const triggeredRuleIds: string[] = [];
  let severity: SeverityLevel;
  if (redFlags.length > 0) {
    severity = 4;
    triggeredRuleIds.push(...redFlags.map((f) => f.ruleId));
  } else {
    severity = protocol.defaultSeverity;
    for (const rule of protocol.rules) {
      if (evaluateCondition(rule.when, answers)) {
        triggeredRuleIds.push(rule.id);
        if (rule.severity > severity) severity = rule.severity;
      }
    }
  }

  // An emergency never waits: severity 4 (red flag or rule) stops the questioning at once.
  const status: ProtocolRunResult["status"] = redFlags.length > 0 || severity === 4 || pending.length === 0 ? "complete" : "needs_answers";
  const outcome = protocol.outcomes[outcomeKey(severity)];
  return {
    protocolId: protocol.id,
    protocolVersion: protocol.version,
    status,
    severityLevel: severity,
    riskBand: status === "needs_answers" && severity < 2 ? "insufficient_information" : SEVERITY_BAND[severity],
    timeToAction: SEVERITY_TIME[severity],
    careDestinationType: SEVERITY_DESTINATION[severity],
    triggeredRuleIds,
    redFlags,
    path,
    pendingQuestions: status === "needs_answers" ? pending : [],
    outcomeAction: outcome.action,
    outcomeText: outcome.text,
    answers,
    selfCareContentIds: severity <= 1 ? protocol.selfCareContentIds : [],
    citations: [protocolCitation(protocol), ...protocol.citations],
    followUpHours: SEVERITY_FOLLOW_UP_HOURS[severity],
    unanswered: answeredCount === 0,
  };
}

/** Every rule id a protocol can ever report — used by the coverage tests and the admin console. */
export function protocolRuleIds(protocol: HealthProtocol): string[] {
  const ids = protocol.rules.map((r) => r.id);
  for (const q of Object.values(protocol.questions)) for (const f of q.redFlags ?? []) ids.push(f.id);
  return ids;
}

/** Structural validation — run on registration so a malformed protocol never goes live. */
export function validateProtocol(protocol: HealthProtocol): string[] {
  const problems: string[] = [];
  const ids = new Set(Object.keys(protocol.questions));
  if (!ids.has(protocol.entry)) problems.push(`${protocol.id}: entry "${protocol.entry}" is not a question`);
  const seenRuleIds = new Set<string>();
  for (const [key, q] of Object.entries(protocol.questions)) {
    if (q.id !== key) problems.push(`${protocol.id}: question key ${key} does not match id ${q.id}`);
    if (q.next && !ids.has(q.next)) problems.push(`${protocol.id}: ${q.id}.next → unknown ${q.next}`);
    for (const b of q.branches ?? []) if (b.next && !ids.has(b.next)) problems.push(`${protocol.id}: ${q.id} branch → unknown ${b.next}`);
    if ((q.redFlags ?? []).length > 0 && q.onRedFlag?.severity !== 4) problems.push(`${protocol.id}: ${q.id} has red flags but no onRedFlag severity 4`);
    for (const f of q.redFlags ?? []) {
      if (seenRuleIds.has(f.id)) problems.push(`${protocol.id}: duplicate rule id ${f.id}`);
      seenRuleIds.add(f.id);
    }
    if ((q.type === "choice" || q.type === "multi_yes_no") && !(q.options ?? []).length) problems.push(`${protocol.id}: ${q.id} (${q.type}) has no options`);
  }
  for (const r of protocol.rules) {
    if (seenRuleIds.has(r.id)) problems.push(`${protocol.id}: duplicate rule id ${r.id}`);
    seenRuleIds.add(r.id);
  }
  for (const key of ["severity_0", "severity_1", "severity_2", "severity_3", "severity_4"] as const) {
    if (!protocol.outcomes[key]?.action) problems.push(`${protocol.id}: missing outcome ${key}`);
  }
  return problems;
}
