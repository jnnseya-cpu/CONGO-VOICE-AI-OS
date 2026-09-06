/**
 * Channel media helpers: spoken replies and the short-lived signed URLs that let a telephony
 * provider fetch them. Telephony fetches are anonymous, so the URL itself carries an
 * expiring HMAC rather than a session cookie.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode } from "@server/db/schema";
import { env } from "@server/core/env";
import { storeUpload } from "@server/core/storage";
import { aiGateway } from "@server/ai/gateway";

const MEDIA_TTL_MS = 30 * 60 * 1000;

function mediaSecret(): string {
  return env.sessionSecret ?? "cvos-media";
}

export function signMediaToken(fileId: string, expiresAt: number): string {
  const mac = createHmac("sha256", mediaSecret()).update(`${fileId}.${expiresAt}`).digest("base64url");
  return `${expiresAt}.${mac}`;
}

export function verifyMediaToken(fileId: string, token: string | null): boolean {
  if (!token) return false;
  const idx = token.indexOf(".");
  if (idx <= 0) return false;
  const expiresAt = Number(token.slice(0, idx));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signMediaToken(fileId, expiresAt);
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export interface SpokenReply {
  fileId: string;
  mimeType: string;
  audio: Buffer;
  /** Path with an expiring signature; make it absolute with `absoluteUrl()`. */
  path: string;
}

/**
 * Synthesises a reply. Returns null when no text-to-speech provider is configured — the
 * caller then falls back to <Say> (IVR) or text only (WhatsApp).
 */
export async function synthesizeReply(
  text: string,
  language: LanguageCode,
  opts: { userId?: string | null; interactionId?: string | null } = {},
): Promise<SpokenReply | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const speech = await aiGateway().synthesize({ text: trimmed, language }, { interactionId: opts.interactionId ?? null });
  if (!speech) return null;
  const db = await getDb();
  const stored = await storeUpload(speech.audio, speech.mimeType, "tts");
  const [file] = await db
    .insert(schema.files)
    .values({
      userId: opts.userId ?? null,
      interactionId: opts.interactionId ?? null,
      kind: "audio",
      storageKey: stored.key,
      mimeType: speech.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    })
    .returning();
  const token = signMediaToken(file.id, Date.now() + MEDIA_TTL_MS);
  return {
    fileId: file.id,
    mimeType: speech.mimeType,
    audio: speech.audio,
    path: `/api/hooks/ivr/twilio/media/${file.id}?token=${encodeURIComponent(token)}`,
  };
}

/** WhatsApp video limits (FR-CH-11): 30 seconds, 16 MB. */
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

/** Persists an inbound attachment and returns the file row id used by the orchestrator. */
export async function storeInboundMedia(input: {
  userId: string | null;
  data: Buffer;
  mimeType: string;
  prefix?: string;
}): Promise<{ fileId: string; sizeBytes: number }> {
  const db = await getDb();
  const stored = await storeUpload(input.data, input.mimeType, input.prefix ?? "evidence");
  const kind = input.mimeType.startsWith("audio/")
    ? "audio"
    : input.mimeType.startsWith("image/")
      ? "image"
      : input.mimeType.startsWith("video/")
        ? "video"
        : "document";
  const [file] = await db
    .insert(schema.files)
    .values({
      userId: input.userId,
      kind,
      storageKey: stored.key,
      mimeType: input.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    })
    .returning();
  return { fileId: file.id, sizeBytes: stored.sizeBytes };
}

export async function readMediaFile(fileId: string) {
  const db = await getDb();
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, fileId));
  return file ?? null;
}

/** Absolute URL for a provider callback, honouring PUBLIC_BASE_URL behind a proxy. */
export function absoluteUrl(req: Request, path: string): string {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, "")}${path}`;
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  return `${proto}://${host}${path}`;
}
