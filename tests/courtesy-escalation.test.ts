/**
 * A thank-you must not wake a health worker.
 *
 * A live queue showed "Alerte urgente — Kinshasa · Ce cas de santé nécessite une
 * revue urgente. La personne dit simplement merci. Elle ne parle d'aucun
 * symptôme…". The notification's own summary said there was nothing there while
 * escalating it anyway, and two of five alerts were that.
 *
 * Alert fatigue is not cosmetic in a health service: it is how the real
 * escalation — the child who cannot drink — gets skimmed past at three in the
 * morning. These tests hold both halves: courtesies stop escalating, and
 * everything that should escalate still does.
 */
import { describe, expect, it } from "vitest";
import { classifyCourtesy } from "@server/ai/agents/courtesy";
import { scoreRisk, type RiskInput } from "@server/ai/agents/risk";

const base: RiskInput = {
  module: "health",
  languageConfidence: 0.3,
  domainConfidence: 0.3,
  severityLevel: 0,
};

describe("telling a courtesy from a question", () => {
  for (const text of ["merci", "Merci !", "MERCI BEAUCOUP", "bonjour", "ok", "d'accord", "au revoir", "test"]) {
    it(`treats ${JSON.stringify(text)} as a courtesy`, () => {
      expect(classifyCourtesy(text).courtesy).toBe(true);
    });
  }

  for (const text of ["matondo", "mbote", "asante sana", "tuasakidila", "sawa"]) {
    it(`treats ${JSON.stringify(text)} as a courtesy in a national language`, () => {
      // A citizen thanking the service in Lingala must not wake a nurse any
      // more than one thanking it in French.
      expect(classifyCourtesy(text).courtesy).toBe(true);
    });
  }

  for (const text of [
    "mon enfant a de la fievre",
    "merci mais mon enfant tousse",
    "bonjour, mon manioc jaunit",
    "ok et pour la dose ?",
    "merci ?",
    "les feuilles de mon manioc jaunissent et se recroquevillent depuis trois jours",
    "je ne comprends pas les fractions",
  ]) {
    it(`treats ${JSON.stringify(text)} as a real request`, () => {
      expect(classifyCourtesy(text).courtesy).toBe(false);
    });
  }

  it("treats a question mark as an ask even among courtesies", () => {
    expect(classifyCourtesy("ok ?").courtesy).toBe(false);
  });

  it("treats anything it does not recognise as a request", () => {
    // Wrong in the safe direction: an unknown phrasing is a question nobody
    // wrote a rule for, not a greeting.
    expect(classifyCourtesy("nkisi ya mbote na kati").courtesy).toBe(false);
  });

  it("treats a long message as a request whatever the words", () => {
    expect(classifyCourtesy("merci merci merci merci merci merci merci").courtesy).toBe(false);
  });

  it("treats an empty message as a courtesy rather than an emergency", () => {
    expect(classifyCourtesy("").courtesy).toBe(true);
    expect(classifyCourtesy(null).courtesy).toBe(true);
  });
});

describe("what a courtesy exempts, and what it does not", () => {
  it("stops escalating a thank-you with nothing else at stake", () => {
    // The exact production case: low confidence, no severity, no flags.
    const before = scoreRisk({ ...base, courtesy: false });
    const after = scoreRisk({ ...base, courtesy: true });
    expect(before.escalationRequired).toBe(true);
    expect(after.escalationRequired).toBe(false);
    expect(after.flags).toContain("politesse");
  });

  it("still escalates a safeguarding disclosure, however politely phrased", () => {
    const r = scoreRisk({ ...base, courtesy: true, safeguarding: true });
    expect(r.escalationRequired).toBe(true);
  });

  it("still escalates when the protocol engine set a severity", () => {
    const r = scoreRisk({ ...base, courtesy: true, severityLevel: 4 });
    expect(r.escalationRequired).toBe(true);
  });

  it("still escalates when content was filtered", () => {
    const r = scoreRisk({ ...base, courtesy: true, safetyViolations: ["prohibited_dose"] });
    expect(r.escalationRequired).toBe(true);
  });

  it("still escalates when review was demanded upstream", () => {
    const r = scoreRisk({ ...base, courtesy: true, humanReviewRequired: true });
    expect(r.escalationRequired).toBe(true);
  });

  it("still escalates a danger sign", () => {
    const r = scoreRisk({
      ...base,
      courtesy: true,
      health: {
        severity: "critical",
        emergencyFlags: ["ne_peut_pas_boire"],
        clinicReferral: "immediately",
        pregnancyStatus: "unknown",
        ageGroup: "child",
      } as RiskInput["health"],
    });
    expect(r.escalationRequired).toBe(true);
  });

  it("does not silently lower a severity the protocol engine raised", () => {
    // The raise-only rule is the backbone of the safety design; a courtesy
    // exemption must not become a way around it.
    const r = scoreRisk({ ...base, courtesy: true, severityLevel: 3 });
    expect(r.escalationRequired).toBe(true);
  });
});
