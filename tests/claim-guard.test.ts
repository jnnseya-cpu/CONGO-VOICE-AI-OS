import { describe, expect, it } from "vitest";

import { BOUNDARY_RESPONSES, CLAIM_FALLBACK, checkOutboundClaims, detectBoundaryTopics } from "@server/ai/safety";
import { CONFIDENCE_CAUTION_THRESHOLD, CONFIDENCE_SCRIPTED_THRESHOLD, confidenceBandFor } from "@server/ai/agents/risk";
import { LANGUAGES } from "@shared/types";

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

describe("claims a public service cannot make (AI-15)", () => {
  it("blocks a promise of cure", () => {
    const check = checkOutboundClaims("Ce traitement guérit le paludisme en deux jours.", { module: "health" });
    expect(check.ok).toBe(false);
    expect(check.violations).toContain("cure_promise");
  });

  it("blocks certainty, however it is phrased", () => {
    for (const claim of ["C'est sans aucun risque.", "Ce geste est garanti.", "Efficace à 100 %.", "Il n'y a aucun danger."]) {
      expect(checkOutboundClaims(claim, { module: "health" }).ok, claim).toBe(false);
    }
  });

  it("blocks an asserted diagnosis", () => {
    expect(checkOutboundClaims("Vous avez certainement le paludisme.", { module: "health" }).ok).toBe(false);
    expect(checkOutboundClaims("Il s'agit certainement d'une typhoïde.", { module: "health" }).ok).toBe(false);
  });

  it("blocks advice to stop a treatment", () => {
    expect(checkOutboundClaims("Arrêtez votre traitement et revenez me voir.", { module: "health" }).ok).toBe(false);
  });

  it("blocks a guaranteed yield or price", () => {
    expect(checkOutboundClaims("Vous doublerez votre récolte.", { module: "agriculture" }).ok).toBe(false);
    expect(checkOutboundClaims("Le prix sera de 2000 francs le sac.", { module: "agriculture" }).ok).toBe(false);
  });

  it("lets a cited figure through and stops an uncited one", () => {
    const uncited = checkOutboundClaims("Selon une étude, 40 % des enfants guérissent seuls.", { module: "health", citations: [] });
    expect(uncited.ok).toBe(false);
    const cited = checkOutboundClaims("Selon une étude, 40 % des enfants guérissent seuls.", { module: "health", citations: ["KB-HE-FEVER-01"] });
    expect(cited.ok).toBe(true);
  });

  it("never blocks the ordinary, careful answer", () => {
    const fine = "Faites boire souvent de petites quantités d'eau propre. Allez au centre de santé aujourd'hui si la fièvre continue.";
    expect(checkOutboundClaims(fine, { module: "health", citations: ["KB-HE-FEVER-01"] }).ok).toBe(true);
  });

  it("has a fallback in every platform language", () => {
    for (const language of LANGUAGE_CODES) expect(CLAIM_FALLBACK[language].length).toBeGreaterThan(40);
  });
});

describe("subjects the service declines (AI-19)", () => {
  it("recognises political, religious, legal and financial questions", () => {
    expect(detectBoundaryTopics("Pour qui dois-je voter aux élections ?")).toContain("political");
    expect(detectBoundaryTopics("Quelle église est la vraie ?")).toContain("religious");
    expect(detectBoundaryTopics("Je veux porter plainte contre mon voisin.")).toContain("legal");
    expect(detectBoundaryTopics("Dois-je investir dans la cryptomonnaie ?")).toContain("financial");
  });

  it("leaves the service's own subjects alone", () => {
    for (const asked of [
      "Mon enfant a de la fièvre depuis deux jours.",
      "Quand planter le maïs à Kongo-Central ?",
      "Explique-moi les fractions.",
      "Quel est le prix du manioc à Matadi ?",
    ]) {
      expect(detectBoundaryTopics(asked), asked).toEqual([]);
    }
  });

  it("declines in every platform language and still points somewhere useful", () => {
    for (const topic of ["political", "religious", "legal", "financial"] as const) {
      for (const language of LANGUAGE_CODES) {
        expect(BOUNDARY_RESPONSES[topic][language].length, `${topic}/${language}`).toBeGreaterThan(40);
      }
    }
  });
});

describe("the two low-confidence bands (AI-03)", () => {
  it("answers normally above the first threshold", () => {
    expect(confidenceBandFor(CONFIDENCE_CAUTION_THRESHOLD)).toBe("ok");
    expect(confidenceBandFor(0.92)).toBe("ok");
  });

  it("cautions between the two", () => {
    expect(confidenceBandFor(CONFIDENCE_CAUTION_THRESHOLD - 0.01)).toBe("caution");
    expect(confidenceBandFor(CONFIDENCE_SCRIPTED_THRESHOLD)).toBe("caution");
  });

  it("stops answering below the second", () => {
    expect(confidenceBandFor(CONFIDENCE_SCRIPTED_THRESHOLD - 0.01)).toBe("scripted");
    expect(confidenceBandFor(0)).toBe("scripted");
  });
});
