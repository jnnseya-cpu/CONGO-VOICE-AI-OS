import { describe, expect, it } from "vitest";

import {
  ARCHIVE_CONFIDENCE_BELOW,
  BRIEF_CONFIDENCE_AT_LEAST,
  MIN_COMPARABLE_PERIODS,
  SINGLE_FAMILY_CONFIDENCE_CAP,
  confidenceScore,
  corroborationFor,
  countFeedPassesGates,
  decide,
  demandComponent,
  demandFromZ,
  independentFamilyCount,
  logLift,
  mayActivate,
  opportunityScore,
  robustZ,
  score,
  type ConfidenceComponents,
  type FamilyObservation,
  type OpportunityComponents,
} from "@server/ai/trends/scoring";

/**
 * Trend Intelligence §5 and §17, and its conformance scenario TI-03.
 *
 * TI-03 is exact: "The isolated scorer receives the component inputs in §5 and
 * returns 86.25 opportunity and 83.5 confidence … Neither score is rounded
 * before decision."
 *
 * Everything in this file is deterministic by design. The specification puts
 * scoring on the rules side of the line, which is the same side this platform
 * already puts severity and escalation on.
 */

const EXAMPLE: OpportunityComponents = {
  demand: 80,
  fit: 95,
  intent: 85,
  timing: 90,
  readiness: 80,
};

const EXAMPLE_CONFIDENCE: ConfidenceComponents = {
  sourceQuality: 90,
  corroboration: 80,
  coverage: 70,
  freshness: 90,
};

describe("TI-03 — the worked example, to the digit", () => {
  it("returns exactly 86.25", () => {
    expect(opportunityScore(EXAMPLE)).toBeCloseTo(86.25, 10);
  });

  it("returns exactly 83.5 with two independent families", () => {
    expect(confidenceScore(EXAMPLE_CONFIDENCE, 2)).toBeCloseTo(83.5, 10);
  });

  it("produces a reviewable brief, not an automatic action", () => {
    const result = score({
      components: EXAMPLE,
      confidence: EXAMPLE_CONFIDENCE,
      independentFamilies: 2,
    });
    expect(result.decision).toBe("reviewable_brief");
    expect(mayActivate(result)).toBe(true);
  });

  it("does not round either score before deciding", () => {
    const result = score({
      components: EXAMPLE,
      confidence: EXAMPLE_CONFIDENCE,
      independentFamilies: 2,
    });
    expect(result.opportunity).toBeCloseTo(86.25, 10);
    expect(result.opportunity).not.toBe(Math.round(result.opportunity));
  });
});

describe("detection mathematics", () => {
  it("computes the stated log lift", () => {
    expect(logLift(99, 9)).toBeCloseTo(Math.log(100 / 10), 10);
  });

  it("uses a median absolute deviation, so one broadcast spike cannot hide the next movement", () => {
    // A standard deviation would be inflated by the 500; a MAD is not. On this
    // platform the 500 is a radio programme telling a province to call the line.
    const withSpike = [10, 11, 10, 500, 9, 10, 11, 10];
    expect(robustZ(60, withSpike)).toBeGreaterThan(2);
  });

  it("never divides by zero on a flat history", () => {
    expect(Number.isFinite(robustZ(11, [10, 10, 10, 10, 10, 10]))).toBe(true);
  });

  it("requires both count-feed gates", () => {
    const history = [10, 11, 9, 10, 12, 10, 11, 10];
    expect(countFeedPassesGates(60, history)).toBe(true);
    // Movement without volume.
    expect(countFeedPassesGates(15, [1, 1, 2, 1, 1, 1])).toBe(false);
    // Volume without movement.
    expect(countFeedPassesGates(100, [98, 101, 99, 100, 102, 99])).toBe(false);
  });

  it("refuses to judge a change on fewer than four comparable periods", () => {
    expect(countFeedPassesGates(100, [1, 1, 1])).toBe(false);
  });

  it("maps z to demand with the reference clamp", () => {
    expect(demandFromZ(0)).toBeCloseTo(50, 10);
    expect(demandFromZ(3)).toBeCloseTo(80, 10);
    expect(demandFromZ(-20)).toBe(0);
    expect(demandFromZ(20)).toBe(100);
  });
});

describe("a single source may never move the platform on its own", () => {
  it("caps one family at 69", () => {
    const perfect: ConfidenceComponents = {
      sourceQuality: 100,
      corroboration: 100,
      coverage: 100,
      freshness: 100,
    };
    expect(confidenceScore(perfect, 1)).toBe(SINGLE_FAMILY_CONFIDENCE_CAP);
  });

  it("puts that cap below the threshold a brief requires", () => {
    // Structural, not coincidental: one report in one village can open a watch
    // and can never brief every agent.
    expect(SINGLE_FAMILY_CONFIDENCE_CAP).toBeLessThan(BRIEF_CONFIDENCE_AT_LEAST);
  });

  it("follows the corroboration ladder", () => {
    expect(corroborationFor(1)).toBe(0);
    expect(corroborationFor(2)).toBe(80);
    expect(corroborationFor(3)).toBe(100);
    expect(corroborationFor(9)).toBe(100);
  });
});

