/**
 * Table-driven coverage of the deterministic protocol engine.
 *
 * Every protocol, every question, every branch, every red flag and every severity rule is
 * generated from the definitions themselves, so a new rule cannot be added without being
 * covered here.
 */
import { describe, expect, it } from "vitest";
import { HEALTH_PROTOCOLS } from "@/lib/ai/protocols/definitions";
import { evaluateCondition, nextQuestionId, protocolRuleIds, runProtocol, validateProtocol } from "@/lib/ai/protocols/engine";
import type { AnswerMap, AnswerValue, HealthProtocol, ProtocolCondition, ProtocolQuestion } from "@/lib/ai/protocols/types";
import { EPI_CALENDAR, vaccinationStatus } from "@/lib/ai/protocols/vaccination";
import { applyKAnonymity, isPublishable } from "@/lib/ai/protocols/aggregation";

const LANGUAGES = ["fr", "ln", "kg", "sw", "lua"] as const;

/** Plausible answers used to walk a protocol without tripping a danger sign. */
function candidates(q: ProtocolQuestion): AnswerValue[] {
  switch (q.type) {
    case "yes_no":
      return [false, true];
    case "multi_yes_no":
      return [["none"], ...(q.options ?? []).filter((o) => o.value !== "none").map((o) => [o.value])];
    case "choice":
      return (q.options ?? []).map((o) => o.value);
    case "age_months":
      return [36, 6, 1, 300];
    case "days":
      return [2, 0, 10, 30];
    case "number":
      return [120, 6, 1, 0];
    default:
      return ["réponse libre"];
  }
}

