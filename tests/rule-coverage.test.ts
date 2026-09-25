import { describe, expect, it } from "vitest";

import { HEALTH_PROTOCOLS } from "@server/ai/protocols/definitions";
import { evaluateCondition, runProtocol as runEngine } from "@server/ai/protocols/engine";
import type { AnswerMap, AnswerValue, ProtocolCondition, HealthProtocol, ProtocolQuestion } from "@server/ai/protocols/types";

/**
 * NFR-010, second half: every branch of every safety rule pack, exercised.
 *
 * A percentage of lines says nothing about whether the rule that sends a
 * convulsing child to hospital tonight has ever fired. This walks each
 * protocol, builds the answers that satisfy each red flag and each severity
 * rule, runs the real engine, and asserts the identifier appears in what the
 * engine reports. A rule nobody can trigger is a rule that does not exist.
 */

/** Builds an answer set that satisfies a condition, or reports that it cannot. */
function answersFor(condition: ProtocolCondition, into: AnswerMap = {}): AnswerMap | null {
  if ("all" in condition) {
    let acc: AnswerMap | null = into;
    for (const part of condition.all) {
      acc = acc && answersFor(part, acc);
      if (!acc) return null;
    }
    return acc;
  }
  if ("any" in condition) {
    for (const part of condition.any) {
      const attempt = answersFor(part, { ...into });
      if (attempt) return attempt;
    }
    return null;
  }
  if ("not" in condition) {
    const inner = condition.not;
    if ("q" in inner) {
      const copy = { ...into };
      delete copy[inner.q];
      return copy;
    }
    return into;
  }

  const q = condition.q;
  const set = (value: AnswerValue): AnswerMap => ({ ...into, [q]: value });
  switch (condition.op) {
    case "eq":
      return set(condition.value as AnswerValue);
    case "ne":
      return set(typeof condition.value === "number" ? condition.value + 1 : `not-${String(condition.value)}`);
    case "lt":
      return set(condition.value - 1);
    case "lte":
      return set(condition.value);
    case "gt":
      return set(condition.value + 1);
    case "gte":
      return set(condition.value);
    case "includes":
      return set([condition.value]);
    case "excludes":
      return { ...into, [q]: ["__aucun__"] };
    case "answered":
      return set("oui");
    case "unanswered": {
      const copy = { ...into };
      delete copy[q];
      return copy;
    }
    case "count_gte":
      return set(Array.from({ length: condition.value }, (_, i) => `item-${i}`));
    default:
      return null;
  }
}

/** Answers worth trying for a question, in the order a walker should try them. */
function candidateAnswers(question: ProtocolQuestion): AnswerValue[] {
  if (question.options?.length) return question.options.map((o) => o.value);
  switch (question.type) {
    case "yes_no":
      return [true, false];
    case "multi_yes_no":
      return [["__aucun__"]];
    case "age_months":
      return [36, 1, 120];
    case "days":
      return [1, 3, 10];
    case "number":
      return [1, 0, 40];
    default:
      return ["rien", 1];
  }
}

/** The engine's own branching rule: first matching branch wins, otherwise `next`. */
function nextAfter(question: ProtocolQuestion, answers: AnswerMap): string | null {
  for (const branch of question.branches ?? []) {
    if (evaluateCondition(branch.when, answers)) return branch.next;
  }
  return question.next ?? null;
}

function tripsRedFlag(question: ProtocolQuestion, answers: AnswerMap): boolean {
  return (question.redFlags ?? []).some((f) => evaluateCondition(f.when, answers));
}

/**
 * The answers needed to reach a question without tripping anything on the way.
 *
 * A red flag ends the walk, so every question before the target must be
 * answered in a way that fires nothing. A target that cannot be reached this
 * way is a rule the engine can never evaluate, which is exactly what this
 * should catch.
 */
