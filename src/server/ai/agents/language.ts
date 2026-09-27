import "server-only";
import type { LanguageCode, ModuleType } from "@server/db/schema";
import { activeGlossary, applyGlossary, type GlossaryApplication } from "../language/glossary";
import { fullyReviewed, joinSegments, renderReviewed, segmentScripted } from "../language/scripted";
import { aiGateway } from "../gateway";
import { LanguageAnalysis, Localisation } from "../schemas";
import { LANGUAGE_AGENT_SYSTEM, LOCALISATION_SYSTEM, localisationUser, messageEnvelope } from "../prompts";
import { learningPromptFragment, retrieveLearningContext, type LearningContext } from "./learning";

export async function analyseLanguage(text: string, hints: { preferredLanguage?: LanguageCode | null; moduleHint?: string | null; learning?: LearningContext }, interactionId?: string) {
  const learning = hints.learning ?? (await retrieveLearningContext(text, hints.preferredLanguage));
  const fragment = learningPromptFragment(learning);
  const r = await aiGateway().generateJson(
    {
      system: LANGUAGE_AGENT_SYSTEM,
      user: (fragment ? fragment + "\n" : "") + messageEnvelope(text, { langue_preferee: hints.preferredLanguage, service_choisi: hints.moduleHint }),
      schema: LanguageAnalysis,
      schemaName: "language_analysis",
      maxTokens: 1200,
    },
    { interactionId },
  );
  return r.output;
}

/** Render a French answer in the citizen's language. French input is returned unchanged. */
export async function localise(
  textFr: string,
  target: LanguageCode,
  interactionId?: string,
  learning?: LearningContext,
  module: ModuleType = "general",
): Promise<string> {
  return (await localiseWithGlossary(textFr, target, { interactionId, learning, module })).text;
}

export interface LocalisationResult {
  text: string;
  glossary: GlossaryApplication;
}

/**
 * The same rendering, with the terminology corrected afterwards (FR-LG-05).
 *
 * The glossary is applied to the output rather than offered to the model as a
 * hint, because a hint is followed most of the time and "most of the time" is
 * exactly the failure: a citizen cannot tell whether two answers that use
 * different words are saying the same thing.
 */
export async function localiseWithGlossary(
  textFr: string,
  target: LanguageCode,
  opts: { interactionId?: string; learning?: LearningContext; module?: ModuleType } = {},
): Promise<LocalisationResult> {
  const empty: GlossaryApplication = { text: textFr, corrected: [], missing: [], versions: [] };
  if (target === "fr" || !textFr.trim()) return { text: textFr, glossary: empty };

  /**
   * Reviewed text is substituted, never translated (FR-LG-04, FR-HE-12).
   *
   * An emergency answer is reviewed text from end to end, so it renders without
   * a model call at all — which is why it is now correct in all five languages
   * with no API key configured, where before it came back in French.
   */
  const segments = segmentScripted(textFr);
  if (fullyReviewed(segments)) {
    const text = joinSegments(segments.map((s) => renderReviewed(s as Extract<typeof s, { kind: "reviewed" }>, target)));
    return { text, glossary: { ...empty, text } };
  }

  const fragment = opts.learning ? learningPromptFragment(opts.learning, target) : "";
  const terms = await activeGlossary(opts.module ?? "general").catch(() => []);
  const corrected: GlossaryApplication["corrected"] = [];
  const missing = new Set<string>();
  const versions = new Set<string>();
  const rendered: string[] = [];

  for (const segment of segments) {
    if (segment.kind === "reviewed") {
      rendered.push(renderReviewed(segment, target));
      continue;
    }
    const r = await aiGateway().generateJson(
      { system: LOCALISATION_SYSTEM, user: (fragment ? fragment + "\n" : "") + localisationUser(segment.fr, target), schema: Localisation, schemaName: "localisation", maxTokens: 1500 },
      { interactionId: opts.interactionId },
    );
    // The glossary is enforced on what the model wrote, and only on that:
    // "correcting" reviewed wording would defeat the review.
    const applied = applyGlossary(segment.fr, r.output.text, target, terms);
    rendered.push(applied.text);
    corrected.push(...applied.corrected);
    for (const m of applied.missing) missing.add(m);
    for (const v of applied.versions) versions.add(v);
  }

  const text = joinSegments(rendered);
  return { text, glossary: { text, corrected, missing: [...missing], versions: [...versions] } };
}
