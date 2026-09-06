/**
 * "Shall I continue?" — plays the next ~25 s chunk of a long answer (FR-CH-04).
 */
import { startOrResume, isContinuationRequest } from "@/lib/channels/session";
import { readTwilioRequest, say, twimlResponse, hangup } from "@/lib/channels/twilio";
import { continueTwiml } from "@/lib/channels/ivr";
import { t } from "@/lib/channels/strings";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { params, valid } = await readTwilioRequest(req, `${url.pathname}${url.search}`);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const from = params.From || params.Caller || "";
  if (!from) return twimlResponse(say(t("noInput", "fr"), "fr") + hangup());

  const { session } = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: from });
  const language = session.language ?? "fr";
  const digits = (params.Digits ?? "").trim();
  const speech = (params.SpeechResult ?? "").trim();

  const wantsMore = digits === "1" || isContinuationRequest(speech);
  if (!wantsMore) return twimlResponse(say(t("goodbye", language), language) + hangup());
  return continueTwiml(req, session);
}
