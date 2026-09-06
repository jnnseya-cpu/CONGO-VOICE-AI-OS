/**
 * WhatsApp Cloud API client (Meta Graph).
 *
 * Without `WHATSAPP_ACCESS_TOKEN` the client runs in "log" mode: every outbound message is
 * recorded in an in-process outbox and printed, so the whole channel works offline and in
 * tests exactly as it does in production.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { LanguageCode } from "@server/db/schema";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
const GRAPH_BASE = process.env.WHATSAPP_GRAPH_BASE ?? "https://graph.facebook.com";

/** WhatsApp only allows free-form replies inside 24 h of the last inbound message (FR-CH-13). */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WhatsappMode = "graph" | "log";

export function whatsappMode(): WhatsappMode {
  return process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "graph" : "log";
}

export interface OutboxEntry {
  to: string;
  kind: "text" | "audio" | "image" | "buttons" | "list" | "template";
  body?: string;
  buttons?: Array<{ id: string; title: string }>;
  rows?: Array<{ id: string; title: string; description?: string }>;
  templateName?: string;
  language?: LanguageCode;
  bytes?: number;
  at: string;
}

/** In-memory outbox used by log mode (development, offline deployments, tests). */
const outboxHolder = globalThis as unknown as { __cvosWhatsappOutbox?: OutboxEntry[] };
export function whatsappOutbox(): OutboxEntry[] {
  return (outboxHolder.__cvosWhatsappOutbox ??= []);
}
export function resetWhatsappOutbox(): void {
  outboxHolder.__cvosWhatsappOutbox = [];
}

function record(entry: Omit<OutboxEntry, "at">): { ok: true; messageId: string; mode: WhatsappMode } {
  const full: OutboxEntry = { ...entry, at: new Date().toISOString() };
  whatsappOutbox().push(full);
  console.info(`[whatsapp:log] ${entry.kind} → ${maskMsisdn(entry.to)} ${entry.body ? entry.body.slice(0, 120) : ""}`);
  return { ok: true, messageId: `log-${whatsappOutbox().length}`, mode: "log" };
}

export function maskMsisdn(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : "••••";
}

export interface SendResult {
  ok: boolean;
  messageId: string | null;
  mode: WhatsappMode;
  error?: string;
}

async function graph(path: string, body: unknown): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, messageId: null, mode: "log", error: "not_configured" };
  try {
    const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${phoneId}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!res.ok) return { ok: false, messageId: null, mode: "graph", error: json.error?.message ?? `http_${res.status}` };
    return { ok: true, messageId: json.messages?.[0]?.id ?? null, mode: "graph" };
  } catch (err) {
    return { ok: false, messageId: null, mode: "graph", error: err instanceof Error ? err.message : "network_error" };
  }
}

export async function sendText(to: string, text: string, previewUrl = false): Promise<SendResult> {
  if (whatsappMode() === "log") return record({ to, kind: "text", body: text });
  return graph("messages", {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text.slice(0, 4096), preview_url: previewUrl },
  });
}

/** Interactive reply buttons — WhatsApp allows at most three (FR-CH-12). */
export async function sendButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<SendResult> {
  const trimmed = buttons.slice(0, 3).map((b) => ({ id: b.id.slice(0, 256), title: b.title.slice(0, 20) }));
  if (whatsappMode() === "log") return record({ to, kind: "buttons", body, buttons: trimmed });
  return graph("messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: { buttons: trimmed.map((b) => ({ type: "reply", reply: b })) },
    },
  });
}

/** Interactive list — at most ten rows (FR-CH-12). */
export async function sendList(
  to: string,
  body: string,
  buttonLabel: string,
  rows: Array<{ id: string; title: string; description?: string }>,
  sectionTitle = "Options",
): Promise<SendResult> {
  const trimmed = rows.slice(0, 10).map((r) => ({
    id: r.id.slice(0, 200),
    title: r.title.slice(0, 24),
    description: r.description?.slice(0, 72),
  }));
  if (whatsappMode() === "log") return record({ to, kind: "list", body, rows: trimmed });
  return graph("messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: { button: buttonLabel.slice(0, 20), sections: [{ title: sectionTitle.slice(0, 24), rows: trimmed }] },
    },
  });
}

/** Uploads audio to the media endpoint and sends it as a voice note (FR-CH-10). */
export async function sendVoiceNote(to: string, audio: Buffer, mimeType = "audio/ogg"): Promise<SendResult> {
  if (whatsappMode() === "log") return record({ to, kind: "audio", bytes: audio.length });
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, messageId: null, mode: "log", error: "not_configured" };
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), "reply.ogg");
    const upload = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${phoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const uploaded = (await upload.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!upload.ok || !uploaded.id) {
      return { ok: false, messageId: null, mode: "graph", error: uploaded.error?.message ?? `upload_http_${upload.status}` };
    }
    return graph("messages", { messaging_product: "whatsapp", to, type: "audio", audio: { id: uploaded.id, voice: true } });
  } catch (err) {
    return { ok: false, messageId: null, mode: "graph", error: err instanceof Error ? err.message : "network_error" };
  }
}

/**
 * Template message — the only thing allowed outside the 24 h window, so every proactive
 * follow-up (reminder, case update) goes through here (FR-CH-13).
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  language: LanguageCode,
  parameters: string[] = [],
): Promise<SendResult> {
  if (whatsappMode() === "log") {
    return record({ to, kind: "template", templateName, language, body: parameters.join(" | ") });
  }
  return graph("messages", {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguageCode(language) },
      components: parameters.length
        ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  });
}

/** WhatsApp template locales: the four national languages fall back to French. */
export function templateLanguageCode(language: LanguageCode): string {
  return language === "sw" ? "sw" : "fr";
}

