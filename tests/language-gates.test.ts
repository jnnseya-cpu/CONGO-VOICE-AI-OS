import { beforeEach, describe, expect, it } from "vitest";

import {
  MIN_EVALUATION_SAMPLE,
  evaluateGates,
  gatesFor,
  languageMode,
  recordLanguageQuality,
  resetLanguageStatusCache,
} from "@server/ai/language/gates";
import { getDb, resetDbForTests } from "@server/db/client";

const PASSING = {
  werClean: 0.15,
  werField: 0.26,
  intentAccuracy: 0.93,
  emergencyRecall: 0.99,
  ttsMos: 4.1,
  languageIdAccuracy: 0.97,
  sampleSize: 2000,
};

describe("quality gates (§6.5)", () => {
  it("holds French to a tighter transcription bar", () => {
    expect(gatesFor("fr", "health").maxWerClean).toBe(0.12);
    expect(gatesFor("ln", "health").maxWerClean).toBe(0.2);
  });

  it("drops the emergency-recall gate outside health, and eases the intent bar", () => {
    const edu = gatesFor("ln", "education");
    expect(edu.minEmergencyRecall).toBe(0);
    expect(edu.minIntentAccuracy).toBe(0.85);
    expect(gatesFor("ln", "health").minIntentAccuracy).toBe(0.9);
  });

  it("passes a language that meets every threshold", () => {
    expect(evaluateGates(PASSING, gatesFor("ln", "health"))).toEqual({ passes: true, failedGates: [] });
  });

  it("names the gate that failed, and by how much", () => {
    const verdict = evaluateGates({ ...PASSING, emergencyRecall: 0.9 }, gatesFor("ln", "health"));
    expect(verdict.passes).toBe(false);
    expect(verdict.failedGates.join(" ")).toContain("rappel des urgences 90 % < 98 %");
  });

  it("treats an unmeasured metric as a failure, not as a pass", () => {
    const verdict = evaluateGates({ ...PASSING, werField: null }, gatesFor("ln", "health"));
    expect(verdict.passes).toBe(false);
    expect(verdict.failedGates.some((f) => f.includes("non mesuré"))).toBe(true);
  });

  it("refuses to decide on too small an evaluation set", () => {
    const verdict = evaluateGates({ ...PASSING, sampleSize: MIN_EVALUATION_SAMPLE - 1 }, gatesFor("ln", "health"));
    expect(verdict.passes).toBe(false);
    expect(verdict.failedGates.some((f) => f.includes("échantillon"))).toBe(true);
  });
});

describe("what a language is allowed to do (AI-18)", () => {
  beforeEach(async () => {
    resetDbForTests();
    resetLanguageStatusCache();
    await getDb();
  });

  it("serves scripts for a language nobody has evaluated", async () => {
    const status = await languageMode("lua", "health");
    expect(status.mode).toBe("scripted");
    expect(status.reason).toBe("never_measured");
  });

  it("opens a language once its numbers pass", async () => {
    await recordLanguageQuality({ language: "ln", module: "health", metrics: PASSING });
    const status = await languageMode("ln", "health");
    expect(status.mode).toBe("full");
    expect(status.failedGates).toEqual([]);
  });

  it("closes it again when a later measurement fails", async () => {
    await recordLanguageQuality({ language: "ln", module: "health", metrics: PASSING });
    expect((await languageMode("ln", "health")).mode).toBe("full");

    // A model change degrades transcription: the language comes back out without
    // anyone having to remember to withdraw it.
    await recordLanguageQuality({ language: "ln", module: "health", metrics: { ...PASSING, werField: 0.44 } });
    const after = await languageMode("ln", "health");
    expect(after.mode).toBe("scripted");
    expect(after.failedGates.join(" ")).toContain("WER terrain");
  });

  it("keeps the decision per module", async () => {
    await recordLanguageQuality({ language: "sw", module: "education", metrics: PASSING });
    expect((await languageMode("sw", "education")).mode).toBe("full");
    // Health was never measured for this language and stays closed.
    expect((await languageMode("sw", "health")).mode).toBe("scripted");
  });
});
