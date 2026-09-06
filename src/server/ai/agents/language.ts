import "server-only";
import type { LanguageCode } from "@server/db/schema";
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
export async function localise(textFr: string, target: LanguageCode, interactionId?: string, learning?: LearningContext): Promise<string> {
  if (target === "fr" || !textFr.trim()) return textFr;
  const fragment = learning ? learningPromptFragment(learning, target) : "";
  const r = await aiGateway().generateJson(
    { system: LOCALISATION_SYSTEM, user: (fragment ? fragment + "\n" : "") + localisationUser(textFr, target), schema: Localisation, schemaName: "localisation", maxTokens: 1500 },
    { interactionId },
  );
  return r.output.text;
}
