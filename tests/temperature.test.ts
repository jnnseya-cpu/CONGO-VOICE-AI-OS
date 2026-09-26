/**
 * A number the citizen gave decides, not the word next to it.
 *
 * "Un parent parle de son enfant de 3 ans… il mentionne une température de 36
 * degrés" was routed to the fever protocol and escalated. 36 °C is normal. A
 * parent who measured, found nothing wrong, and reported it was answered as
 * though measuring had made things worse.
 *
 * The mirror error was more dangerous: a low reading matched the same word and
 * was also handled as fever, when a cold infant needs warming and a clinic —
 * the opposite advice.
 */
import { describe, expect, it } from "vitest";
import { TEMPERATURE, readTemperature } from "@server/ai/protocols/extraction";

describe("reading a temperature out of what somebody said", () => {
  for (const [text, expected] of [
    ["une température de 36 degrés", 36],
    ["il a 38.5 degrés", 38.5],
    ["température 39,2", 39.2],
    ["sa température est de 37 °C", 37],
    ["40°", 40],
    ["34 degrés", 34],
  ] as const) {
    it(`reads ${JSON.stringify(text)} as ${expected}`, () => {
      expect(readTemperature(text)).toBe(expected);
    });
  }

  it("does not mistake an age for a temperature", () => {
    // "enfant de 3 ans" is the sentence that started this.
    expect(readTemperature("mon enfant de 3 ans est malade")).toBeNull();
  });

  it("does not mistake a duration for a temperature", () => {
    expect(readTemperature("il a de la fièvre depuis 2 jours")).toBeNull();
  });

  it("ignores a number no body could be at", () => {
    // A transcription artefact, not a reading to act on.
    expect(readTemperature("température de 99 degrés")).toBeNull();
    expect(readTemperature("il a 12 degrés")).toBeNull();
  });

  it("returns nothing when no temperature was given", () => {
    expect(readTemperature("mon enfant a de la fièvre")).toBeNull();
  });
});

describe("the clinical thresholds are stated once", () => {
  it("uses the IMCI axillary fever threshold", () => {
    expect(TEMPERATURE.fever).toBe(37.5);
  });

  it("treats a cold body as its own problem, not a mild fever", () => {
    expect(TEMPERATURE.hypothermia).toBe(35.5);
    expect(TEMPERATURE.hypothermia).toBeLessThan(TEMPERATURE.fever);
  });
});
