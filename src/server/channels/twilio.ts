/**
 * Twilio Programmable Voice helpers: request validation and TwiML written by hand
 * (no vendor SDK — the platform must build and run with no telecom dependency).
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { LanguageCode } from "@server/db/schema";
import { sayLanguage } from "./strings";
import { absoluteUrl } from "./media";

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** <Say> with a supported voice locale; the four national languages fall back to French. */
export function say(text: string, language: LanguageCode = "fr"): string {
  return `<Say language="${sayLanguage(language)}">${escapeXml(text)}</Say>`;
}

export function play(url: string): string {
  return `<Play>${escapeXml(url)}</Play>`;
}

/** Plays synthesised audio when it exists, otherwise speaks the text. */
export function speak(text: string, language: LanguageCode, audioUrl?: string | null): string {
  return audioUrl ? play(audioUrl) : say(text, language);
}

export function pause(seconds = 1): string {
  return `<Pause length="${seconds}"/>`;
}

export function redirect(url: string): string {
  return `<Redirect method="POST">${escapeXml(url)}</Redirect>`;
}

export function hangup(): string {
  return "<Hangup/>";
}

export interface GatherOptions {
  action: string;
  numDigits?: number;
  input?: "dtmf" | "speech" | "dtmf speech";
  timeout?: number;
  speechTimeout?: string;
  language?: LanguageCode;
  hints?: string;
}

export function gather(opts: GatherOptions, children: string): string {
  const attrs = [
    `input="${opts.input ?? "dtmf speech"}"`,
    `action="${escapeXml(opts.action)}"`,
    'method="POST"',
    `timeout="${opts.timeout ?? 5}"`,
    `language="${sayLanguage(opts.language ?? "fr")}"`,
    opts.numDigits ? `numDigits="${opts.numDigits}"` : "",
    opts.speechTimeout ? `speechTimeout="${opts.speechTimeout}"` : "",
    opts.hints ? `hints="${escapeXml(opts.hints)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<Gather ${attrs}>${children}</Gather>`;
}

export interface RecordOptions {
  action: string;
  maxLength?: number;
  /** Seconds of silence that end the utterance. */
  timeout?: number;
  finishOnKey?: string;
  playBeep?: boolean;
  transcribe?: boolean;
}

/** <Record> with silence-based end of utterance. */
export function record(opts: RecordOptions): string {
  const attrs = [
    `action="${escapeXml(opts.action)}"`,
    'method="POST"',
    `maxLength="${opts.maxLength ?? 45}"`,
    `timeout="${opts.timeout ?? 3}"`,
    `finishOnKey="${opts.finishOnKey ?? "#"}"`,
    `playBeep="${opts.playBeep === false ? "false" : "true"}"`,
    'trim="trim-silence"',
    opts.transcribe ? 'transcribe="true"' : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<Record ${attrs}/>`;
}

/**
 * X-Twilio-Signature validation: HMAC-SHA1 over the full URL followed by the POST
 * parameters sorted by name. Skipped (returns true) when no auth token is configured,
 * so the adapter still works in offline development.
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, header: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true;
  if (!header) return false;
  let payload = url;
  for (const key of Object.keys(params).sort()) payload += key + params[key];
  const expected = createHmac("sha1", token).update(Buffer.from(payload, "utf8")).digest("base64");
  if (expected.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

/** Reads a Twilio webhook body and validates its signature in one step. */
export async function readTwilioRequest(
  req: Request,
  path: string,
): Promise<{ params: Record<string, string>; valid: boolean; url: string }> {
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  const url = absoluteUrl(req, path);
  return { params, url, valid: validateTwilioSignature(url, params, req.headers.get("x-twilio-signature")) };
}

/** Downloads a Twilio recording (needs the account credentials; null in offline mode). */
export async function fetchRecording(recordingUrl: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.info("[ivr:log] recording download skipped (offline mode)");
    return null;
  }
  try {
    const res = await fetch(`${recordingUrl}.mp3`, {
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
    });
    if (!res.ok) return null;
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg" };
  } catch (err) {
    console.error("[ivr] recording download failed", err);
    return null;
  }
}
