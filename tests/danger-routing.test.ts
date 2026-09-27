import { beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests, getDb } from "@server/db/client";
import { runInteraction } from "@server/ai/agents/orchestrator";
import { detectRoutingDangerSigns } from "@server/ai/safety";

/**
 * A danger sign decides the module, not the model.
 *
 * The deterministic triage engine only runs once a message has been routed to
 * health, and the routing was the Language Agent's decision. So a Tshiluba
 * caregiver writing "Muana wanyi udi ne kutshinguluka ne kavua mua kunua" — a
 * child convulsing and unable to drink, both of which are in the keyword lists —
 * was scored risk=low and answered with the generic menu, because the model
 * called it "general" and the red-flag rules never got to look at it.
 *
 * CLAUDE.md is explicit that red flags are code, not model judgement. These
 * tests hold the routing to that.
 */

/** Danger signs stated in each platform language, with no French loanwords. */
const EMERGENCIES: Array<{ language: string; text: string; why: string }> = [
  { language: "fr", text: "Mon bébé ne respire pas bien et il ne peut plus téter", why: "breathing + cannot drink" },
  { language: "ln", text: "Mwana na ngai akoki kopema te mpe akoki komela te", why: "breathing + cannot drink" },
  { language: "sw", text: "Mtoto wangu ana degedege na hawezi kunywa", why: "convulsions + cannot drink" },
  { language: "kg", text: "Mwana na mono ke nikana mpi ke nwa ve", why: "convulsions + cannot drink" },
  { language: "lua", text: "Muana wanyi udi ne kutshinguluka ne kavua mua kunua", why: "convulsions + cannot drink" },
];

/**
 * Messages that contain a word from the triage lists but are not emergencies.
 *
 * These are the reason the routing list is narrower than the triage list. "Crise
 * alimentaire", a burning sun over a dying field and a drowsy pupil all match
 * the recall-oriented triage keywords, and routing on them would produce
 * precisely the fabricated alerts this platform was told not to produce.
 */
const NOT_EMERGENCIES: Array<{ text: string; matched: string }> = [
  { text: "Il y a une crise alimentaire dans mon village, que faire pour les semences ?", matched: "crise" },
  { text: "Le soleil est brûlant et mes plants de maïs meurent, quel paillage utiliser ?", matched: "brûlant" },
  { text: "Mon élève est somnolent en classe, comment l'aider à suivre la leçon ?", matched: "somnolent" },
  { text: "Je suis confus au sujet des fractions, pouvez-vous expliquer ?", matched: "confus" },
  { text: "Quel est le tirage recommandé pour imprimer les fiches de cours ?", matched: "tirage" },
  // The one that got through. "jaunissent" contains "jaunisse", so a plain
  // substring match sent a photograph of a yellowing cassava leaf into
  // paediatric triage. Routing matches whole words because of this case.
  { text: "Les feuilles de mon manioc jaunissent", matched: "jaunisse inside jaunissent" },
  { text: "Mes plants de maïs sont tout jaunes cette saison", matched: "tout jaune" },
];

describe("deterministic danger-sign routing", () => {
  it("recognises a danger sign in every platform language", () => {
    for (const c of EMERGENCIES) {
      expect(detectRoutingDangerSigns(c.text), `${c.language}: ${c.why}`).not.toHaveLength(0);
    }
  });

  it("stays silent on words that only look like danger signs", () => {
    for (const c of NOT_EMERGENCIES) {
      expect(
        detectRoutingDangerSigns(c.text),
        `"${c.matched}" must not route to health on its own: ${c.text}`,
      ).toHaveLength(0);
    }
  });
});

describe("a danger sign reaches the health protocol whatever the model decided", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  for (const c of EMERGENCIES) {
    it(`triages ${c.language} (${c.why})`, async () => {
      const out = await runInteraction({ user: null, text: c.text, wantsAudio: false });
      expect(out.status).toBe("completed");
      expect(out.module, `${c.language} must be triaged as health`).toBe("health");
      expect(out.answer.risk.level, `${c.language} must reach critical`).toBe("critical");
      expect(out.answer.escalation.required).toBe(true);
      expect(out.caseId, "a case must be opened for a human to pick up").toBeTruthy();
    });
  }

  it("overrides an explicit module choice when a danger sign is present", async () => {
    // A caregiver who tapped "agriculture" and then described a convulsing child.
    const out = await runInteraction({
      user: null,
      moduleHint: "agriculture",
      text: "Mtoto wangu ana degedege na hawezi kunywa",
      wantsAudio: false,
    });
    expect(out.module).toBe("health");
    expect(out.answer.risk.level).toBe("critical");
  });

  it("does not drag an ordinary agriculture question into health", async () => {
    // "brûlant" is a triage keyword for a dangerously hot body. Said of the sun
    // it must change nothing: no health module, no case, no alert.
    const out = await runInteraction({
      user: null,
      text: "Le soleil est brûlant, quel paillage utiliser pour garder l'humidité ?",
      wantsAudio: false,
    });
    expect(out.module).toBe("agriculture");
    expect(out.answer.risk.level).toBe("low");
    expect(out.answer.escalation.required, "no fabricated escalation").toBe(false);
    expect(out.caseId, "no case opened for a mulching question").toBeFalsy();
  });

  it("leaves a crop photograph in agriculture", async () => {
    // The regression that taught us routing needs word boundaries.
    const out = await runInteraction({ user: null, text: "Les feuilles de mon manioc jaunissent", wantsAudio: false });
    expect(out.module).toBe("agriculture");
  });

  it("still escalates a genuine agronomic emergency to an agri officer, not to health", async () => {
    // The same sentence with a dying field. This one is a real signal — it is
    // how an armyworm outbreak is first described — so it escalates, but inside
    // agriculture. Routing it to health would be the fabricated alert.
    const out = await runInteraction({
      user: null,
      text: "Le soleil est brûlant et mes plants de maïs meurent, quel paillage utiliser ?",
      wantsAudio: false,
    });
    expect(out.module).toBe("agriculture");
    expect(out.answer.escalation.required).toBe(true);
    expect(out.answer.risk.flags).toContain("propagation");
  });
});
