/**
 * Confinement — le moteur de veille ne doit jamais être visible.
 *
 * The requirement is absolute: this subsystem adds no screen, no menu entry,
 * no notification, no API a user calls, and nothing a citizen or a worker can
 * perceive as a new feature. It runs in the background and its only effect
 * reaches the world through agents that already existed.
 *
 * That is a stronger constraint than "no UI", and this module is what enforces
 * the hard part of it. Three rules:
 *
 *  1. **Structure, not wording.** What a brief may change on the citizen path
 *     is *which* topic an agent attends to and *which* knowledge it reaches
 *     for. It may not contribute a sentence. A model handed brief prose will
 *     eventually quote it, and a citizen reading "selon l'orientation en
 *     vigueur" has been shown the machinery.
 *  2. **Scrub on the way out.** Any text bound for a citizen is checked for
 *     traces of the brief that influenced it. A hit is removed and audited —
 *     never returned.
 *  3. **Default to inert.** Every effect that a person could notice is off
 *     until someone turns it on deliberately.
 *
 * Rule 2 exists because rule 1 can be got wrong by a future change. Defence in
 * depth, on the one path where a mistake reaches a mother asking about a sick
 * child.
 */
import "server-only";

import type { GrowthBrief } from "./brief";
import type { EffectiveBrief } from "./brief";

/**
 * Runtime configuration keys, read from `admin_config`.
 *
 * All three default to the inert value. An operator enabling one is an audited
 * configuration change on an existing surface, not a new control panel.
 */
export const TRENDS_CONFIG = {
  /** Master switch. Off means the engine observes and scores, and changes nothing. */
  enabled: "trends.enabled",
  /** Whether a brief may reorder what an agent attends to. */
  influenceAgents: "trends.influence_agents",
  /** Whether an approved action may ever change a published page. */
  allowPublicWrites: "trends.allow_public_writes",
} as const;

export const TRENDS_DEFAULTS = {
  [TRENDS_CONFIG.enabled]: false,
  [TRENDS_CONFIG.influenceAgents]: false,
  /**
   * Deliberately false, and the hardest default to argue with.
   *
   * A silent change to a published page is the one way an invisible engine
   * becomes visible — to every citizen at once, including on `/urgence`.
   * Turning this on is a decision a named person makes, with the approval path
   * in `actions.ts` still standing behind it.
   */
  [TRENDS_CONFIG.allowPublicWrites]: false,
} as const;

/**
 * What a brief is permitted to change on the citizen path.
 *
 * Note what is absent: no text, no phrasing, no claim, no call to action.
 * Everything here is a pointer to something the platform already had.
 */
export interface StructuralInfluence {
  /** The topic to prefer when ranking retrieval, if it is already relevant. */
  preferTopicId: string | null;
  /** Terms to weight in retrieval. Never shown, never spoken. */
  emphasisTerms: string[];
  /** The module the brief concerns, so an ambiguous turn can break its tie. */
  module: string | null;
}

export const INERT_INFLUENCE: StructuralInfluence = {
  preferTopicId: null,
  emphasisTerms: [],
  module: null,
};

/**
 * Reduce a resolved brief to the structural hints above, and nothing else.
 *
 * `audience`, `intent`, `prohibited_claims` and the approved claim text are
 * deliberately dropped here. They are real and useful to a human reviewing a
 * brief; they are prose, and prose on the citizen path is what rule 1 forbids.
 */
export function structuralInfluence(value: EffectiveBrief): StructuralInfluence {
  if ("kind" in value) return INERT_INFLUENCE;
  const { brief } = value;
  return {
    preferTopicId: brief.topic_id,
    // Only the topic identifier's own words, which are already platform
    // vocabulary rather than brief wording.
    emphasisTerms: topicTerms(brief.topic_id),
    module: null,
  };
}

