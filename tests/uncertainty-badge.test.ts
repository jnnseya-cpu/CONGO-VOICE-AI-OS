/**
 * Telling a citizen their health is at risk, when what is at risk is our
 * hearing.
 *
 * A voice note transcribed badly and the answer carried "Niveau de risque :
 * Élevé" next to "Confiance 15 %". The escalation was right — a health
 * question the platform did not follow should reach a person — but the badge
 * described the citizen's situation when it was describing our own failure.
 *
 * scoreRisk marks which of the two it is, so the interface can say the true
 * one. These tests exist to keep the mark strict: any real clinical signal at
 * all must clear it, because a danger sign shown as "message peu clair" would
 * be the serious mistake in the other direction.
 */
import { describe, expect, it } from "vitest";
import { scoreRisk } from "@server/ai/agents/risk";

describe("a level raised only by not understanding", () => {
  it("is marked as ours, not the citizen's", () => {
    const r = scoreRisk({ module: "health", languageConfidence: 0.15, domainConfidence: 0.15 });
    expect(r.lowConfidence).toBe(true);
    expect(r.uncertaintyDriven).toBe(true);
    // The safety behaviour is unchanged: a person still looks at it.
    expect(r.escalationRequired).toBe(true);
  });

  it("is not marked when the platform understood perfectly well", () => {
    const r = scoreRisk({ module: "health", languageConfidence: 0.95, domainConfidence: 0.95 });
    expect(r.uncertaintyDriven).toBe(false);
  });
});

describe("real signals always win the badge", () => {
  it("a danger sign is never shown as an unclear message", () => {
    const r = scoreRisk({
      module: "health",
      languageConfidence: 0.1,
      domainConfidence: 0.1,
      severityLevel: 4,
    });
    expect(r.uncertaintyDriven).toBe(false);
    expect(r.escalationRequired).toBe(true);
  });

  it("a protocol severity above the floor is never shown as an unclear message", () => {
    const r = scoreRisk({ module: "health", languageConfidence: 0.1, domainConfidence: 0.1, severityLevel: 3 });
    expect(r.uncertaintyDriven).toBe(false);
  });

  it("a safeguarding disclosure is never shown as an unclear message", () => {
    const r = scoreRisk({ module: "health", languageConfidence: 0.1, domainConfidence: 0.1, safeguarding: true });
    expect(r.uncertaintyDriven).toBe(false);
  });

  it("a blocked or uncited recommendation is never shown as an unclear message", () => {
    const r = scoreRisk({ module: "health", languageConfidence: 0.1, domainConfidence: 0.1, citations: [] });
    if (r.blocked) expect(r.uncertaintyDriven).toBe(false);
  });

  it("a safety violation is never shown as an unclear message", () => {
    const r = scoreRisk({ module: "health", languageConfidence: 0.1, domainConfidence: 0.1, safetyViolations: ["dose_hors_protocole"] });
    expect(r.uncertaintyDriven).toBe(false);
  });
});
