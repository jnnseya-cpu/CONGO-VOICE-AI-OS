import "server-only";
import type { LanguageCode } from "@server/db/schema";
import {
  BOUNDARY_RESPONSES,
  CLAIM_FALLBACK,
  DISCLAIMERS,
  EMERGENCY_EN_ROUTE,
  EMERGENCY_INSTRUCTIONS,
  EMERGENCY_MESSAGES,
  FACILITY_UNKNOWN_NOTE,
  SAFEGUARDING_RESPONSES,
  normaliseForMatching,
} from "../safety";
import { FIXED_SCRIPTS } from "./scripts";

/**
 * Reviewed text is used, not translated.
 *
 * Every safety-critical script in this platform already exists in all five
 * languages, written and reviewed once. The answer a citizen hears, however, was
 * composed in French and then handed whole to the Language Agent — so the
 * reviewed Lingala emergency instruction was never used. Online, the model
 * re-translated the French, which the specification forbids for exactly these
 * strings; offline, where there is no model to translate with, a Lingala speaker
 * whose child was convulsing received the answer in French.
 *
 * So localisation is split before it reaches a model. A span of the French
 * answer that *is* one of these reviewed constants is replaced by its reviewed
 * counterpart in the target language, and only what is left over — the
 * explanation the model wrote in the first place — is translated. An emergency
 * answer is reviewed text end to end, so it needs no model at all: it is correct
 * in all five languages with no API key, which is the case that matters most and
 * the one that used to be worst.
 */

/** Reviewed text that may appear verbatim inside a composed French answer. */
const REVIEWED: Array<Record<LanguageCode, string>> = [
  // Longest first is established below by sorting; the order here is only for reading.
  EMERGENCY_INSTRUCTIONS,
  EMERGENCY_MESSAGES,
  EMERGENCY_EN_ROUTE,
  SAFEGUARDING_RESPONSES,
  FACILITY_UNKNOWN_NOTE,
  CLAIM_FALLBACK,
  DISCLAIMERS,
  ...Object.values(BOUNDARY_RESPONSES),
  ...Object.values(FIXED_SCRIPTS),
];

/**
 * Candidates ordered longest French text first.
 *
 * `EMERGENCY_INSTRUCTIONS` contains `EMERGENCY_MESSAGES`; matching the short one
 * first would split the long one in half and translate the remainder. Longest
 * first is what makes the two constants compose rather than collide.
 */
const CANDIDATES: Array<Record<LanguageCode, string>> = Array.from(new Set(REVIEWED))
  .filter((entry) => entry.fr.trim().length > 0)
  .sort((a, b) => b.fr.length - a.fr.length);

export type Segment =
  | { kind: "reviewed"; fr: string; rendered: Record<LanguageCode, string> }
  | { kind: "free"; fr: string };

/**
 * Splits a composed French answer into reviewed spans and everything else.
 *
 * Matching is on the normalised text — a composed answer has been through
 * sentence de-duplication and whitespace collapsing — but the span returned is
 * cut from the original, so nothing is silently re-spelled.
 */
export function segmentScripted(textFr: string): Segment[] {
  const segments: Segment[] = [{ kind: "free", fr: textFr }];
  for (const candidate of CANDIDATES) {
    const needle = normaliseForMatching(candidate.fr);
    if (!needle) continue;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (segment.kind !== "free") continue;
      const found = findNormalised(segment.fr, needle);
      if (!found) continue;
      const before = segment.fr.slice(0, found.start);
      const after = segment.fr.slice(found.end);
      const replacement: Segment[] = [];
      if (before.trim()) replacement.push({ kind: "free", fr: before });
      replacement.push({ kind: "reviewed", fr: segment.fr.slice(found.start, found.end), rendered: candidate });
      if (after.trim()) replacement.push({ kind: "free", fr: after });
      segments.splice(i, 1, ...replacement);
      i += replacement.length - 1;
    }
  }
  return segments.filter((s) => s.kind === "reviewed" || s.fr.trim().length > 0);
}

/**
 * Locates a normalised needle inside raw text and maps the hit back to raw
 * offsets, so accents and curly apostrophes in the original survive the cut.
 */
function findNormalised(raw: string, needle: string): { start: number; end: number } | null {
  // Offsets of each raw character within the normalised string.
  const map: number[] = [];
  let normalised = "";
  for (let i = 0; i < raw.length; i += 1) {
    const piece = normaliseForMatching(raw[i]);
    // Whitespace collapses, so a run of spaces contributes at most one space.
    if (piece === "" ) {
      if (/\s/.test(raw[i]) && normalised.length > 0 && !normalised.endsWith(" ")) {
        map.push(i);
        normalised += " ";
      }
      continue;
    }
    for (const ch of piece) {
      map.push(i);
      normalised += ch;
    }
  }
  const at = normalised.indexOf(needle);
  if (at === -1) return null;
  const start = map[at];
  const lastIndex = at + needle.length - 1;
  const end = (map[lastIndex] ?? raw.length - 1) + 1;
  return { start, end };
}

/** True when the whole answer is reviewed text, so no model is needed to render it. */
export function fullyReviewed(segments: Segment[]): boolean {
  return segments.length > 0 && segments.every((s) => s.kind === "reviewed");
}

/** Joins rendered segments back into one answer. */
export function joinSegments(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}

/** The reviewed text for a target language, falling back to the French original. */
export function renderReviewed(segment: Extract<Segment, { kind: "reviewed" }>, target: LanguageCode): string {
  return segment.rendered[target]?.trim() || segment.fr;
}