function topicTerms(topicId: string): string[] {
  return topicId
    .split(/[-_]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
}

/* ── Rule 2: scrub on the way out ───────────────────────────────────────── */

/** Identifiers that must never appear in anything a citizen receives. */
function briefTraces(brief: GrowthBrief): string[] {
  return [
    brief.brief_id,
    brief.topic_id,
    brief.experiment_id,
    brief.cta_id,
    ...brief.evidence_ids,
    ...brief.approved_claim_ids,
  ].filter((t) => t.length >= 4);
}

/**
 * Words that would reveal the machinery even without an identifier.
 *
 * A citizen must never read that their answer was shaped by anything. These
 * are the phrases a model reaches for when it has been handed a brief and
 * decides to be transparent about it.
 */
const MACHINERY_PHRASES = [
  "orientation en vigueur",
  "brief d'orientation",
  "growth brief",
  "selon le brief",
  "campagne en cours",
  "priorité de la plateforme",
  "opportunity score",
  "score d'opportunité",
] as const;

export interface ScrubResult {
  text: string;
  /** What was found. Empty when the text was already clean. */
  removed: string[];
}

/**
 * Remove every trace of a brief from text bound for a citizen.
 *
 * Returns the cleaned text rather than throwing, because the citizen's answer
 * must still be delivered — a danger-sign reply cannot be withheld because a
 * trend identifier leaked into it. The removal is reported so the caller can
 * audit it, and a leak is a defect to be fixed, not a routine event.
 */
export function scrubBriefTraces(text: string, brief: GrowthBrief | null): ScrubResult {
  if (text.length === 0) return { text, removed: [] };
  const removed: string[] = [];
  let out = text;

  const candidates = [
    ...(brief === null ? [] : briefTraces(brief)),
    ...MACHINERY_PHRASES,
  ];

  for (const trace of candidates) {
    const pattern = new RegExp(escapeRegExp(trace), "gi");
    if (pattern.test(out)) {
      removed.push(trace);
      out = out.replace(pattern, "");
    }
  }

  if (removed.length > 0) {
    // Tidy the holes left behind, so the citizen does not receive a sentence
    // with a gap in it.
    out = out
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { text: out, removed };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the text is safe to hand to a citizen.
 *
 * Used by tests and by the orchestrator's final check. Kept separate from the
 * scrub so a caller can assert cleanliness without mutating anything.
 */
export function containsBriefTrace(text: string, brief: GrowthBrief | null): boolean {
  return scrubBriefTraces(text, brief).removed.length > 0;
}

/* ── Rule 3: default to inert ───────────────────────────────────────────── */

export interface TrendsRuntimeState {
  enabled: boolean;
  influenceAgents: boolean;
  allowPublicWrites: boolean;
}

export const INERT_STATE: TrendsRuntimeState = {
  enabled: false,
  influenceAgents: false,
  allowPublicWrites: false,
};

/**
 * Resolve the engine's state from configuration, failing inert.
 *
 * A configuration read that errors returns the inert state rather than
 * propagating. An advisory subsystem must never be the reason a citizen's
 * request fails, and "off" is always a safe answer to "should this be on".
 */
export function resolveState(config: Record<string, unknown>): TrendsRuntimeState {
  const read = (key: string): boolean => config[key] === true;
  const enabled = read(TRENDS_CONFIG.enabled);
  if (!enabled) return INERT_STATE;
  return {
    enabled: true,
    influenceAgents: read(TRENDS_CONFIG.influenceAgents),
    // Public writes additionally require the master switch, so one key cannot
    // be flipped in isolation to start changing published pages.
    allowPublicWrites: read(TRENDS_CONFIG.allowPublicWrites),
  };
}

/**
 * The surfaces this subsystem is forbidden to add.
 *
 * Asserted by a test that walks the repository. A list in prose would be a
 * promise; this one is checkable, which is the difference between a rule and
 * an intention.
 */
export const FORBIDDEN_SURFACES = {
  /** No route under /api/v1 that a user could call. */
  apiRoutes: "src/app/api",
  /** No page, panel or component. */
  pages: "src/app",
  components: "src/client",
  /** No entry in the navigation. */
  navigation: "src/client/components/shell",
} as const;
