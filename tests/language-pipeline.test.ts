import { describe, expect, it } from "vitest";

import {
  ELEMENT_CONFIRM_THRESHOLD,
  LANGUAGE_CONFIRM_THRESHOLD,
  MAX_CONFIRMATION_ROUNDS,
  confidenceVector,
  elementConfirmationPrompt,
  elementsNeedingConfirmation,
  languageConfirmationPrompt,
  needsLanguageConfirmation,
  planClarification,
} from "@server/ai/language/confidence";
import {
  MAX_SPOKEN_SENTENCE_WORDS,
  chunkForSpeech,
  estimateSpokenSeconds,
  frenchNumberToWords,
  numeralsAsWords,
  overlongSentences,
  toSpokenText,
} from "@server/ai/language/voice";
import { FIXED_SCRIPTS, deliverScript, missingRecordings, scriptAudioPath, scriptText } from "@server/ai/language/scripts";
import { LANGUAGES } from "@shared/types";

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

describe("which language was spoken (FR-LG-01)", () => {
  it("confirms rather than guesses when the two candidates are close", () => {
    const tie = { language: "ln" as const, confidence: 0.62, alternative: { language: "kg" as const, confidence: 0.55 } };
    expect(needsLanguageConfirmation(tie)).toBe(true);
    const prompt = languageConfirmationPrompt(tie);
    expect(prompt).toContain("lingala");
    expect(prompt).toContain("kikongo");
    // Asked in the other candidate language too, or the speaker cannot answer it.
    expect(prompt).toContain("Nge zola");
  });

  it("confirms whenever the best reading is below the threshold, even with no alternative", () => {
    expect(needsLanguageConfirmation({ language: "sw", confidence: LANGUAGE_CONFIRM_THRESHOLD - 0.01, alternative: null })).toBe(true);
    expect(needsLanguageConfirmation({ language: "sw", confidence: 0.93, alternative: null })).toBe(false);
  });

  it("does not confirm when one language clearly wins", () => {
    expect(needsLanguageConfirmation({ language: "fr", confidence: 0.94, alternative: { language: "ln", confidence: 0.2 } })).toBe(false);
  });
});

describe("elements worth a question (FR-LG-02)", () => {
  const reading = {
    language: "fr" as const,
    confidence: 0.9,
    alternative: null,
    uncertainElements: [
      { kind: "number" as const, heard: "trois jours", confidence: 0.4 },
      { kind: "negation" as const, heard: "ne mange pas", confidence: 0.5 },
      { kind: "other" as const, heard: "quelque chose", confidence: 0.9 },
    ],
  };

  it("asks about a negation before a number, because losing it inverts the advice", () => {
    const elements = elementsNeedingConfirmation(reading);
    expect(elements.map((e) => e.kind)).toEqual(["negation", "number"]);
  });

  it("leaves alone anything it heard clearly", () => {
    expect(elementsNeedingConfirmation(reading).some((e) => e.confidence >= ELEMENT_CONFIRM_THRESHOLD)).toBe(false);
  });

  it("quotes back what was heard so one word can be corrected", () => {
    expect(elementConfirmationPrompt({ kind: "number", heard: "trois jours", confidence: 0.4 })).toContain("« trois jours »");
  });

  it("asks at most twice, then routes to a human instead of guessing again", () => {
    const first = planClarification(reading, 0);
    expect(first.questions.length).toBeGreaterThan(0);
    expect(first.questions.length).toBeLessThanOrEqual(MAX_CONFIRMATION_ROUNDS);
    expect(first.routeToHuman).toBe(false);

    const exhausted = planClarification(reading, MAX_CONFIRMATION_ROUNDS);
    expect(exhausted.questions).toEqual([]);
    expect(exhausted.routeToHuman).toBe(true);
    expect(exhausted.reasons).toContain("clarifications_epuisees");
  });

  it("asks nothing when everything was clear", () => {
    const plan = planClarification({ language: "fr", confidence: 0.95, alternative: null, uncertainElements: [] });
    expect(plan.questions).toEqual([]);
    expect(plan.routeToHuman).toBe(false);
  });
});

describe("confidence is a vector, not a score (FR-LG-09)", () => {
  it("reports each reading and takes the weakest as the binding one", () => {
    const v = confidenceVector({ transcription: 0.42, language: 0.91, translation: 0.88 });
    expect(v.transcription).toBe(0.42);
    expect(v.language).toBe(0.91);
    expect(v.translation).toBe(0.88);
    // A confident translation of a badly-heard sentence is not a confident turn.
    expect(v.overall).toBe(0.42);
  });

  it("records that there was no audio when the citizen typed", () => {
    const v = confidenceVector({ transcription: null, language: 0.8 });
    expect(v.transcription).toBeNull();
    expect(v.overall).toBe(0.8);
  });
});

