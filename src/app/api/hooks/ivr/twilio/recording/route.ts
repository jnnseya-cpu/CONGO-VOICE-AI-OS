/**
 * Twilio <Record> callback: the caller's spoken question. Silence ends the utterance
 * (trim-silence + a 3 s timeout on the <Record> verb), then the recording goes through the
 * canonical pipeline and the answer is played back.
 */
import { runTurn, settleTurn, startOrResume } from "@/lib/channels/session";
import { fetchRecording, readTwilioRequest, say, twimlResponse, hangup } from "@/lib/channels/twilio";
import { recordQuestion, replyTwiml } from "@/lib/channels/ivr";
import { safeMessage } from "@/lib/channels/errors";
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

  // Twilio may transcribe for us; otherwise we fetch the recording and transcribe in-house.
  const transcript = (params.TranscriptionText || params.SpeechResult || "").trim();
  let audio: { data: Buffer; mimeType: string } | null = null;
  if (!transcript && params.RecordingUrl) {
    audio = await fetchRecording(params.RecordingUrl);
  }

  if (!transcript && !audio) {
    return twimlResponse(say(safeMessage("MEDIA_QUALITY_LOW", language), language) + recordQuestion(language));
  }

  const result = await runTurn({ session, text: transcript || null, audio });
  const response = await replyTwiml(req, session, result);
  await settleTurn(result);
  return response;
}
