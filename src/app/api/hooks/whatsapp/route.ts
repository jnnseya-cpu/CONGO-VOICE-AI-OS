/**
 * WhatsApp Cloud API webhook (Meta).
 *
 * Unauthenticated by design: GET carries the verification challenge and POST is
 * authenticated by the X-Hub-Signature-256 header, so it is a plain route handler rather
 * than a `handle()` route.
 *
 * Inbound: text · voice note · photo · short video · interactive button and list replies.
 * Outbound: text plus a voice note when speech synthesis is available (FR-CH-10),
 * buttons (≤3) and lists (≤10) for confirmations (FR-CH-12), templates outside the
 * 24 h window (FR-CH-13), opt-in / opt-out (FR-CH-14).
 */
import type { LanguageCode, ModuleType } from "@server/db/schema";
import { withIdempotency, IdempotencyConflict } from "@server/core/idempotency";
import {
  continueTurn,
  getSessionById,
  patchState,
  readState,
  recordSharedPhoneAnswer,
  runTurn,
  setSessionLanguage,
  setSessionModule,
  settleTurn,
  shouldConfirmSharedPhone,
  startOrResume,
  type ChannelSession,
  type TurnResult,
} from "@server/channels/session";
import {
  downloadMedia,
  parseInbound,
  sendButtons,
  sendList,
  sendText,
  sendVoiceNote,
  verifySignature,
  verifyWebhookChallenge,
  type InboundWhatsappMessage,
} from "@server/channels/whatsapp";
import { recordDeliveryReport } from "@server/channels/sms";
import { synthesizeReply, storeInboundMedia, MAX_VIDEO_BYTES } from "@server/channels/media";
import { safeMessage } from "@server/channels/errors";
import { LANGUAGE_NAMES, moduleLabel, t } from "@server/channels/strings";
import { menuQuestions, questionLabel } from "@server/channels/menus";

export const dynamic = "force-dynamic";

