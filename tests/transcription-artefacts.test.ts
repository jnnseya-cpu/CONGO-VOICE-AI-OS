/**
 * The speech model inventing a message, and the platform answering it.
 *
 * Both of these reached a citizen in production. The first was shown to someone
 * in the health module as their own words; the platform then opened a case,
 * alerted a community health worker, and asked them to confirm they had said
 * "ST' 501". The second was shown to someone asking about their field.
 */
import { describe, expect, it } from "vitest";
import { assessTranscript, repetitionRatio } from "@shared/transcription";

/** Verbatim, from the two turns that failed. */
const FROM_PRODUCTION = {
  subtitleCredit: "Sous-titrage ST' 501",
  thanksLoop:
    "Est-ce qu'il y a des problèmes dans la salle, ou est-ce qu'il y a des problèmes dans la salle en général? Je vous remercie pour votre attention et je vous remercie pour votre appropriation de la saison.",
};

describe("transcripts the model invented", () => {
  it("rejects the caption credit that was shown to a citizen as their own words", () => {
    const a = assessTranscript(FROM_PRODUCTION.subtitleCredit);
    expect(a.verdict).toBe("artefact");
    expect(a.cleaned).toBe("");
  });

  it("does not let a stray number survive the credit being stripped", () => {
    // "ST' 501" is what remained after "Sous-titrage" was removed, and a bare
    // number must not read as a question — it is what the platform asked the
    // citizen to confirm.
    expect(assessTranscript("Sous-titrage ST' 501").cleaned).toBe("");
  });

  it.each([
    "Sous-titres réalisés par la communauté d'Amara.org",
    "Merci d'avoir regardé cette vidéo !",
    "Thanks for watching!",
    "[Musique]",
    "Abonnez-vous à la chaîne",
    "♪ ♪ ♪",
  ])("rejects %j", (text) => {
    expect(assessTranscript(text).verdict).toBe("artefact");
  });

  it("names which artefact it found, so a reviewer can see why a turn was dropped", () => {
    expect(assessTranscript(FROM_PRODUCTION.subtitleCredit).artefacts).toContain("sous titrage");
  });
});

describe("transcripts that looped", () => {
  it("scores the repeated clause from production as repetition", () => {
    expect(repetitionRatio(FROM_PRODUCTION.thanksLoop)).toBeGreaterThan(0.2);
  });

  it("flags a clause repeated until the audio ran out", () => {
    const looped = "il ne peut pas boire il ne peut pas boire il ne peut pas boire il ne peut pas boire";
    const a = assessTranscript(looped);
    expect(a.verdict).toBe("repetitive");
    // Kept, not discarded: the clause is real and it is a danger sign.
    expect(a.cleaned).toContain("il ne peut pas boire");
  });

  it("does not call a short answer repetitive", () => {
    expect(repetitionRatio("oui")).toBe(0);
    expect(assessTranscript("Mon enfant a de la fièvre depuis deux jours").verdict).toBe("usable");
  });
});

describe("transcripts that are a real person speaking", () => {
  it.each([
    "Mon bébé ne respire pas bien et il ne peut plus téter",
    "Les feuilles de mon manioc jaunissent et se recroquevillent",
    "Ma fille a manqué l'école pendant trois semaines, comment la rattraper ?",
  ])("keeps %j", (text) => {
    const a = assessTranscript(text);
    expect(a.verdict).toBe("usable");
    expect(a.cleaned).toBe(text);
  });

  it("keeps a real message that merely ends politely", () => {
    // The dangerous false positive: someone describes a real emergency and
    // signs off with a courtesy the artefact list also matches. Everything
    // before it must survive.
    const text = "Mon enfant convulse depuis ce matin et ne se réveille pas. Merci pour votre attention.";
    const a = assessTranscript(text);
    expect(a.verdict).not.toBe("artefact");
    expect(a.cleaned).toContain("convulse");
    expect(a.cleaned).toContain("ne se réveille pas");
  });

  it("keeps accents intact when an artefact is cut out of the middle", () => {
    const a = assessTranscript("Merci d'avoir regardé. Mon bébé a la diarrhée depuis trois jours.");
    expect(a.cleaned).toContain("Mon bébé a la diarrhée depuis trois jours");
  });
});

describe("a decoder that locked onto one sentence", () => {
  /** Verbatim, shown to a farmer asking about his field. */
  const LOOP =
    "Les enfants de la République démocratique du Congo ont besoin d'un soutien médical et d'un soutien sanitaire. " +
    "Les enfants de la République démocratique du Congo ont besoin d'un soutien médical et d'un soutien sanitaire. " +
    "Les enfants de la République démocratique du Congo ont besoin d'un soutien médical et d'un soutien sanitaire. " +
    "Les enfants de la République démocratique du Congo ont besoin d'un soutien médical et d'un soutien sanitaire.";

  it("is nothing heard, not a quiet message", () => {
    const a = assessTranscript(LOOP);
    expect(a.verdict).toBe("artefact");
    expect(a.cleaned).toBe("");
  });

  it("does not catch somebody repeating a short plea", () => {
    // Distress sounds like this, and it must reach a person.
    expect(assessTranscript("Aidez-moi. Aidez-moi. Aidez-moi.").verdict).not.toBe("artefact");
  });

  it("does not catch a message that repeats itself but says more", () => {
    const real =
      "Mon enfant a de la fièvre depuis trois jours et ne veut pas manger. " +
      "Mon enfant a de la fièvre depuis trois jours et ne veut pas manger. " +
      "Il respire vite aussi.";
    const a = assessTranscript(real);
    expect(a.verdict).not.toBe("artefact");
    expect(a.cleaned).toContain("respire vite");
  });
});
