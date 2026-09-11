import { beforeAll, describe, expect, it } from "vitest";

import { randomUUID } from "node:crypto";
import { assessHealth } from "@server/ai/agents/health";
import { extractEntities } from "@server/ai/protocols/extraction";
import { dedupeSentences, detectDangerSigns, detectEmergencyTerms, normaliseForMatching, withDisclaimer } from "@server/ai/safety";
import { resetDbForTests, getDb } from "@server/db/client";

/**
 * These are the sentences a frightened caregiver actually types, drawn from how
 * the danger signs are described in practice rather than from how the protocol
 * writes them. Each one must reach the emergency pathway. A miss here is not a
 * quality problem, it is a child who was told to wait twenty-four hours.
 */
const MUST_ESCALATE: Array<[string, string]> = [
  ["Mon bébé de 6 mois convulse et ne peut plus téter.", "conjugated verb, and the breastfeeding form of not drinking"],
  ["mon bebe convulse et ne peut plus teter", "no accents at all, as a phone keyboard produces"],
  ["Mon bébé convulse et ne peut plus téter.", "typographic apostrophes and accents together"],
  ["L'enfant ne se réveille pas et ne bouge plus.", "unresponsiveness said plainly"],
  ["Elle n'arrive pas à téter depuis hier soir.", "curly apostrophe, inability to feed"],
  ["Le bébé a du mal à respirer et respire très fort.", "breathing difficulty in everyday words"],
  ["Elle saigne énormément depuis l'accouchement.", "post-partum haemorrhage"],
  ["Il refuse le sein et ne boit plus rien.", "refusal of the breast"],
  ["Son corps se raidit et il fait des crises.", "convulsion described without the word"],
];

describe("danger signs in the words people use", () => {
  it("folds accents and apostrophes before matching", () => {
    expect(normaliseForMatching("Ne peut plus téter")).toBe("ne peut plus teter");
    expect(normaliseForMatching("n’arrive pas à boire")).toBe("n'arrive pas a boire");
    expect(normaliseForMatching("  FIÈVRE   très   élevée ")).toBe("fievre tres elevee");
  });

  it.each(MUST_ESCALATE)("recognises a danger sign in %j (%s)", (sentence) => {
    const signs = detectDangerSigns(sentence);
    const terms = detectEmergencyTerms(sentence);
    expect(signs.length + terms.length, `nothing matched in: ${sentence}`).toBeGreaterThan(0);
  });

  it.each(MUST_ESCALATE)("carries the sign through extraction for %j (%s)", (sentence) => {
    expect(extractEntities(sentence).dangerSigns.length, sentence).toBeGreaterThan(0);
  });
});

describe("triage grades those sentences as emergencies", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it.each(MUST_ESCALATE)("%j → immediate referral (%s)", async (sentence) => {
    const out = await assessHealth(sentence, { province: "Kinshasa", language: "fr" }, randomUUID());
    expect(out.severityLevel, `${sentence} → level ${out.severityLevel}`).toBe(4);
    expect(out.riskBand).toBe("emergency");
    expect(out.timeToAction).toBe("immediate");
    expect(out.humanReviewRequired).toBe(true);
    expect(out.emergencyScript).toBeTruthy();
  });

  it("does not turn an ordinary question into an emergency", async () => {
    for (const calm of [
      "Quand dois-je vacciner mon bébé de deux mois ?",
      "Je voudrais savoir comment préparer la bouillie enrichie.",
      "Combien de fois par jour faut-il faire boire un enfant en bonne santé ?",
    ]) {
      const out = await assessHealth(calm, { province: "Kinshasa", language: "fr" }, randomUUID());
      expect(out.severityLevel, calm).toBeLessThan(4);
    }
  });
});

describe("what the citizen actually hears", () => {
  it("says the disclaimer once, however many layers append it", () => {
    const once = withDisclaimer("Allez au centre de santé.", "fr");
    expect(withDisclaimer(once, "fr")).toBe(once);
    expect(once.match(/ne remplace pas un agent de santé/g)).toHaveLength(1);
  });

  it("drops a sentence that repeats one already said", () => {
    const spoken = dedupeSentences(
      "Il faut aller au centre de santé dans les 24 heures. Allez au centre de santé dans les 24 heures. Il faut aller au centre de santé dans les 24 heures. Surveillez la respiration.",
    );
    expect(spoken).toBe("Il faut aller au centre de santé dans les 24 heures. Allez au centre de santé dans les 24 heures. Surveillez la respiration.");
  });

  it("keeps an answer free of any repeated sentence", async () => {
    const out = await assessHealth("Mon enfant a de la fièvre depuis deux jours et il tousse.", { province: "Kinshasa", language: "fr" }, randomUUID());
    const sentences = out.guidance.split(/(?<=[.!?])\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    expect(new Set(sentences).size, out.guidance).toBe(sentences.length);
  });
});
