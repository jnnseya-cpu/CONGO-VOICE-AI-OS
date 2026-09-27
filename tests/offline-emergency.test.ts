/**
 * What the handset can answer on its own.
 *
 * Three screenshots from the live site showed a caregiver the string
 * "Failed to fetch" — a browser's internal wording, in English — and, twice,
 * "Le service est momentanément indisponible, réessayez dans quelques instants".
 * Neither is an answer. On the connections this platform is built for, a request
 * failing is not an exceptional event, and the example question printed in the
 * box itself is about a feverish three-year-old.
 *
 * The emergency core now ships with the page, so the device holds the danger-sign
 * phrases and the reviewed instruction in five languages and can answer without
 * reaching anything. These tests cover that path in isolation from React: the
 * same functions the component calls, with the same inputs.
 */
import { describe, expect, it } from "vitest";
import {
  EMERGENCY_EN_ROUTE,
  EMERGENCY_INSTRUCTIONS,
  EMERGENCY_MESSAGES,
  FACILITY_UNKNOWN_NOTE,
  detectRoutingDangerSigns,
} from "@shared/emergency";
import { LANGUAGES } from "@shared/types";

/** Exactly what VoiceConsole composes when a send fails. */
function handsetAnswer(question: string, lang: "fr" | "ln" | "kg" | "sw" | "lua"): string | undefined {
  const danger = detectRoutingDangerSigns(question);
  return danger.length > 0 ? `${EMERGENCY_INSTRUCTIONS[lang]} ${FACILITY_UNKNOWN_NOTE[lang]}`.trim() : undefined;
}

describe("the device answers a danger sign with no network", () => {
  it("answers in French", () => {
    const out = handsetAnswer("Mon bébé ne respire pas bien et il ne peut plus téter", "fr");
    expect(out).toBeDefined();
    expect(out!.startsWith(EMERGENCY_MESSAGES.fr)).toBe(true);
    expect(out).toContain("Pendant le trajet");
    expect(out).toContain("Je ne connais pas encore la structure de santé");
  });

  it("answers in each platform language, in that language", () => {
    const cases: Array<[("fr" | "ln" | "kg" | "sw" | "lua"), string]> = [
      ["ln", "Mwana na ngai akoki kopema te mpe akoki komela te"],
      ["sw", "Mtoto wangu ana degedege na hawezi kunywa"],
      ["kg", "Mwana na mono ke nikana mpi ke nwa ve"],
      ["lua", "Muana wanyi udi ne kutshinguluka ne kavua mua kunua"],
    ];
    for (const [lang, question] of cases) {
      const out = handsetAnswer(question, lang);
      expect(out, `${lang} danger sign must be recognised on the device`).toBeDefined();
      expect(out!.startsWith(EMERGENCY_MESSAGES[lang]), `${lang} must be answered in ${lang}`).toBe(true);
      expect(out).toContain(EMERGENCY_EN_ROUTE[lang]);
    }
  });

  it("says nothing extra for an ordinary question", () => {
    expect(handsetAnswer("Quel engrais pour mon champ d'arachide ?", "fr")).toBeUndefined();
    expect(handsetAnswer("Je ne comprends pas les fractions", "fr")).toBeUndefined();
    expect(handsetAnswer("Bonjour, comment allez-vous ?", "fr")).toBeUndefined();
  });

  it("does not invent an emergency from a word that only looks like one", () => {
    // The same decoys the server refuses to route on.
    for (const q of [
      "Les feuilles de mon manioc jaunissent",
      "Il y a une crise alimentaire dans mon village",
      "Le soleil est brûlant, quel paillage utiliser ?",
      "Mon élève est somnolent en classe",
      "Quel est le tirage recommandé pour les fiches ?",
    ]) {
      expect(handsetAnswer(q, "fr"), `must not fire on: ${q}`).toBeUndefined();
    }
  });

  it("carries the whole instruction, not a fragment", () => {
    for (const l of LANGUAGES) {
      const out = handsetAnswer("degedege", l.code) ?? handsetAnswer("convulsions", l.code);
      expect(out, `${l.code} must produce a full script`).toBeDefined();
      // Referral, journey care and the destination note: nothing truncated.
      expect(out!.length).toBeGreaterThan(200);
      expect(out).toContain(FACILITY_UNKNOWN_NOTE[l.code]);
    }
  });

  it("is the same wording the server would have sent", () => {
    // One source of truth: the device is not paraphrasing the server.
    for (const l of LANGUAGES) {
      expect(EMERGENCY_INSTRUCTIONS[l.code]).toBe(`${EMERGENCY_MESSAGES[l.code]} ${EMERGENCY_EN_ROUTE[l.code]}`);
    }
  });
});

describe("the emergency core is reachable from the browser bundle", () => {
  it("imports without pulling in anything server-only", async () => {
    // @shared/emergency must not reach the database, the gateway or a secret:
    // if it did, importing it in a client component would fail the build.
    const mod = await import("@shared/emergency");
    expect(Object.keys(mod)).toEqual(
      expect.arrayContaining([
        "EMERGENCY_MESSAGES",
        "EMERGENCY_EN_ROUTE",
        "EMERGENCY_INSTRUCTIONS",
        "FACILITY_UNKNOWN_NOTE",
        "DANGER_SIGN_KEYWORDS",
        "ROUTING_DANGER_PHRASES",
        "detectRoutingDangerSigns",
        "normaliseForMatching",
      ]),
    );
  });

  it("still matches what the server re-exports", async () => {
    const shared = await import("@shared/emergency");
    const server = await import("@server/ai/safety");
    expect(server.EMERGENCY_INSTRUCTIONS).toBe(shared.EMERGENCY_INSTRUCTIONS);
    expect(server.detectRoutingDangerSigns).toBe(shared.detectRoutingDangerSigns);
    expect(server.ROUTING_DANGER_PHRASES).toBe(shared.ROUTING_DANGER_PHRASES);
  });
});