function pathTo(protocol: HealthProtocol, targetId: string): AnswerMap | null {
  const queue: Array<{ cursor: string; answers: AnswerMap; seen: Set<string> }> = [
    { cursor: protocol.entry, answers: {}, seen: new Set() },
  ];
  while (queue.length > 0) {
    const { cursor, answers, seen } = queue.shift()!;
    if (cursor === targetId) return answers;
    if (seen.has(cursor)) continue;
    const question = protocol.questions[cursor];
    if (!question) continue;
    const nextSeen = new Set(seen).add(cursor);

    for (const candidate of candidateAnswers(question)) {
      const attempt: AnswerMap = { ...answers, [question.id]: candidate };
      if (tripsRedFlag(question, attempt)) continue;
      const next = nextAfter(question, attempt);
      if (!next) continue;
      queue.push({ cursor: next, answers: attempt, seen: nextSeen });
    }
    // An optional question can also simply be skipped.
    if (question.optional && question.next) {
      queue.push({ cursor: question.next, answers, seen: nextSeen });
    }
  }
  return null;
}

interface RuleRef {
  protocol: HealthProtocol;
  id: string;
  kind: "red_flag" | "rule";
  when: ProtocolCondition;
  /** For a red flag, the question it hangs on: it is evaluated only once that question is reached. */
  questionId?: string;
}

function allRules(): RuleRef[] {
  const out: RuleRef[] = [];
  for (const protocol of HEALTH_PROTOCOLS) {
    for (const question of Object.values(protocol.questions)) {
      for (const flag of question.redFlags ?? []) out.push({ protocol, id: flag.id, kind: "red_flag", when: flag.when, questionId: question.id });
    }
    for (const rule of protocol.rules) out.push({ protocol, id: rule.id, kind: "rule", when: rule.when });
  }
  return out;
}

const RULES = allRules();

describe("safety rule packs", () => {
  it("declares rules at all, and gives each one a stable identifier", () => {
    expect(RULES.length).toBeGreaterThan(30);
    const ids = RULES.map((r) => `${r.protocol.id}:${r.id}`);
    expect(new Set(ids).size, "two rules share an identifier within one protocol").toBe(ids.length);
    for (const r of RULES) expect(r.id, `${r.protocol.id} has an unnamed rule`).toMatch(/^[A-Z][A-Z0-9-]+$/);
  });

  it.each(RULES.map((r) => [`${r.protocol.id} · ${r.id}`, r] as const))("%s can be triggered", (_label, rule) => {
    // A red flag is only evaluated once its question is reached, so the answers
    // that satisfy it are layered on top of a clean path to that question.
    const prefix = rule.questionId ? pathTo(rule.protocol, rule.questionId) : {};
    expect(prefix, `${rule.questionId} is unreachable in ${rule.protocol.id}`).not.toBeNull();
    const answers = answersFor(rule.when, { ...prefix });
    expect(answers, `no answer set satisfies ${rule.id}`).not.toBeNull();
    const run = runEngine(rule.protocol, answers!);
    expect(run.triggeredRuleIds, `${rule.id} did not fire for ${JSON.stringify(answers)} (severity ${run.severityLevel})`).toContain(rule.id);
  });

  it("grades every red flag as an emergency, without exception", () => {
    for (const rule of RULES.filter((r) => r.kind === "red_flag")) {
      const prefix = rule.questionId ? pathTo(rule.protocol, rule.questionId) : {};
      if (!prefix) continue;
      const answers = answersFor(rule.when, { ...prefix });
      if (!answers) continue;
      const run = runEngine(rule.protocol, answers);
      expect(run.severityLevel, `${rule.protocol.id}:${rule.id}`).toBe(4);
      expect(run.riskBand).toBe("emergency");
    }
  });

  it("gives every protocol an outcome for every severity it can reach", () => {
    for (const protocol of HEALTH_PROTOCOLS) {
      for (const key of ["severity_0", "severity_1", "severity_2", "severity_3", "severity_4"] as const) {
        expect(protocol.outcomes[key], `${protocol.id} has no ${key} outcome`).toBeTruthy();
        expect(protocol.outcomes[key].text.fr.length, `${protocol.id} ${key} has no French wording`).toBeGreaterThan(10);
      }
    }
  });
});
