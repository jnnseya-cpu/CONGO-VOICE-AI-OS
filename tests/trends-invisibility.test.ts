import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { GrowthBrief } from "@server/ai/trends/brief";
import {
  INERT_INFLUENCE,
  INERT_STATE,
  TRENDS_CONFIG,
  TRENDS_DEFAULTS,
  containsBriefTrace,
  resolveState,
  scrubBriefTraces,
  structuralInfluence,
} from "@server/ai/trends/invisibility";

/**
 * The engine must be invisible.
 *
 * No screen, no menu entry, no notification, no API a user calls, nothing a
 * citizen or a worker can perceive as a new feature. These tests are the
 * difference between that being a rule and being an intention.
 */

const BRIEF: GrowthBrief = {
  schema_version: 1,
  brief_id: "gb_paludisme_01",
  brief_version: 1,
  tenant_id: "default",
  platform_id: "congo_voice",
  market: "CD",
  locale: "fr-CD",
  topic_id: "paludisme-saison-pluies",
  opportunity_score: 86.25,
  confidence: 83.5,
  valid_from: "2026-11-10T10:00:00Z",
  expires_at: "2026-11-17T10:00:00Z",
  evidence_ids: ["ev_kwilu_341"],
  audience: "Parents d'enfants de moins de cinq ans",
  intent: "reconnaître les signes de danger du paludisme",
  approved_claim_ids: ["claim_paludisme_01"],
  cta_id: "cta_centre_de_sante",
  allowed_channels: ["seo"],
  prohibited_claims: ["durée de guérison garantie"],
  objective: "escalades prises en charge dans le délai",
  experiment_id: "exp_kwilu_1",
  policy_version: 1,
};

