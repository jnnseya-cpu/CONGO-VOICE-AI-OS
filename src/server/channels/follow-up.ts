/**
 * Proactive outbound messages (reminders, case updates, "we called and missed you").
 *
 * WhatsApp only allows free-form messages inside 24 hours of the citizen's last inbound
 * message; outside that window a pre-approved template is the only way to reach them
 * (FR-CH-13). SMS is the fallback for a citizen we have never met on WhatsApp.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode } from "@server/db/schema";
import { readState } from "./session";
import { sendSms } from "./sms";
import { isWithinServiceWindow, sendWithinWindow } from "./whatsapp";

export interface FollowUpInput {
  userId: string;
  text: string;
  language?: LanguageCode | null;
  /** Approved WhatsApp template used outside the 24 h window. */
  templateName?: string;
  templateParameters?: string[];
  type?: "escalation" | "reminder" | "follow_up" | "broadcast" | "alert" | "system";
  title?: string;
  payload?: Record<string, unknown>;
}

export interface FollowUpResult {
  channel: "whatsapp" | "sms" | "none";
  ok: boolean;
  usedTemplate: boolean;
  reason?: string;
}

/** Sends a proactive message on the best channel the citizen has actually used. */
export async function sendFollowUp(input: FollowUpInput): Promise<FollowUpResult> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId));
  if (!user?.phone) return { channel: "none", ok: false, usedTemplate: false, reason: "no_reachable_address" };
  if (user.consentStatus === "revoked") return { channel: "none", ok: false, usedTemplate: false, reason: "opted_out" };

  const language = input.language ?? user.languagePreference ?? "fr";
  const [whatsappSession] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.channel, "whatsapp")))
    .orderBy(desc(schema.sessions.startedAt))
    .limit(1);

  if (whatsappSession) {
    const lastInboundAt = readState(whatsappSession).lastInboundAt ?? null;
    const to = user.phone.replace(/^\+/, "");
    const res = await sendWithinWindow({
      to,
      text: input.text,
      lastInboundAt,
      templateName: input.templateName,
      language,
      templateParameters: input.templateParameters,
    });
    await db.insert(schema.notifications).values({
      userId: user.id,
      channel: "whatsapp",
      type: input.type ?? "follow_up",
      title: input.title ?? "CONGO VOICE",
      body: input.text,
      language,
      to: user.phone,
      status: res.ok ? "sent" : "failed",
      sentAt: res.ok ? new Date() : null,
      providerMessageId: res.messageId,
      templateKey: res.usedTemplate ? input.templateName ?? "cvos_follow_up" : null,
      attempts: 1,
      payload: { ...(input.payload ?? {}), window: isWithinServiceWindow(lastInboundAt) ? "open" : "closed" },
    });
    if (res.ok) return { channel: "whatsapp", ok: true, usedTemplate: res.usedTemplate };
  }

  const sms = await sendSms({
    to: user.phone,
    text: input.text,
    userId: user.id,
    language,
    type: input.type ?? "follow_up",
    title: input.title,
    payload: input.payload,
  });
  return { channel: "sms", ok: sms.ok, usedTemplate: false, reason: sms.error };
}