describe("what gets spoken (FR-LG-06)", () => {
  it("says numbers as words, and leaves codes, years and references alone", () => {
    expect(frenchNumberToWords(0)).toBe("zéro");
    expect(frenchNumberToWords(15)).toBe("quinze");
    expect(frenchNumberToWords(21)).toBe("vingt et un");
    expect(frenchNumberToWords(80)).toBe("quatre-vingts");
    expect(frenchNumberToWords(97)).toBe("quatre-vingt-dix-sept");
    expect(frenchNumberToWords(200)).toBe("deux cents");
    expect(frenchNumberToWords(1000)).toBe("mille");
    const spoken = numeralsAsWords("Donnez 3 cuillères toutes les 2 heures, dossier 2026, code 007.", "fr");
    expect(spoken).toContain("trois cuillères");
    expect(spoken).toContain("deux heures");
    expect(spoken).toContain("2026");
    expect(spoken).toContain("007");
  });

  it("keeps the French space before a colon", () => {
    const out = toSpokenText("Signes de danger détectés : allez au centre de santé.", "fr");
    expect(out).toContain("détectés : allez");
  });

  it("never cuts a sentence where a speaker would not pause", () => {
    // No seam in this sentence, so it stays whole rather than becoming fragments.
    const single = "Ne donnez rien à boire à un enfant qui ne réagit pas correctement pendant le trajet vers le centre";
    expect(toSpokenText(single, "fr")).toBe(`${single}.`);
    expect(toSpokenText(single, "fr")).not.toContain("la. ");
  });

  it("splits at a real seam when there is one", () => {
    const seamed = "Faites boire souvent de petites quantités d'eau propre, et surveillez la respiration de l'enfant chaque heure sans exception.";
    const out = toSpokenText(seamed, "fr");
    expect(out.split(/(?<=\.)\s+/).length).toBeGreaterThan(1);
  });

  it("measures what it could not shorten instead of mangling it", () => {
    const long = "Un seul souffle de phrase qui continue encore et encore sans aucune virgule ni point pour laisser respirer celui qui écoute attentivement";
    expect(overlongSentences(long, MAX_SPOKEN_SENTENCE_WORDS).length).toBe(1);
  });
});

describe("a reply fits in one breath (FR-CH-04)", () => {
  it("offers a long answer in parts, each ending with an offer to continue", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Voici le point numéro ${i + 1} de la consigne à suivre.`).join(" ");
    const chunks = chunkForSpeech(long, "fr");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.seconds).toBeLessThanOrEqual(26);
      expect(chunk.askToContinue).toBe(true);
      expect(chunk.text).toContain("continue");
    }
    expect(chunks[chunks.length - 1].askToContinue).toBe(false);
  });

  it("leaves a short answer in one piece", () => {
    const chunks = chunkForSpeech("Allez au centre de santé aujourd'hui.", "fr");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].askToContinue).toBe(false);
    expect(estimateSpokenSeconds(chunks[0].text)).toBeLessThan(10);
  });
});

describe("fixed scripts (FR-LG-08, NFR-A-01, AI-14)", () => {
  it("has approved wording in every platform language", () => {
    for (const key of Object.keys(FIXED_SCRIPTS) as Array<keyof typeof FIXED_SCRIPTS>) {
      for (const language of LANGUAGE_CODES) {
        const text = scriptText(key, language);
        expect(text.trim().length, `${key}/${language}`).toBeGreaterThan(10);
      }
    }
  });

  it("states what the service is not, in every language", () => {
    expect(scriptText("identity", "fr")).toMatch(/ni médecin|pas médecin/i);
    expect(scriptText("identity", "ln")).toContain("monganga te");
    expect(scriptText("identity", "sw")).toContain("si daktari");
  });

  it("delivers the emergency words without needing any provider", () => {
    const delivery = deliverScript("emergency_instructions", "fr");
    expect(delivery.text.length).toBeGreaterThan(50);
    // No recording published yet, so the channel synthesises the same words.
    expect(delivery.source).toBe("synthesis_required");
    expect(delivery.audioUrl).toBeNull();
  });

  it("names where a recording belongs and what is still missing", () => {
    expect(scriptAudioPath("emergency_alert", "ln", "male")).toBe("/audio/scripts/ln/emergency_alert.male.mp3");
    const missing = missingRecordings();
    // Every script in every language, until the language panel records them.
    expect(missing.length).toBe(Object.keys(FIXED_SCRIPTS).length * LANGUAGE_CODES.length);
  });
});
