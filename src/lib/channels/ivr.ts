/**
 * Shared IVR logic: everything the four Twilio route handlers have in common —
 * greeting rotation, session lookup by caller id, and turning a `TurnResult` into TwiML.
 */
import "server-only";
import type { LanguageCode } from "@/lib/db/schema";
import { absoluteUrl, synthesizeReply } from "./media";
import { gather, record, say, speak, twimlResponse, hangup } from "./twilio";
import { LANGUAGES, t } from "./strings";
import { continueTurn, readState, type ChannelSession, type TurnResult } from "./session";

export const IVR_BASE = "/api/hooks/ivr/twilio";
export const IVR_GATHER = `${IVR_BASE}/gather`;
export const IVR_RECORDING = `${IVR_BASE}/recording`;
export const IVR_CONTINUE = `${IVR_BASE}/continue`;

/** Global rotation so that unknown callers do not always hear French first. */
const rotationHolder = globalThis as unknown as { __cvosGreetingRotation?: number };

export function nextGreetingLanguage(session: ChannelSession): { language: LanguageCode; index: number } {
  const state = readState(session);
  if (session.language && session.turnCount > 0) return { language: session.language, index: state.greetingIndex ?? 0 };
  const index = state.greetingIndex ?? (rotationHolder.__cvosGreetingRotation = ((rotationHolder.__cvosGreetingRotation ?? -1) + 1) % LANGUAGES.length);
  return { language: LANGUAGES[index % LANGUAGES.length], index: (index + 1) % LANGUAGES.length };
}

export function languageMenu(language: LanguageCode): string {
  return gather({ action: `${IVR_GATHER}?step=language`, numDigits: 1, timeout: 5, language }, say(t("languageMenu", language), language));
}

export function openQuestionMenu(language: LanguageCode): string {
  return gather(
    { action: `${IVR_GATHER}?step=intent`, numDigits: 1, timeout: 6, speechTimeout: "auto", language },
    say(t("openQuestion", language), language),
  );
}

export function recordQuestion(language: LanguageCode): string {
  return `${say(t("recordPrompt", language), language)}${record({ action: IVR_RECORDING, maxLength: 45, timeout: 3, transcribe: false })}`;
}

/**
 * Speaks a reply: synthesised audio when a TTS provider exists (<Play>), otherwise <Say>
 * with fr-FR / sw-KE voices. Long answers are chunked and offered with "shall I continue?".
 */
export async function replyTwiml(req: Request, session: ChannelSession, result: TurnResult): Promise<Response> {
  const language = result.language;
  const spoken = await synthesizeReply(result.text, language, {
    userId: session.userId,
    interactionId: result.interactionId,
  });
  const audioUrl = spoken ? absoluteUrl(req, spoken.path) : null;
  let body = speak(result.text, language, audioUrl);

  if (result.hasMore) {
    body += gather(
      { action: `${IVR_CONTINUE}`, numDigits: 1, timeout: 5, language },
      say(t("continuePrompt", language), language),
    );
    body += say(t("goodbye", language), language) + hangup();
    return twimlResponse(body);
  }

  // Answer given: offer another question, then hang up on silence.
  body += openQuestionMenu(language);
  body += say(t("goodbye", language), language) + hangup();
  return twimlResponse(body);
}

/** Next chunk of a long answer (FR-CH-04). */
export async function continueTwiml(req: Request, session: ChannelSession): Promise<Response> {
  const next = await continueTurn(session);
  if (!next.text) {
    const language = session.language ?? "fr";
    return twimlResponse(say(t("goodbye", language), language) + hangup());
  }
  return replyTwiml(req, session, next);
}