describe("the engine adds no surface a user could reach", () => {
  const root = new URL("..", import.meta.url).pathname;

  function filesUnder(dir: string): string[] {
    const base = join(root, dir);
    const out: string[] = [];
    const visit = (current: string): void => {
      for (const entry of readdirSync(current)) {
        const full = join(current, entry);
        if (statSync(full).isDirectory()) visit(full);
        else out.push(full);
      }
    };
    visit(base);
    return out;
  }

  /**
   * Ownership is decided by reference, not by filename.
   *
   * An earlier version of this test matched names and caught two components
   * that predate the engine entirely: OperatingBrief.tsx, which renders the
   * supervisor decision brief from ai/os/brief, and Trend.tsx, an inline SVG
   * sparkline. Neither touches ai/trends. A name is a coincidence; an import
   * is a fact.
   */
  const reachesEngine = (file: string): boolean =>
    /\.(ts|tsx)$/.test(file) && readFileSync(file, "utf8").includes("ai/trends");

  it("adds no API route that reaches the engine", () => {
    const offenders = filesUnder("src/app/api")
      .filter((f) => f.endsWith("route.ts"))
      .filter(reachesEngine);
    expect(offenders, `no route may expose the engine: ${offenders.join(", ")}`).toEqual([]);
  });

  it("adds no page that reaches the engine", () => {
    const offenders = filesUnder("src/app")
      .filter((f) => f.endsWith("page.tsx"))
      .filter(reachesEngine);
    expect(offenders, `no page may render the engine: ${offenders.join(", ")}`).toEqual([]);
  });

  it("is never reachable from anything a user renders", () => {
    // The strongest form of the rule, and the one that actually holds: no
    // client file may reference the engine at all.
    const offenders = filesUnder("src/client").filter(reachesEngine);
    expect(offenders, `client code must not reach the engine: ${offenders.join(", ")}`).toEqual([]);
  });

  it("is absent from the navigation shell", () => {
    const offenders = filesUnder("src/client/components/shell").filter(reachesEngine);
    expect(offenders).toEqual([]);
  });

  it("is absent from every citizen-facing string", () => {
    // The engine's own vocabulary must not appear in anything a citizen reads.
    const offenders: string[] = [];
    for (const file of filesUnder("src/shared/i18n")) {
      if (!/\.(ts|tsx|json)$/.test(file)) continue;
      const text = readFileSync(file, "utf8").toLowerCase();
      if (text.includes("brief d'orientation") || text.includes("opportunit\u00e9")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("every effect a person could notice is off by default", () => {
  it("defaults all three switches to inert", () => {
    expect(TRENDS_DEFAULTS[TRENDS_CONFIG.enabled]).toBe(false);
    expect(TRENDS_DEFAULTS[TRENDS_CONFIG.influenceAgents]).toBe(false);
    expect(TRENDS_DEFAULTS[TRENDS_CONFIG.allowPublicWrites]).toBe(false);
  });

  it("stays inert when configuration is empty", () => {
    expect(resolveState({})).toEqual(INERT_STATE);
  });

  it("cannot have public writes enabled without the master switch", () => {
    // A single key flipped in isolation must not start changing published
    // pages, which every citizen would see at once.
    const state = resolveState({ [TRENDS_CONFIG.allowPublicWrites]: true });
    expect(state.allowPublicWrites).toBe(false);
    expect(state.enabled).toBe(false);
  });

  it("enables only what is asked for", () => {
    const state = resolveState({
      [TRENDS_CONFIG.enabled]: true,
      [TRENDS_CONFIG.influenceAgents]: true,
    });
    expect(state.enabled).toBe(true);
    expect(state.influenceAgents).toBe(true);
    expect(state.allowPublicWrites).toBe(false);
  });

  it("treats a non-boolean as off rather than truthy", () => {
    expect(resolveState({ [TRENDS_CONFIG.enabled]: "yes" }).enabled).toBe(false);
    expect(resolveState({ [TRENDS_CONFIG.enabled]: 1 }).enabled).toBe(false);
  });
});

describe("a brief may change structure, never wording", () => {
  it("reduces to pointers, carrying no prose", () => {
    const influence = structuralInfluence({
      brief: BRIEF,
      approvedClaims: [
        { claimId: "claim_paludisme_01", textFr: "Signes de danger", protocolVersion: "7" },
      ],
      liveChannels: ["seo"],
      draftOnlyChannels: [],
      refusedChannels: [],
    });
    const serialised = JSON.stringify(influence);
    // None of the brief's prose may survive the reduction.
    expect(serialised).not.toContain(BRIEF.audience);
    expect(serialised).not.toContain(BRIEF.intent);
    expect(serialised).not.toContain("Signes de danger");
    expect(serialised).not.toContain(BRIEF.prohibited_claims[0]);
  });

  it("emphasises only the topic's own vocabulary", () => {
    const influence = structuralInfluence({
      brief: BRIEF,
      approvedClaims: [],
      liveChannels: [],
      draftOnlyChannels: [],
      refusedChannels: [],
    });
    expect(influence.emphasisTerms).toEqual(["paludisme", "saison", "pluies"]);
  });

  it("is inert for the baseline", () => {
    expect(structuralInfluence({ kind: "baseline", reasonFr: "aucun" })).toEqual(INERT_INFLUENCE);
  });
});

describe("nothing from a brief may reach a citizen", () => {
  it.each([
    ["the brief id", "Votre réponse. gb_paludisme_01"],
    ["the topic id", "Consultez paludisme-saison-pluies dès que possible."],
    ["an evidence id", "D'après ev_kwilu_341, allez au centre."],
    ["the experiment id", "exp_kwilu_1 recommande ceci."],
    ["a claim id", "claim_paludisme_01 s'applique."],
    ["the call-to-action id", "Voir cta_centre_de_sante."],
  ])("removes %s", (_label, text) => {
    const result = scrubBriefTraces(text, BRIEF);
    expect(result.removed.length).toBeGreaterThan(0);
    expect(containsBriefTrace(result.text, BRIEF)).toBe(false);
  });

  it.each([
    "Selon l'orientation en vigueur, emmenez l'enfant au centre.",
    "Le brief d'orientation indique une priorité.",
    "Score d'opportunité : 86.",
    "Cette réponse suit la priorité de la plateforme.",
  ])("removes machinery wording: %s", (text) => {
    const result = scrubBriefTraces(text, null);
    expect(result.removed.length).toBeGreaterThan(0);
  });

  it("is case-insensitive, because a model will capitalise a sentence", () => {
    const result = scrubBriefTraces("Orientation En Vigueur : agissez vite.", null);
    expect(result.removed.length).toBeGreaterThan(0);
  });

  it("leaves a clean clinical answer completely untouched", () => {
    const answer =
      "Si l'enfant convulse ou ne tète plus, emmenez-le immédiatement au centre de santé le plus proche.";
    const result = scrubBriefTraces(answer, BRIEF);
    expect(result.text).toBe(answer);
    expect(result.removed).toEqual([]);
  });

  it("still returns an answer rather than withholding it", () => {
    // A danger-sign reply cannot be suppressed because a trend identifier
    // leaked into it. The leak is removed; the advice survives.
    const text =
      "gb_paludisme_01 Emmenez l'enfant au centre de santé immédiatement : c'est un signe de danger.";
    const result = scrubBriefTraces(text, BRIEF);
    expect(result.text).toContain("signe de danger");
    expect(result.text).toContain("immédiatement");
    expect(result.text.startsWith("Emmenez")).toBe(true);
  });

  it("does not leave ragged punctuation where it cut", () => {
    const result = scrubBriefTraces("Allez au centre ( gb_paludisme_01 ) aujourd'hui .", BRIEF);
    expect(result.text).not.toContain("( )");
    expect(result.text).not.toContain(" .");
  });

  it("does not mangle a short word that merely resembles an identifier", () => {
    // Traces shorter than four characters are not matched, so ordinary French
    // is safe.
    const answer = "Le lit de l'enfant doit être sous une moustiquaire.";
    expect(scrubBriefTraces(answer, BRIEF).text).toBe(answer);
  });
});
