/**
 * Twilio Programmable Voice — incoming call.
 *
 * Unauthenticated by design: the X-Twilio-Signature header authenticates the request when
 * TWILIO_AUTH_TOKEN is configured, so this is a plain route handler.
 *
 * The greeting rotates through the five languages and stays inside six seconds, then the
 * caller says or presses their language (FR-CH-02). A caller recognised within 24 hours is
 * offered "where we left off" instead (FR-CH-06).
 */
import { patchState, startOrResume } from "@/lib/channels/session";
import { readTwilioRequest, say, twimlResponse, gather, hangup } from "@/lib/channels/twilio";
import { IVR_BASE, IVR_GATHER, languageMenu, nextGreetingLanguage } from "@/lib/channels/ivr";
import { t } from "@/lib/channels/strings";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { params, valid } = await readTwilioRequest(req, `${url.pathname}${url.search}`);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const from = params.From || params.Caller || "";
  if (!from) return twimlResponse(say(t("noInput", "fr"), "fr") + hangup());

  const { session, resumed, summary } = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: from });
  const { language, index } = nextGreetingLanguage(session);
  await patchState(session.id, { greetingIndex: index, step: resumed && summary ? "resume" : "language" });

  // Short greeting first: the caller hears something within six seconds.
  let body = say(t("greeting", language), language);
  if (resumed && summary) {
    body += gather(
      { action: `${IVR_GATHER}?step=resume`, numDigits: 1, timeout: 5, language },
      say(`${summary} ${t("resumeQuestion", language)}`, language),
    );
  } else {
    body += languageMenu(language);
  }
  body += say(t("noInput", language), language);
  body += `<Redirect method="POST">${IVR_BASE}</Redirect>`;
  return twimlResponse(body);
}
