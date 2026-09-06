/**
 * Outbound SMS client: Africa's Talking, Twilio, or "log" mode when no telecom credential
 * is configured — the platform must stay fully usable offline.
 *
 * Every message is persisted in `notifications` before dispatch, with the provider message
 * id kept so that delivery reports (/api/hooks/sms/dlr) can be matched back to the row.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { LanguageCode } from "@/lib/db/schema";
import { maskMsisdn } from "./whatsapp";

export type SmsMode = "africastalking" | "twilio" | "log";

/** One GSM-7 segment; concatenated parts lose 7 characters to the UDH, and we add "(n/m)". */
const PART_LENGTH = 150;
export const MAX_SMS_PARTS = 3;

export function smsMode(): SmsMode {
  const configured = (process.env.SMS_PROVIDER ?? "log").toLowerCase();
  if (configured === "africastalking" && process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME) return "africastalking";
  if (configured === "twilio" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) return "twilio";
  return "log";
}

/** Splits a reply into at most three concatenated messages (FR-CH-21). */
export function splitSms(text: string, maxParts = MAX_SMS_PARTS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= 160) return [clean];
  const words = clean.split(" ");
  const parts: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > PART_LENGTH) {
      if (current) parts.push(current);
      current = word.length > PART_LENGTH ? word.slice(0, PART_LENGTH) : word;
      if (parts.length === maxParts) break;
    } else {
      current = candidate;
    }
  }
  if (parts.length < maxParts && current) parts.push(current);
  const capped = parts.slice(0, maxParts);
  const total = capped.length;
  if (total === 1) return capped;
  // Mark the last part as truncated when the text did not fit.
  const joinedLength = capped.reduce((n, p) => n + p.length + 1, 0);
  if (joinedLength < clean.length) capped[total - 1] = `${capped[total - 1].replace(/\s+\S*$/, "")}…`;
  return capped.map((p, i) => `${p} (${i + 1}/${total})`);
}

const outboxHolder = globalThis as unknown as { __cvosSmsOutbox?: Array<{ to: string; text: string; at: string }> };
export function smsOutbox() {
  return (outboxHolder.__cvosSmsOutbox ??= []);
}
export function resetSmsOutbox() {
  outboxHolder.__cvosSmsOutbox = [];
}

export interface SendSmsInput {
  to: string;
  text: string;
  userId?: string | null;
  language?: LanguageCode | null;
  type?: "escalation" | "reminder" | "follow_up" | "broadcast" | "alert" | "system";
  title?: string;
  payload?: Record<string, unknown>;
}

export interface SendSmsResult {
  ok: boolean;
  mode: SmsMode;
  parts: string[];
  notificationIds: string[];
  providerMessageIds: string[];
  error?: string;
}

async function dispatchPart(to: string, text: string): Promise<{ ok: boolean; messageId: string | null; error?: string }> {
  const mode = smsMode();
  if (mode === "log") {
    smsOutbox().push({ to, text, at: new Date().toISOString() });
    console.info(`[sms:log] → ${maskMsisdn(to)} ${text}`);
    return { ok: true, messageId: `log-${smsOutbox().length}` };
  }
  try {
    if (mode === "africastalking") {
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          apiKey: process.env.AFRICASTALKING_API_KEY as string,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          username: process.env.AFRICASTALKING_USERNAME as string,
          to,
          message: text,
          ...(process.env.AFRICASTALKING_SENDER ? { from: process.env.AFRICASTALKING_SENDER } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        SMSMessageData?: { Recipients?: Array<{ messageId?: string; status?: string }> };
      };
      const recipient = json.SMSMessageData?.Recipients?.[0];
      const ok = res.ok && (recipient?.status === "Success" || !!recipient?.messageId);
      return { ok, messageId: recipient?.messageId ?? null, error: ok ? undefined : `at_${res.status}` };
    }
    const sid = process.env.TWILIO_ACCOUNT_SID as string;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: process.env.TWILIO_FROM as string, To: to, Body: text }),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    return { ok: res.ok, messageId: json.sid ?? null, error: res.ok ? undefined : json.message ?? `twilio_${res.status}` };
  } catch (err) {
    return { ok: false, messageId: null, error: err instanceof Error ? err.message : "network_error" };
  }
}

/** Sends a reply as at most three SMS, recording one notification row per part. */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const db = await getDb();
  const parts = splitSms(input.text);
  const notificationIds: string[] = [];
  const providerMessageIds: string[] = [];
  let ok = parts.length > 0;
  let error: string | undefined;

  for (const part of parts) {
    const [row] = await db
      .insert(schema.notifications)
      .values({
        userId: input.userId ?? null,
        channel: "sms",
        type: input.type ?? "follow_up",
        title: input.title ?? "CONGO VOICE",
        body: part,
        language: input.language ?? null,
        to: input.to,
        payload: input.payload ?? {},
        attempts: 1,
      })
      .returning();
    notificationIds.push(row.id);
    const sent = await dispatchPart(input.to, part);
    if (sent.messageId) providerMessageIds.push(sent.messageId);
    if (!sent.ok) {
      ok = false;
      error = sent.error;
    }
    await db
      .update(schema.notifications)
      .set({
        status: sent.ok ? "sent" : "failed",
        sentAt: sent.ok ? new Date() : null,
        providerMessageId: sent.messageId,
        failureReason: sent.error?.slice(0, 240) ?? null,
      })
      .where(eq(schema.notifications.id, row.id));
  }

  return { ok, mode: smsMode(), parts, notificationIds, providerMessageIds, error };
}

/** Marks a notification delivered from a provider delivery report. */
export async function recordDeliveryReport(providerMessageId: string, status: string): Promise<boolean> {
  const db = await getDb();
  const delivered = ["success", "delivered", "sent", "dlr_success"].includes(status.toLowerCase());
  const failed = ["failed", "rejected", "undelivered", "expired"].includes(status.toLowerCase());
  const rows = await db
    .update(schema.notifications)
    .set({
      deliveredAt: delivered ? new Date() : null,
      status: delivered ? "sent" : failed ? "failed" : "queued",
      failureReason: failed ? status.slice(0, 240) : null,
    })
    .where(eq(schema.notifications.providerMessageId, providerMessageId))
    .returning();
  return rows.length > 0;
}