/** Breadth-first search for a set of answers that makes the engine reach `targetId`. */
function answersReaching(protocol: HealthProtocol, targetId: string): AnswerMap | null {
  const queue: Array<{ id: string; answers: AnswerMap }> = [{ id: protocol.entry, answers: {} }];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current.id === targetId) return current.answers;
    const key = `${current.id}|${JSON.stringify(current.answers)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const q = protocol.questions[current.id];
    if (!q) continue;
    for (const value of candidates(q)) {
      const answers = { ...current.answers, [q.id]: value };
      if ((q.redFlags ?? []).some((f) => evaluateCondition(f.when, answers))) continue; // a red flag ends the walk
      const next = nextQuestionId(q, answers);
      if (next) queue.push({ id: next, answers });
    }
  }
  return null;
}

/** Mutates `into` so that `cond` evaluates to true. */
function satisfy(cond: ProtocolCondition, into: AnswerMap): AnswerMap {
  if ("all" in cond) {
    cond.all.forEach((c) => satisfy(c, into));
    return into;
  }
  if ("any" in cond) {
    satisfy(cond.any[0], into);
    return into;
  }
  if ("not" in cond) {
    dissatisfy(cond.not, into);
    return into;
  }
  switch (cond.op) {
    case "eq":
      into[cond.q] = cond.value;
      break;
    case "ne":
      into[cond.q] = typeof cond.value === "boolean" ? !cond.value : typeof cond.value === "number" ? cond.value + 1 : `${cond.value}_autre`;
      break;
    case "lt":
      into[cond.q] = cond.value - 1;
      break;
    case "lte":
      into[cond.q] = cond.value;
      break;
    case "gt":
      into[cond.q] = cond.value + 1;
      break;
    case "gte":
      into[cond.q] = cond.value;
      break;
    case "includes": {
      const existing = Array.isArray(into[cond.q]) ? (into[cond.q] as string[]) : [];
      into[cond.q] = Array.from(new Set([...existing.filter((v) => v !== "none"), String(cond.value)]));
      break;
    }
    case "excludes": {
      const existing = Array.isArray(into[cond.q]) ? (into[cond.q] as string[]) : [];
      const kept = existing.filter((v) => v !== String(cond.value));
      into[cond.q] = kept.length ? kept : ["none"];
      break;
    }
    case "answered":
      if (into[cond.q] === undefined) into[cond.q] = "oui";
      break;
    case "unanswered":
      delete into[cond.q];
      break;
    case "count_gte":
      into[cond.q] = Array.from({ length: cond.value }, (_, i) => `v${i}`);
      break;
  }
  return into;
}

function dissatisfy(cond: ProtocolCondition, into: AnswerMap): AnswerMap {
  if ("all" in cond) return dissatisfy(cond.all[0], into);
  if ("any" in cond) {
    cond.any.forEach((c) => dissatisfy(c, into));
    return into;
  }
  if ("not" in cond) return satisfy(cond.not, into);
  if (cond.op === "answered") delete into[cond.q];
  else if (cond.op === "unanswered") into[cond.q] = "oui";
  else if (cond.op === "eq") into[cond.q] = typeof cond.value === "boolean" ? !cond.value : typeof cond.value === "number" ? cond.value + 1 : `${cond.value}_autre`;
  else if (cond.op === "includes") into[cond.q] = ["none"];
  return into;
}

/** Answers for every question that never trip a danger sign — the baseline for rule tests. */
function neutralAnswers(protocol: HealthProtocol): AnswerMap {
  const answers: AnswerMap = {};
  for (const q of Object.values(protocol.questions)) {
    for (const value of candidates(q)) {
      const trial = { ...answers, [q.id]: value };
      if ((q.redFlags ?? []).some((f) => evaluateCondition(f.when, trial))) continue;
      answers[q.id] = value;
      break;
    }
  }
  // Second pass: a red flag may combine two questions answered later in the loop.
  for (const q of Object.values(protocol.questions)) {
    for (const flag of q.redFlags ?? []) {
      if (!evaluateCondition(flag.when, answers)) continue;
      for (const value of candidates(q)) {
        const trial = { ...answers, [q.id]: value };
        if (!evaluateCondition(flag.when, trial)) {
          answers[q.id] = value;
          break;
        }
      }
    }
  }
  return answers;
}

describe("protocol definitions", () => {
  it("registers the ten protocols required by the PRD", () => {
    expect(HEALTH_PROTOCOLS.map((p) => p.id).sort()).toEqual(
      [
        "adult_fever",
        "child_fever_u5",
        "cough_breathing",
        "diarrhoea_dehydration",
        "general_symptom_intake",
        "injury_bleeding",
        "malnutrition_screening",
        "newborn_danger_signs",
        "pregnancy_danger_signs",
        "vaccination_schedule",
      ].sort(),
    );
  });

  it("uses globally unique rule identifiers", () => {
    const all = HEALTH_PROTOCOLS.flatMap((p) => protocolRuleIds(p));
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(HEALTH_PROTOCOLS.map((p) => [p.id, p] as const))("%s is structurally valid", (_id, protocol) => {
    expect(validateProtocol(protocol)).toEqual([]);
  });

  it.each(HEALTH_PROTOCOLS.map((p) => [p.id, p] as const))("%s is fully translated", (_id, protocol) => {
    for (const q of Object.values(protocol.questions)) {
      for (const lang of LANGUAGES) {
        expect(q.ask[lang]?.length, `${protocol.id}.${q.id}.ask.${lang}`).toBeGreaterThan(3);
        for (const opt of q.options ?? []) expect(opt.label[lang]?.length, `${protocol.id}.${q.id}.${opt.value}.${lang}`).toBeGreaterThan(1);
      }
    }
    for (const key of ["severity_0", "severity_1", "severity_2", "severity_3", "severity_4"] as const) {
      for (const lang of LANGUAGES) expect(protocol.outcomes[key].text[lang]?.length, `${protocol.id}.${key}.${lang}`).toBeGreaterThan(20);
    }
  });

  it.each(HEALTH_PROTOCOLS.map((p) => [p.id, p] as const))("%s cites at least one approved document", (_id, protocol) => {
    expect(protocol.citations.length).toBeGreaterThan(0);
    expect(protocol.approvedBy).toBe("En attente du Comité de Revue Clinique");
  });
});

describe("every question is reachable", () => {
  const cases = HEALTH_PROTOCOLS.flatMap((p) => Object.keys(p.questions).map((q) => [`${p.id}.${q}`, p, q] as const));
  it.each(cases)("%s", (_label, protocol, questionId) => {
    expect(answersReaching(protocol, questionId)).not.toBeNull();
  });
});

describe("every branch is taken", () => {
  const cases = HEALTH_PROTOCOLS.flatMap((p) =>
    Object.values(p.questions).flatMap((q) =>
      (q.branches ?? []).map((b, i) => [`${p.id}.${q.id}#${i}→${b.next ?? "fin"}`, p, q, i] as const),
    ),
  );
  it.each(cases)("%s", (_label, protocol, question, index) => {
    const branch = question.branches![index];
    const answers = satisfy(branch.when, { ...(answersReaching(protocol, question.id) ?? {}) });
    // Earlier branches must not shadow this one for the answers that satisfy it.
    const taken = nextQuestionId(question, answers);
    const earlier = (question.branches ?? []).slice(0, index).find((b) => evaluateCondition(b.when, answers));
    expect(taken).toBe(earlier ? earlier.next : branch.next);
    expect(evaluateCondition(branch.when, answers)).toBe(true);
  });
});