/** Webhook verification handshake. */
export async function GET(req: Request): Promise<Response> {
  const challenge = verifyWebhookChallenge(new URL(req.url).searchParams);
  if (!challenge) return new Response("forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const { messages, statuses } = parseInbound(payload);
  for (const status of statuses) {
    if (status.messageId) await recordDeliveryReport(status.messageId, status.status);
  }

  for (const message of messages) {
    try {
      // Meta retries deliveries: the message id makes processing exactly-once.
      await withIdempotency(`wa:${message.messageId}`, null, () => handleMessage(message));
    } catch (err) {
      if (err instanceof IdempotencyConflict) continue;
      console.error("[whatsapp] message handling failed", err);
    }
  }
  return Response.json({ received: true });
}

async function handleMessage(message: InboundWhatsappMessage): Promise<{ handled: boolean }> {
  if (!message.from) return { handled: false };
  const { session: initial, resumed, summary } = await startOrResume({
    channel: "whatsapp",
    kind: "whatsapp",
    identifier: message.from,
  });
  let session = await patchState(initial.id, { lastInboundAt: new Date().toISOString() });
  const language: LanguageCode = session.language ?? "fr";

  // Interactive replies drive the menus without an AI call.
  if (message.replyId) {
    const handled = await handleQuickReply(session, message.replyId, message.from);
    if (handled) return { handled: true };
    session = (await getSessionById(session.id)) ?? session;
  }

  // Media.
  let audio: { data: Buffer; mimeType: string } | null = null;
  const images: Array<{ data: Buffer; mimeType: string; fileId: string }> = [];
  if (message.type === "audio" && message.mediaId) {
    const media = await downloadMedia(message.mediaId);
    if (!media) {
      await sendText(message.from, safeMessage("MEDIA_QUALITY_LOW", language));
      return { handled: true };
    }
    audio = { data: media.data, mimeType: media.mimeType || "audio/ogg" };
  } else if ((message.type === "image" || message.type === "video") && message.mediaId) {
    const media = await downloadMedia(message.mediaId, MAX_VIDEO_BYTES);
    if (!media) {
      await sendText(message.from, safeMessage("MEDIA_QUALITY_LOW", language));
      return { handled: true };
    }
    if (message.type === "video" && media.sizeBytes > MAX_VIDEO_BYTES) {
      await sendText(message.from, safeMessage("MEDIA_QUALITY_LOW", language));
      return { handled: true };
    }
    const stored = await storeInboundMedia({ userId: session.userId, data: media.data, mimeType: media.mimeType });
    // Videos are kept as evidence; only images are analysed frame-wise today.
    images.push({
      data: message.type === "image" ? media.data : Buffer.alloc(0),
      mimeType: media.mimeType,
      fileId: stored.fileId,
    });
  }

  const text = message.text?.trim() ?? null;
  if (!text && !audio && images.length === 0) {
    // Nothing usable: offer the three modules as quick replies (FR-CH-12).
    await sendButtons(message.from, `${t("welcomeText", language)}\n\n${t("chooseModule", language)}`, [
      { id: "mod:health", title: moduleLabel("health", language) },
      { id: "mod:agriculture", title: moduleLabel("agriculture", language) },
      { id: "mod:education", title: moduleLabel("education", language) },
    ]);
    return { handled: true };
  }

  if (resumed && summary && session.turnCount > 0) {
    await sendText(message.from, summary);
  }

  const result = await runTurn({ session, text, audio, images });
  await deliver(session, message.from, result);
  // Emergency replies are sent before the pipeline finishes; the CHW alert must still fire.
  await settleTurn(result);

  // Shared-phone confirmation, asked once, after the answer (FR-CH-41).
  const fresh = (await getSessionById(session.id)) ?? session;
  if (shouldConfirmSharedPhone(fresh) && fresh.turnCount > 1) {
    await sendButtons(message.from, t("sharedPhone", language), [
      { id: "shared:self", title: t("forMe", language).slice(0, 20) },
      { id: "shared:other", title: t("forSomeoneElse", language).slice(0, 20) },
    ]);
    await patchState(fresh.id, { sharedPhonePrompted: true });
  }
  return { handled: true };
}

/** Language / module / continuation / shared-phone buttons. Returns true when consumed. */
async function handleQuickReply(session: ChannelSession, replyId: string, to: string): Promise<boolean> {
  const language = session.language ?? "fr";
  if (replyId.startsWith("lang:")) {
    const code = replyId.slice(5) as LanguageCode;
    const updated = await setSessionLanguage(session, code);
    await sendText(to, `${LANGUAGE_NAMES[code] ?? code} ✓ ${t("welcomeText", updated.language ?? code)}`);
    return true;
  }
  if (replyId.startsWith("mod:")) {
    const chosenModule = replyId.slice(4) as ModuleType;
    const updated = await setSessionModule(session, chosenModule);
    const rows = menuQuestions(chosenModule).map((q, i) => ({
      id: `q:${chosenModule}:${i}`,
      title: questionLabel(q, language),
      description: q.questionFr,
    }));
    if (rows.length > 0) {
      await sendList(to, `${moduleLabel(chosenModule, language)} — ${t("chooseQuestion", language)}`, "Questions", rows);
    } else {
      await sendText(to, t("welcomeText", updated.language ?? language));
    }
    return true;
  }
  if (replyId.startsWith("q:")) {
    const [, moduleKey, index] = replyId.split(":");
    const question = menuQuestions(moduleKey as ModuleType)[Number(index)];
    if (!question) return false;
    const result = await runTurn({ session, text: question.questionFr, moduleHint: moduleKey as ModuleType });
    await deliver(session, to, result);
    await settleTurn(result);
    return true;
  }
  if (replyId.startsWith("shared:")) {
    const answer = replyId.slice(7) === "other" ? "other" : "self";
    await recordSharedPhoneAnswer(session, answer);
    await sendText(to, t("optInAck", language));
    return true;
  }
  if (replyId === "more") {
    const next = await continueTurn(session);
    await deliver(session, to, next);
    return true;
  }
  return false;
}

/** Sends the reply as text, adds a voice note when TTS exists, and offers follow-ups. */
async function deliver(session: ChannelSession, to: string, result: TurnResult): Promise<void> {
  const language = result.language;
  const body = result.hasMore && result.continuationPrompt ? `${result.text}\n\n${result.continuationPrompt}` : result.text;
  if (!body.trim()) return;

  if (result.hasMore) {
    await sendButtons(to, body, [{ id: "more", title: "Continuer" }]);
  } else {
    await sendText(to, body);
  }

  // Voice note alongside the text (FR-CH-10).
  const state = readState(session);
  if (!state.optedOut && result.status !== "opted_out") {
    const spoken = await synthesizeReply(result.text, language, {
      userId: session.userId,
      interactionId: result.interactionId,
    });
    if (spoken) await sendVoiceNote(to, spoken.audio, spoken.mimeType);
  }

  if (result.followUpQuestions.length > 0 && !result.hasMore) {
    await sendButtons(
      to,
      t("chooseQuestion", language),
      result.followUpQuestions.slice(0, 3).map((q, i) => ({ id: `follow:${i}`, title: q.slice(0, 20) })),
    );
  }
}
