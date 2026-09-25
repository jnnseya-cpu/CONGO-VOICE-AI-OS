/**
 * Terminology enforcement (FR-LG-05).
 *
 * Reasoning happens in French and the answer is rendered into the citizen's
 * language. For most of a sentence, a good paraphrase is fine. For a handful of
 * words it is not: a disease name, an agricultural input, the name of the exam
 * a child is sitting. If those come out differently on Tuesday than on Monday,
 * the citizen cannot tell whether they are being told the same thing, and a
 * community health worker reading the transcript cannot either.
 *
 * So the glossary is applied to the output, not offered to the model as a
 * suggestion. Where a known wrong rendering appears it is rewritten; where the
 * approved term is missing entirely that is recorded, because a term the
 * renderer silently dropped is the case worth seeing.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode, ModuleType } from "@server/db/schema";
import { normaliseForMatching } from "../safety";

export interface GlossaryTerm {
  termFr: string;
  translations: Partial<Record<LanguageCode, string>>;
  variants: Partial<Record<LanguageCode, string[]>>;
  version: string;
}

export interface GlossaryApplication {
  text: string;
  /** Terms rewritten to their approved rendering. */
  corrected: Array<{ termFr: string; from: string; to: string }>;
  /** Terms present in the French source whose approved rendering never appeared. */
  missing: string[];
  /** The glossary versions that were in force, recorded on the turn. */
  versions: string[];
}

let cache: { at: number; byModule: Map<string, GlossaryTerm[]> } | null = null;
const CACHE_MS = 60_000;

/** The approved entries for a module, plus the ones that apply everywhere. */
export async function activeGlossary(module: ModuleType): Promise<GlossaryTerm[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    const hit = cache.byModule.get(module);
    if (hit) return hit;
  }
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.glossaries)
    .where(and(eq(schema.glossaries.status, "active"), inArray(schema.glossaries.module, [module, "general"])));
  const terms: GlossaryTerm[] = rows.map((r) => ({
    termFr: r.termFr,
    translations: (r.translations ?? {}) as Partial<Record<LanguageCode, string>>,
    variants: (r.variants ?? {}) as Partial<Record<LanguageCode, string[]>>,
    version: r.version,
  }));
  const byModule = cache && now - cache.at < CACHE_MS ? cache.byModule : new Map<string, GlossaryTerm[]>();
  byModule.set(module, terms);
  cache = { at: now, byModule };
  return terms;
}

export function resetGlossaryCache() {
  cache = null;
}

function replaceInsensitive(haystack: string, needle: string, replacement: string): { text: string; replaced: boolean } {
  const idx = normaliseForMatching(haystack).indexOf(normaliseForMatching(needle));
  if (idx < 0) return { text: haystack, replaced: false };
  // Work on the original string at the same offset: normalisation preserves length
  // for the substitutions it makes (case, accents, apostrophes), not for collapsed
  // whitespace, so fall back to a case-insensitive regex when the offsets disagree.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped.replace(/\s+/g, "\\s+"), "i");
  if (!re.test(haystack)) return { text: haystack, replaced: false };
  return { text: haystack.replace(re, replacement), replaced: true };
}

/**
 * Corrects a rendered answer against the glossary.
 *
 * Only terms actually present in the French source are considered: a glossary
 * is not a licence to insert vocabulary the answer never used.
 */
export function applyGlossary(sourceFr: string, rendered: string, target: LanguageCode, terms: GlossaryTerm[]): GlossaryApplication {
  if (target === "fr" || terms.length === 0) return { text: rendered, corrected: [], missing: [], versions: [] };

  const source = normaliseForMatching(sourceFr);
  const corrected: GlossaryApplication["corrected"] = [];
  const missing: string[] = [];
  const versions = new Set<string>();
  let text = rendered;

  for (const term of terms) {
    if (!source.includes(normaliseForMatching(term.termFr))) continue;
    const approved = term.translations[target];
    if (!approved) continue;
    versions.add(term.version);

    if (normaliseForMatching(text).includes(normaliseForMatching(approved))) continue;

    let fixed = false;
    for (const variant of term.variants[target] ?? []) {
      const attempt = replaceInsensitive(text, variant, approved);
      if (attempt.replaced) {
        text = attempt.text;
        corrected.push({ termFr: term.termFr, from: variant, to: approved });
        fixed = true;
        break;
      }
    }
    // The French term surviving untranslated is also a wrong rendering.
    if (!fixed) {
      const attempt = replaceInsensitive(text, term.termFr, approved);
      if (attempt.replaced) {
        text = attempt.text;
        corrected.push({ termFr: term.termFr, from: term.termFr, to: approved });
        fixed = true;
      }
    }
    if (!fixed) missing.push(term.termFr);
  }

  return { text, corrected, missing, versions: [...versions].sort() };
}