describe("the threshold table", () => {
  it("archives below either cutoff", () => {
    expect(decide(59.9, 90)).toBe("archive");
    expect(decide(90, ARCHIVE_CONFIDENCE_BELOW - 0.1)).toBe("archive");
  });

  it("watches in the middle band", () => {
    expect(decide(70, 70)).toBe("watch");
  });

  it("briefs at 75 and 75", () => {
    expect(decide(75, 75)).toBe("reviewable_brief");
  });

  it("requires an explicit opt-in for an automatic action", () => {
    expect(decide(85, 85)).toBe("reviewable_brief");
    expect(decide(85, 85, { autoOptIn: true })).toBe("auto_eligible");
    expect(decide(84.9, 85, { autoOptIn: true })).toBe("reviewable_brief");
  });

  it("cannot have a veto out-scored", () => {
    expect(decide(100, 100, { vetoes: ["restricted_topic"], autoOptIn: true })).toBe("watch");
  });
});

describe("vetoes that matter on this platform", () => {
  it("blocks activation when nothing is ready to carry it", () => {
    // Readiness here is a signed protocol, a staffed responder and a live
    // alert channel — not stock.
    const result = score({
      components: { demand: 100, fit: 100, intent: 100, timing: 100, readiness: 0 },
      confidence: { sourceQuality: 100, corroboration: 100, coverage: 100, freshness: 100 },
      independentFamilies: 3,
      autoOptIn: true,
    });
    expect(result.vetoes).toContain("missing_readiness");
    expect(mayActivate(result)).toBe(false);
  });

  it("keeps a topic draft-only without enough history", () => {
    const result = score({
      components: EXAMPLE,
      confidence: EXAMPLE_CONFIDENCE,
      independentFamilies: 2,
      comparablePeriods: MIN_COMPARABLE_PERIODS - 1,
    });
    expect(result.vetoes).toContain("insufficient_history");
    expect(mayActivate(result)).toBe(false);
  });

  it("explains itself in French, for the people running the service", () => {
    const result = score({
      components: { ...EXAMPLE, readiness: 0 },
      confidence: EXAMPLE_CONFIDENCE,
      independentFamilies: 1,
    });
    expect(result.reasons.join(" ")).toContain("Préparation nulle");
    expect(result.reasons.join(" ")).toContain("Source unique");
  });

  it("refuses a component outside 0-100 rather than clamping it silently", () => {
    expect(() =>
      opportunityScore({ ...EXAMPLE, demand: 140 }),
    ).toThrow(RangeError);
  });
});

describe("the demand component", () => {
  it("takes the median of the best observation per family", () => {
    const observations: FamilyObservation[] = [
      { sourceFamily: "interactions", sourceId: "int_1", demand: 60, weight: 1 },
      { sourceFamily: "interactions", sourceId: "int_2", demand: 90, weight: 2 },
      { sourceFamily: "cases", sourceId: "case_1", demand: 70, weight: 1 },
      { sourceFamily: "searches", sourceId: "srch_1", demand: 50, weight: 1 },
    ];
    expect(demandComponent(observations)).toBeCloseTo(70, 10);
  });

  it("breaks ties deterministically, whatever the input order", () => {
    const a: FamilyObservation[] = [
      { sourceFamily: "interactions", sourceId: "aaa", demand: 10 },
      { sourceFamily: "interactions", sourceId: "zzz", demand: 90 },
    ];
    expect(demandComponent(a)).toBe(demandComponent([...a].reverse()));
  });

  it("excludes a stale source from supporting a fresh action", () => {
    expect(
      demandComponent([
        { sourceFamily: "interactions", sourceId: "i1", demand: 90 },
        { sourceFamily: "archive", sourceId: "a1", demand: 10, stale: true },
      ]),
    ).toBeCloseTo(90, 10);
  });

  it("does not let attention masquerade as corroboration", () => {
    // Pageviews are attention, not need. Context-only and stale families are
    // excluded, so this is one family and the 69 cap applies.
    const observations: FamilyObservation[] = [
      { sourceFamily: "interactions", sourceId: "i1", demand: 80 },
      { sourceFamily: "pageviews", sourceId: "p1", demand: 70, contextOnly: true },
      { sourceFamily: "archive", sourceId: "a1", demand: 60, stale: true },
    ];
    expect(independentFamilyCount(observations)).toBe(1);
  });
});