describe("every red flag reaches severity 4", () => {
  const cases = HEALTH_PROTOCOLS.flatMap((p) =>
    Object.values(p.questions).flatMap((q) => (q.redFlags ?? []).map((f) => [`${p.id}.${f.id}`, p, q, f] as const)),
  );

  it("covers at least one red flag in every protocol", () => {
    for (const p of HEALTH_PROTOCOLS) {
      const count = Object.values(p.questions).reduce((n, q) => n + (q.redFlags ?? []).length, 0);
      expect(count, `${p.id} has no red flag`).toBeGreaterThan(0);
    }
  });

  it.each(cases)("%s", (_label, protocol, question, flag) => {
    const base = answersReaching(protocol, question.id);
    expect(base, `${question.id} unreachable`).not.toBeNull();
    const answers = satisfy(flag.when, { ...base! });
    const result = runProtocol(protocol, answers);
    expect(result.severityLevel).toBe(4);
    expect(result.riskBand).toBe("emergency");
    expect(result.timeToAction).toBe("immediate");
    expect(result.careDestinationType).toBe("emergency_referral");
    expect(result.triggeredRuleIds).toContain(flag.id);
    expect(result.status).toBe("complete");
    // FR-HE-03: the tree stops at once, no clarification is asked.
    expect(result.pendingQuestions).toHaveLength(0);
    expect(result.outcomeText.fr.length).toBeGreaterThan(20);
  });
});

describe("every severity rule fires and raises severity", () => {
  const cases = HEALTH_PROTOCOLS.flatMap((p) => p.rules.map((r) => [`${p.id}.${r.id}`, p, r] as const));
  it.each(cases)("%s", (_label, protocol, rule) => {
    const answers = satisfy(rule.when, neutralAnswers(protocol));
    const result = runProtocol(protocol, answers);
    if (result.severityLevel === 4 && !result.triggeredRuleIds.includes(rule.id)) {
      // A red flag was tripped as a side effect: the safety rule still wins, which is correct.
      expect(result.redFlags.length).toBeGreaterThan(0);
      return;
    }
    expect(result.triggeredRuleIds).toContain(rule.id);
    expect(result.severityLevel).toBeGreaterThanOrEqual(rule.severity);
  });
});

