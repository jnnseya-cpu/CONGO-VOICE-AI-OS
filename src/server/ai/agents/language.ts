import "server-only";
import type { LanguageCode, ModuleType } from "@server/db/schema";
import { activeGlossary, applyGlossary, type GlossaryApplication } from "../language/glossary";
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

  const fragment = opts.learning ? learningPromptFragment(opts.learning, target) : "";
  const r = await aiGateway().generateJson(
    { system: LOCALISATION_SYSTEM, user: (fragment ? fragment + "\n" : "") + localisationUser(textFr, target), schema: Localisation, schemaName: "localisation", maxTokens: 1500 },
    { interactionId: opts.interactionId },
  );

  const terms = await activeGlossary(opts.module ?? "general").catch(() => []);
  const glossary = applyGlossary(textFr, r.output.text, target, terms);
  return { text: glossary.text, glossary };
}
