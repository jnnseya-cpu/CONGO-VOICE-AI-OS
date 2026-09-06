/**
 * Notification service: persists every notification, then dispatches through the
 * configured channel provider. Default providers log to stdout so the platform
 * works end-to-end without telecom credentials.
 */
import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { env } from "./env";
import type { Role } from "@/lib/db/schema";

export type NotificationChannel = "in_app" | "sms" | "whatsapp" | "email";

export interface NotifyInput {
  userId?: string | null;
  channel?: NotificationChannel;
  type: "escalation" | "reminder" | "follow_up" | "broadcast" | "alert" | "system";
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  to?: string; // phone or email for external channels
}

async function dispatch(channel: NotificationChannel, to: string | undefined, title: string, body: string): Promise<boolean> {
  if (channel === "in_app") return true;
  if (channel === "email") {
    if (env.notifications.emailProvider === "log") {
      console.info(`[notify:email] to=${to ?? env.notifications.adminEmail ?? "-"} ${title}: ${body}`);
      return true;
    }
    return false; // other providers can be added here (SendGrid, SES…)
  }
  // sms / whatsapp
  const provider = channel === "sms" ? env.notifications.smsProvider : env.notifications.whatsappProvider;
  if (provider === "log") {
    console.info(`[notify:${channel}] to=${to ?? "-"} ${title}: ${body}`);
    return true;
  }
  if (provider === "twilio") {
    const { twilioAccountSid, twilioAuthToken, twilioFrom } = env.notifications;
    if (!twilioAccountSid || !twilioAuthToken || !twilioFrom || !to) return false;
    const prefix = channel === "whatsapp" ? "whatsapp:" : "";
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: `${prefix}${twilioFrom}`, To: `${prefix}${to}`, Body: `${title}\n${body}` }),
    });
    return res.ok;
  }
  return false;
}

export async function notify(input: NotifyInput) {
  const db = await getDb();
  const channel = input.channel ?? "in_app";
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: input.userId ?? null,
      channel,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload ?? {},
    })
    .returning();
  let ok = false;
  try {
    ok = await dispatch(channel, input.to, input.title, input.body);
  } catch (err) {
    console.error("[notify] dispatch failed", err);
  }
  await db
    .update(schema.notifications)
    .set({ status: ok ? "sent" : "failed", sentAt: ok ? new Date() : null })
    .where(eq(schema.notifications.id, row.id));
  return { ...row, status: ok ? "sent" : "failed" };
}

/** Notify every active user holding a role (optionally within a province). */
export async function notifyRole(role: Role, input: Omit<NotifyInput, "userId">, province?: string | null) {
  const db = await getDb();
  const where = province
    ? and(eq(schema.users.role, role), eq(schema.users.province, province))
    : eq(schema.users.role, role);
  let recipients = await db.select({ id: schema.users.id, phone: schema.users.phone }).from(schema.users).where(where);
  if (recipients.length === 0 && province) {
    recipients = await db.select({ id: schema.users.id, phone: schema.users.phone }).from(schema.users).where(eq(schema.users.role, role));
  }
  const results = [];
  for (const r of recipients) {
    results.push(await notify({ ...input, userId: r.id, to: r.phone ?? undefined }));
  }
  if (results.length === 0) {
    // Nobody holds this role yet: keep the alert in the shared queue so it is never lost.
    results.push(await notify({ ...input, userId: null, channel: "in_app", payload: { ...(input.payload ?? {}), intendedRole: role, province: province ?? null } }));
  }
  return results;
}
