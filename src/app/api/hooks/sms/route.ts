/**
 * Inbound SMS webhook (Africa's Talking and Twilio field names both accepted).
 *
 * Unauthenticated by design; the reply goes back out over the SMS client as at most three
 * concatenated messages (FR-CH-21). STOP / ARRÊT / TIKA / ACHA revoke consent (FR-CH-14).
 */
import { withIdempotency, IdempotencyConflict } from "@/lib/core/idempotency";
import { runTurn, settleTurn, startOrResume, continueTurn, isContinuationRequest, readState } from "@/lib/channels/session";
import { sendSms } from "@/lib/channels/sms";
import { safeMessage } from "@/lib/channels/errors";

export const dynamic = "force-dynamic";

interface InboundSms {
  from: string;
  text: string;
  messageId: string | null;
}

async function parseInbound(req: Request): Promise<InboundSms | null> {
  const contentType = req.headers.get("content-type") ?? "";
  let get: (key: string) => string | null;
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    get = (key) => (typeof body[key] === "string" ? (body[key] as string) : null);
  } else {
    const form = new URLSearchParams(await req.text());
    get = (key) => form.get(key);
  }
  const from = get("from") ?? get("From") ?? get("msisdn") ?? "";
  const text = get("text") ?? get("Body") ?? get("message") ?? "";
  const messageId = get("id") ?? get("MessageSid") ?? get("messageId");
  if (!from) return null;
  return { from, text: text.trim(), messageId };
}

export async function POST(req: Request): Promise<Response> {
  const inbound = await parseInbound(req);
  if (!inbound) return new Response("OK", { status: 200 });
  try {
    await withIdempotency(inbound.messageId ? `sms:${inbound.messageId}` : null, null, () => handle(inbound));
  } catch (err) {
    if (!(err instanceof IdempotencyConflict)) console.error("[sms] inbound handling failed", err);
  }
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}

async function handle(inbound: InboundSms): Promise<{ handled: boolean }> {
  const { session } = await startOrResume({ channel: "sms", kind: "msisdn", identifier: inbound.from });
  const language = session.language ?? "fr";

  if (!inbound.text) {
    await sendSms({ to: inbound.from, userId: session.userId, language, text: safeMessage("VALIDATION_FAILED", language) });
    return { handled: true };
  }

  // "CONTINUER" resumes a long answer without spending a new AI call.
  const state = readState(session);
  if (isContinuationRequest(inbound.text) && (state.continuation?.chunks.length ?? 0) > (state.continuation?.index ?? 0) + 1) {
    const next = await continueTurn(session);
    await sendSms({
      to: inbound.from,
      userId: session.userId,
      language: next.language,
      text: next.hasMore && next.continuationPrompt ? `${next.text} ${next.continuationPrompt}` : next.text,
      payload: { sessionId: session.id, source: "sms" },
    });
    return { handled: true };
  }

  const result = await runTurn({ session, text: inbound.text, wantsAudio: false });
  const body = result.hasMore && result.continuationPrompt ? `${result.text} ${result.continuationPrompt}` : result.text;
  await sendSms({
    to: inbound.from,
    userId: session.userId,
    language: result.language,
    type: result.emergency ? "escalation" : "follow_up",
    text: body,
    payload: { sessionId: session.id, interactionId: result.interactionId, source: "sms" },
  });
  await settleTurn(result);
  return { handled: true };
}