export function isWithinServiceWindow(lastInboundAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const ts = typeof lastInboundAt === "string" ? Date.parse(lastInboundAt) : lastInboundAt.getTime();
  return Number.isFinite(ts) && now - ts < WHATSAPP_WINDOW_MS;
}

/**
 * Sends a free-form message inside the 24 h window, and a template outside it (FR-CH-13).
 */
export async function sendWithinWindow(input: {
  to: string;
  text: string;
  lastInboundAt: string | Date | null | undefined;
  templateName?: string;
  language?: LanguageCode;
  templateParameters?: string[];
}): Promise<SendResult & { usedTemplate: boolean }> {
  if (isWithinServiceWindow(input.lastInboundAt)) {
    const res = await sendText(input.to, input.text);
    return { ...res, usedTemplate: false };
  }
  const res = await sendTemplate(
    input.to,
    input.templateName ?? (process.env.WHATSAPP_FOLLOW_UP_TEMPLATE || "cvos_follow_up"),
    input.language ?? "fr",
    input.templateParameters ?? [input.text.slice(0, 500)],
  );
  return { ...res, usedTemplate: true };
}

export interface DownloadedMedia {
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
}

/** Two-step Graph download: media id → signed URL → bytes. */
export async function downloadMedia(mediaId: string, maxBytes = 16 * 1024 * 1024): Promise<DownloadedMedia | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    console.info(`[whatsapp:log] media download skipped (offline mode) id=${mediaId}`);
    return null;
  }
  try {
    const metaRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) return null;
    if (meta.file_size && meta.file_size > maxBytes) return null;
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) return null;
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (buf.length > maxBytes) return null;
    return { data: buf, mimeType: (meta.mime_type ?? "application/octet-stream").split(";")[0], sizeBytes: buf.length };
  } catch (err) {
    console.error("[whatsapp] media download failed", err);
    return null;
  }
}

/** X-Hub-Signature-256 check. Returns true when no app secret is configured (offline mode). */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function verifyWebhookChallenge(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) return challenge;
  return null;
}

/* ───────────────────────── inbound payload parsing ───────────────────────── */

export interface InboundWhatsappMessage {
  messageId: string;
  from: string;
  timestamp: number;
  type: "text" | "audio" | "image" | "video" | "interactive" | "button" | "location" | "unsupported";
  text?: string;
  mediaId?: string;
  mimeType?: string;
  /** id of the button or list row the citizen tapped. */
  replyId?: string;
  replyTitle?: string;
  location?: { latitude: number; longitude: number };
  profileName?: string;
}

export interface InboundStatus {
  messageId: string;
  status: string;
  recipient: string;
  timestamp: number;
}

interface GraphValue {
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<Record<string, unknown>>;
}

export function parseInbound(payload: unknown): { messages: InboundWhatsappMessage[]; statuses: InboundStatus[] } {
  const messages: InboundWhatsappMessage[] = [];
  const statuses: InboundStatus[] = [];
  const root = payload as { entry?: Array<{ changes?: Array<{ value?: GraphValue }> }> } | null;
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const profileName = value.contacts?.[0]?.profile?.name;
      for (const raw of value.messages ?? []) {
        const m = raw as {
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string; mime_type?: string };
          image?: { id?: string; mime_type?: string; caption?: string };
          video?: { id?: string; mime_type?: string; caption?: string };
          location?: { latitude?: number; longitude?: number };
          button?: { text?: string; payload?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        };
        const base = {
          messageId: m.id ?? "",
          from: m.from ?? "",
          timestamp: Number(m.timestamp ?? 0) * 1000 || Date.now(),
          profileName,
        };
        switch (m.type) {
          case "text":
            messages.push({ ...base, type: "text", text: m.text?.body ?? "" });
            break;
          case "audio":
            messages.push({ ...base, type: "audio", mediaId: m.audio?.id, mimeType: m.audio?.mime_type });
            break;
          case "image":
            messages.push({ ...base, type: "image", mediaId: m.image?.id, mimeType: m.image?.mime_type, text: m.image?.caption });
            break;
          case "video":
            messages.push({ ...base, type: "video", mediaId: m.video?.id, mimeType: m.video?.mime_type, text: m.video?.caption });
            break;
          case "location":
            messages.push({
              ...base,
              type: "location",
              location: { latitude: m.location?.latitude ?? 0, longitude: m.location?.longitude ?? 0 },
            });
            break;
          case "button":
            messages.push({ ...base, type: "button", replyId: m.button?.payload, replyTitle: m.button?.text, text: m.button?.text });
            break;
          case "interactive": {
            const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
            messages.push({ ...base, type: "interactive", replyId: reply?.id, replyTitle: reply?.title, text: reply?.title });
            break;
          }
          default:
            messages.push({ ...base, type: "unsupported" });
        }
      }
      for (const raw of value.statuses ?? []) {
        const s = raw as { id?: string; status?: string; recipient_id?: string; timestamp?: string };
        statuses.push({
          messageId: s.id ?? "",
          status: s.status ?? "unknown",
          recipient: s.recipient_id ?? "",
          timestamp: Number(s.timestamp ?? 0) * 1000 || Date.now(),
        });
      }
    }
  }
  return { messages, statuses };
}
