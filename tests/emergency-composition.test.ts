import { beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests, getDb } from "@server/db/client";
import { runInteraction } from "@server/ai/agents/orchestrator";
import { EMERGENCY_EN_ROUTE, EMERGENCY_INSTRUCTIONS, EMERGENCY_MESSAGES } from "@server/ai/safety";
import { LANGUAGES } from "@shared/types";

/**
 * What a caregiver actually hears when a danger sign fires.
 *
 * These assertions exist because a real turn was driven through a production
 * build and the answer, though clinically correct, told the caregiver to leave
 * for a health centre four times and then closed by saying the platform was not
 * sure it had understood. Nothing in the test suite caught it: every layer was
 * individually right and the composition was wrong.
 */

/** A sentence that issues the referral, as distinct from one about the journey. */
const REFERRAL_COMMAND = /\b(allez|partez|il faut (?:partir|aller))\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

describe("the scripted emergency answer", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("issues the referral exactly once", async () => {
    const out = await runInteraction({
      user: null,
      text: "Mon enfant de 3 ans a de la fièvre depuis deux jours et il ne veut pas boire",
      wantsAudio: false,
    });
    expect(out.status).toBe("completed");
    expect(out.answer.risk.level).toBe("critical");

    const commands = sentences(out.answer.action).filter((s) => REFERRAL_COMMAND.test(s));
    expect(commands, `expected one referral sentence, got:\n${commands.join("\n")}`).toHaveLength(1);
  });

  it("does not restate the referral in the protocol's or the model's words", async () => {
    const out = await runInteraction({
      user: null,
      text: "Mon enfant de 3 ans a de la fièvre depuis deux jours et il ne veut pas boire",
      wantsAudio: false,
    });
    // The protocol's own severity-4 text and the explanation lead-in. Both said
    // the same thing as the script and were read out after it.
    expect(out.answer.action).not.toContain("Allez tout de suite au centre de santé");
    expect(out.answer.action).not.toContain("Il faut partir maintenant vers une structure de santé");
    expect(out.answer.action).not.toContain("Partez maintenant vers le centre de santé");
  });

  it("never hedges its own confidence after issuing an emergency instruction", async () => {
    const out = await runInteraction({
      user: null,
      text: "Mon enfant de 3 ans a de la fièvre depuis deux jours et il ne veut pas boire",
      wantsAudio: false,
    });
    expect(out.answer.action).not.toContain("Je ne suis pas certain d'avoir bien compris");
    expect(out.responseText).not.toContain("Je ne suis pas certain d'avoir bien compris");
    expect(out.answer.action).not.toContain("pouvez-vous préciser");
  });

  it("still keeps the en-route care, the destination note and the disclaimer", async () => {
    const out = await runInteraction({
      user: null,
      text: "Mon enfant de 3 ans a de la fièvre depuis deux jours et il ne veut pas boire",
      wantsAudio: false,
    });
    expect(out.answer.action).toContain("Pendant le trajet");
    expect(out.answer.action).toContain("Emportez le carnet de santé");
    expect(out.answer.action).toContain("ne remplace pas un agent de santé");
  });

  it("holds in Lingala too, where the script is a different string", async () => {
    const out = await runInteraction({
      user: null,
      text: "Mwana na ngai azali na convulsions mpe akoki kopema te",
      wantsAudio: false,
    });
    expect(out.answer.risk.level).toBe("critical");
    expect(out.language).toBe("ln");
    expect(out.responseText).toContain("Bilembo ya likama emonani");
    // The Lingala referral clause, once.
    const occurrences = out.responseText.split("kende na lopitalo").length - 1;
    expect(occurrences).toBeLessThanOrEqual(1);
  });
});

describe("the emergency script is structurally single-voiced", () => {
  it("opens with the referral line and continues with the en-route half, in every language", () => {
    for (const language of LANGUAGES) {
      const full = EMERGENCY_INSTRUCTIONS[language.code];
      expect(full.startsWith(EMERGENCY_MESSAGES[language.code]), `${language.code} script must open with the referral line`).toBe(true);
      expect(full.endsWith(EMERGENCY_EN_ROUTE[language.code]), `${language.code} script must end with the en-route half`).toBe(true);
    }
  });

  it("does not repeat the referral inside the en-route half", () => {
    // The en-route half is about the journey; it must not re-issue the command.
    expect(REFERRAL_COMMAND.test(EMERGENCY_EN_ROUTE.fr)).toBe(false);
  });
});
