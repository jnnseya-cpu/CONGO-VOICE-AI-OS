/**
 * Twilio <Gather> callback: language selection, resume choice, the one open question and
 * its DTMF fallback 1 = santé, 2 = agriculture, 3 = éducation (FR-CH-02).
 */
import type { LanguageCode } from "@/lib/db/schema";
import {
  endSession,
  patchState,
  recordSharedPhoneAnswer,
  runTurn,
  settleTurn,
  setSessionLanguage,
  setSessionModule,
  startOrResume,
} from "@/lib/channels/session";
import { readTwilioRequest, say, twimlResponse, hangup } from "@/lib/channels/twilio";
import { languageMenu, openQuestionMenu, recordQuestion, replyTwiml } from "@/lib/channels/ivr";
import { LANGUAGE_BY_DIGIT, LANGUAGE_NAMES, MODULE_BY_DIGIT, t } from "@/lib/channels/strings";

export const dynamic = "force-dynamic";

function languageFromSpeech(speech: string | undefined): LanguageCode | null {
  if (!speech) return null;
  const s = speech.toLowerCase();
  for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
    if (s.includes(name.toLowerCase())) return code as LanguageCode;
  }
  if (s.includes("swahili")) return "sw";
  if (s.includes("français") || s.includes("francais") || s.includes("french")) return "fr";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { params, valid } = await readTwilioRequest(req, `${url.pathname}${url.search}`);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const step = url.searchParams.get("step") ?? "language";
  const from = params.From || params.Caller || "";
  if (!from) return twimlResponse(say(t("noInput", "fr"), "fr") + hangup());

  const { session } = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: from });
  const digits = (params.Digits ?? "").trim();
  const speech = (params.SpeechResult ?? "").trim();
  let language: LanguageCode = session.language ?? "fr";

  if (step === "language") {
    const chosen = LANGUAGE_BY_DIGIT[digits] ?? languageFromSpeech(speech);
    if (!chosen) return twimlResponse(say(t("invalidChoice", language), language) + languageMenu(language));
    const updated = await setSessionLanguage(session, chosen);
    language = updated.language ?? chosen;
    await patchState(session.id, { step: "intent" });
    return twimlResponse(openQuestionMenu(language) + say(t("goodbye", language), language) + hangup());
  }

  if (step === "resume") {
    if (digits === "2") {
      await endSession(session.id);
      const fresh = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: from });
      const lang = fresh.session.language ?? "fr";
      return twimlResponse(languageMenu(lang));
    }
    await patchState(session.id, { step: "intent" });
    return twimlResponse(openQuestionMenu(language) + say(t("goodbye", language), language) + hangup());
  }

  if (step === "shared") {
    await recordSharedPhoneAnswer(session, digits === "2" ? "other" : "self");
    return twimlResponse(openQuestionMenu(language) + say(t("goodbye", language), language) + hangup());
  }

  // step === "intent": either a spoken question, or a module chosen on the keypad.
  const chosenModule = MODULE_BY_DIGIT[digits];
  if (chosenModule) {
    await setSessionModule(session, chosenModule);
    await patchState(session.id, { step: "recording" });
    return twimlResponse(recordQuestion(language));
  }

  if (speech) {
    const result = await runTurn({ session, text: speech });
    const response = await replyTwiml(req, session, result);
    await settleTurn(result);
    return response;
  }

  return twimlResponse(say(t("noInput", language), language) + recordQuestion(language));
}