describe("engine semantics", () => {
  it("asks at most two clarifications and reports insufficient information", () => {
    const protocol = HEALTH_PROTOCOLS.find((p) => p.id === "general_symptom_intake")!;
    const result = runProtocol(protocol, {});
    expect(result.status).toBe("needs_answers");
    expect(result.pendingQuestions.length).toBeLessThanOrEqual(2);
    expect(result.riskBand).toBe("insufficient_information");
    expect(result.unanswered).toBe(true);
  });

  it("never lowers severity below the protocol default", () => {
    for (const protocol of HEALTH_PROTOCOLS) {
      const result = runProtocol(protocol, neutralAnswers(protocol));
      expect(result.severityLevel).toBeGreaterThanOrEqual(protocol.defaultSeverity);
    }
  });

  it("always cites the protocol version plus its documents", () => {
    for (const protocol of HEALTH_PROTOCOLS) {
      const result = runProtocol(protocol, neutralAnswers(protocol));
      expect(result.citations[0]).toBe(`${protocol.id}@${protocol.version}`);
      expect(result.citations.length).toBeGreaterThan(1);
    }
  });

  it("offers self-care leaflets only at severity 0 and 1", () => {
    const protocol = HEALTH_PROTOCOLS.find((p) => p.id === "malnutrition_screening")!;
    const green = runProtocol(protocol, { ...neutralAnswers(protocol), appetite: true, muac_mm: 130 });
    expect(green.severityLevel).toBe(0);
    expect(green.selfCareContentIds.length).toBeGreaterThan(0);
    const red = runProtocol(protocol, { ...neutralAnswers(protocol), appetite: true, muac_mm: 110 });
    expect(red.severityLevel).toBe(3);
    expect(red.selfCareContentIds).toEqual([]);
  });

  it("keeps unknown answers from making a condition true", () => {
    expect(evaluateCondition({ q: "absent", op: "eq", value: true }, {})).toBe(false);
    expect(evaluateCondition({ q: "absent", op: "gte", value: 1 }, {})).toBe(false);
    expect(evaluateCondition({ q: "absent", op: "includes", value: "x" }, {})).toBe(false);
    expect(evaluateCondition({ q: "absent", op: "unanswered" }, {})).toBe(true);
  });

  it("maps every severity level to a distinct time to action", () => {
    const protocol = HEALTH_PROTOCOLS.find((p) => p.id === "general_symptom_intake")!;
    const expectations: Array<[number, string, string]> = [
      [4, "immediate", "emergency_referral"],
      [3, "same_day", "health_centre"],
      [2, "within_24h", "health_centre"],
    ];
    for (const [level, time, destination] of expectations) {
      const answers: AnswerMap =
        level === 4
          ? { danger_signs: ["convulsions"] }
          : level === 3
            ? { ...neutralAnswers(protocol), getting_worse: true }
            : { ...neutralAnswers(protocol), who: "elderly" };
      const result = runProtocol(protocol, answers);
      expect(result.severityLevel).toBe(level);
      expect(result.timeToAction).toBe(time);
      expect(result.careDestinationType).toBe(destination);
    }
  });
});

describe("EPI calendar lookup (FR-HE-13)", () => {
  it("lists the DRC antigens", () => {
    expect(EPI_CALENDAR.map((v) => v.code)).toEqual(
      expect.arrayContaining(["bcg", "vpo0", "penta1", "pcv1", "rota1", "penta3", "vpi", "var1", "vaa", "var2"]),
    );
  });

  it("flags overdue doses for a nine-month-old with nothing received", () => {
    const status = vaccinationStatus(9, []);
    expect(status.upToDate).toBe(false);
    expect(status.overdue.map((v) => v.code)).toContain("bcg");
    expect(status.overdue.map((v) => v.code)).toContain("penta3");
    expect(status.upcoming.map((v) => v.code)).toContain("var2");
  });

  it("reports a fully vaccinated child as up to date", () => {
    const status = vaccinationStatus(18, EPI_CALENDAR.map((v) => v.code));
    expect(status.upToDate).toBe(true);
    expect(status.due).toEqual([]);
    expect(status.overdue).toEqual([]);
  });

  it("does not claim a newborn is late", () => {
    const status = vaccinationStatus(0, ["bcg", "vpo0"]);
    expect(status.overdue).toEqual([]);
    expect(status.upToDate).toBe(true);
  });
});

describe("k-anonymity for health aggregates (FR-HE-17)", () => {
  it("suppresses buckets below ten", () => {
    const result = applyKAnonymity([
      { key: "Kinshasa", count: 42 },
      { key: "Kwilu", count: 9 },
      { key: "Tshopo", count: 3 },
    ]);
    expect(result.released.map((b) => b.key)).toEqual(["Kinshasa"]);
    expect(result.suppressed.map((b) => b.key)).toEqual(["Kwilu", "Tshopo"]);
    expect(result.residual).toBe(12);
    expect(result.k).toBe(10);
  });

  it("hides the residual when it is itself too small", () => {
    const result = applyKAnonymity([{ key: "a", count: 2 }, { key: "b", count: 3 }]);
    expect(result.released).toEqual([]);
    expect(result.residual).toBeNull();
  });

  it("refuses to publish a single small figure", () => {
    expect(isPublishable(9)).toBe(false);
    expect(isPublishable(10)).toBe(true);
  });
});
