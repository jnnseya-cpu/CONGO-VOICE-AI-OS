/**
 * Notification service — templates, delivery policy and providers.
 *
 * Every message is persisted first, then dispatched: nothing is ever "sent" without a row
 * that records attempts, provider message id, delivery time and failure reason.
 *
 * Delivery policy (PRD):
 *  · template catalogue in the five national languages (notification_templates);
 *  · privacy-safe wording for sensitive subjects (lock-screen safe);
 *  · quiet hours 21:00–06:00 Africa/Kinshasa — deferred, except emergencies;
 *  · frequency cap: at most 3 non-emergency messages per citizen per rolling week;
 *  · channel fallback WhatsApp → SMS → voice (outbound IVR), each attempt recorded;
 *  · retries with exponential backoff inside a channel;
 *  · urgent alerts require an explicit acknowledgement (sent ≠ acknowledged);
 *  · opt-out and consent (purpose "reminders") are enforced for reminders and broadcasts.
 *
 * Providers: Africa's Talking, Twilio, and a log provider so the whole platform runs offline.
 */
import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { env } from "./env";
import { emitEvent } from "./events";
import { safeLog, maskPhone } from "./redact";
import { NOTIFICATION_TEMPLATES } from "@/lib/db/reference/notification-templates";
import type { LanguageCode, Role } from "@/lib/db/schema";

export type NotificationChannel = "in_app" | "sms" | "whatsapp" | "email";
/** Physical delivery channels: the enum above plus the outbound IVR fallback. */
export type DeliveryChannel = NotificationChannel | "voice";

export type NotificationType =
  | "escalation"
  | "reminder"
  | "follow_up"
  | "broadcast"
  | "alert"
  | "system"
  | "emergency"
  | "report";

export interface NotifyInput {
  userId?: string | null;
  channel?: NotificationChannel;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  to?: string; // phone or email for external channels
  /** Template that produced the text (kept for audit and for re-rendering). */
  templateKey?: string;
  language?: LanguageCode;
  /** Emergencies bypass quiet hours and the frequency cap. */
  emergency?: boolean;
  /** Urgent alerts are not "done" until a human acknowledges them. */
  requiresAck?: boolean;
  /** Health / safeguarding subjects: only the lock-screen safe wording leaves the platform. */
  sensitive?: boolean;
  tenantId?: string | null;
  caseId?: string | null;
  /** Deliver later (quiet hours, scheduled reminder). */
  scheduledFor?: Date | null;
  /** Suppress an identical message within the dedupe window. */
  dedupeKey?: string;
  /** Skip the channel fallback chain (used by broadcasts on a single channel). */
  noFallback?: boolean;
}

/* ------------------------------------------------------------------------------------------
 * Policy configuration
 * ---------------------------------------------------------------------------------------- */

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const NOTIFICATION_POLICY = {
  /** Africa/Kinshasa is UTC+1 all year (no daylight saving). */
  timezoneOffsetHours: num("NOTIFY_TZ_OFFSET_HOURS", 1),
  quietHourStart: num("NOTIFY_QUIET_START_HOUR", 21),
  quietHourEnd: num("NOTIFY_QUIET_END_HOUR", 6),
  /** Non-emergency messages per citizen per rolling 7 days. */
  weeklyCap: num("NOTIFY_WEEKLY_CAP", 3),
  /** Attempts per channel before falling back to the next one. */
  attemptsPerChannel: num("NOTIFY_RETRY_ATTEMPTS", 2),
  backoffMs: num("NOTIFY_RETRY_BACKOFF_MS", env.isTest ? 0 : 750),
  dedupeWindowHours: num("NOTIFY_DEDUPE_WINDOW_HOURS", 24),
} as const;

const EXTERNAL: DeliveryChannel[] = ["sms", "whatsapp", "voice", "email"];
const NON_EMERGENCY_TYPES: NotificationType[] = ["reminder", "follow_up", "broadcast", "report", "system"];
/** Types that require the citizen to have granted the "reminders" purpose. */
const CONSENT_REQUIRED_TYPES: NotificationType[] = ["reminder", "broadcast"];

/** Local (Africa/Kinshasa) hour for an instant. */
export function localHour(at: Date): number {
  return (at.getUTCHours() + NOTIFICATION_POLICY.timezoneOffsetHours + 24) % 24;
}

export function isQuietHours(at: Date = new Date()): boolean {
  const h = localHour(at);
  const { quietHourStart: s, quietHourEnd: e } = NOTIFICATION_POLICY;
  return s > e ? h >= s || h < e : h >= s && h < e;
}

/** Next instant at which a deferred message may be delivered. */
export function nextDeliveryWindow(at: Date = new Date()): Date {
  if (!isQuietHours(at)) return at;
  const offset = NOTIFICATION_POLICY.timezoneOffsetHours * 3600 * 1000;
  const local = new Date(at.getTime() + offset);
  const target = new Date(local);
  target.setUTCHours(NOTIFICATION_POLICY.quietHourEnd, 0, 0, 0);
  if (target.getTime() <= local.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - offset);
}

/* ------------------------------------------------------------------------------------------
 * Templates
 * ---------------------------------------------------------------------------------------- */

export interface RenderedTemplate {
  key: string;
  title: string;
  body: string;
  language: LanguageCode;
  sensitivity: "normal" | "sensitive";
}

function fill(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  }).replace(/\s{2,}/g, " ").trim();
}

/**
 * Render a template: the approved database row wins; the reference catalogue is the
 * fallback so the platform works before (or without) seeding.
 */
export async function renderTemplate(
  key: string,
  language: LanguageCode = "fr",
  vars: Record<string, unknown> = {},
  channel?: NotificationChannel,
): Promise<RenderedTemplate | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.notificationTemplates)
    .where(and(eq(schema.notificationTemplates.key, key), inArray(schema.notificationTemplates.status, ["approved", "active"])));
  const pick =
    rows.find((r) => r.language === language && (!channel || r.channel === channel)) ??
    rows.find((r) => r.language === language) ??
    rows.find((r) => r.language === "fr") ??
    null;
  if (pick) {
    return { key, title: fill(pick.title ?? "", vars), body: fill(pick.body, vars), language: pick.language, sensitivity: pick.sensitivity === "sensitive" ? "sensitive" : "normal" };
  }
  const def = NOTIFICATION_TEMPLATES.find((t) => t.key === key);
  if (!def) return null;
  const text = def.text[language] ?? def.text.fr;
  return { key, title: fill(text.title, vars), body: fill(text.body, vars), language, sensitivity: def.sensitivity };
}

/** Lock-screen safe variant used whenever a sensitive message leaves the platform. */
async function privacySafe(language: LanguageCode): Promise<{ title: string; body: string }> {
  const t = await renderTemplate("sensitive.generic", language);
  return t ? { title: t.title, body: t.body } : { title: "Message en attente", body: "Vous avez un nouveau message de CONGO VOICE AI OS." };
}

/* ------------------------------------------------------------------------------------------
 * Providers
 * ---------------------------------------------------------------------------------------- */

export interface DispatchResult {
  ok: boolean;
  providerMessageId?: string | null;
  failureReason?: string | null;
  provider: string;
}

async function sendSms(to: string, text: string): Promise<DispatchResult> {
  const provider = env.notifications.smsProvider;
  if (provider === "africastalking") {
    const username = process.env.AFRICASTALKING_USERNAME;
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    const from = process.env.AFRICASTALKING_SENDER;
    if (!username || !apiKey) return { ok: false, failureReason: "africastalking_not_configured", provider };
    try {
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ username, to, message: text, ...(from ? { from } : {}) }),
      });
      if (!res.ok) return { ok: false, failureReason: `africastalking_http_${res.status}`, provider };
      const json = (await res.json()) as { SMSMessageData?: { Recipients?: Array<{ messageId?: string; status?: string }> } };
      const r = json.SMSMessageData?.Recipients?.[0];
      const accepted = !r?.status || /success|sent/i.test(r.status);
      return { ok: accepted, providerMessageId: r?.messageId ?? null, failureReason: accepted ? null : (r?.status ?? "rejected"), provider };
    } catch (err) {
      return { ok: false, failureReason: errMessage(err), provider };
    }
  }
  if (provider === "twilio") return twilio(to, text, "sms");
  safeLog.info("notify:sms", `to=${maskPhone(to)} ${text.slice(0, 120)}`);
  return { ok: true, providerMessageId: `log-${Date.now()}`, provider: "log" };
}

async function sendWhatsapp(to: string, text: string): Promise<DispatchResult> {
  const provider = env.notifications.whatsappProvider;
  if (provider === "twilio") return twilio(to, text, "whatsapp");
  if (provider === "meta") {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return { ok: false, failureReason: "whatsapp_not_configured", provider };
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      });
      if (!res.ok) return { ok: false, failureReason: `whatsapp_http_${res.status}`, provider };
      const json = (await res.json()) as { messages?: Array<{ id?: string }> };
      return { ok: true, providerMessageId: json.messages?.[0]?.id ?? null, provider };
    } catch (err) {
      return { ok: false, failureReason: errMessage(err), provider };
    }
  }
  safeLog.info("notify:whatsapp", `to=${maskPhone(to)} ${text.slice(0, 120)}`);
  return { ok: true, providerMessageId: `log-${Date.now()}`, provider: "log" };
}

async function twilio(to: string, text: string, kind: "sms" | "whatsapp"): Promise<DispatchResult> {
  const { twilioAccountSid, twilioAuthToken, twilioFrom } = env.notifications;
  if (!twilioAccountSid || !twilioAuthToken || !twilioFrom) return { ok: false, failureReason: "twilio_not_configured", provider: "twilio" };
  const prefix = kind === "whatsapp" ? "whatsapp:" : "";
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: `${prefix}${twilioFrom}`, To: `${prefix}${to}`, Body: text }),
    });
    if (!res.ok) return { ok: false, failureReason: `twilio_http_${res.status}`, provider: "twilio" };
    const json = (await res.json()) as { sid?: string };
    return { ok: true, providerMessageId: json.sid ?? null, provider: "twilio" };
  } catch (err) {
    return { ok: false, failureReason: errMessage(err), provider: "twilio" };
  }
}

/** Outbound IVR: the last resort for citizens without SMS or data. Stub in log mode. */
async function sendVoice(to: string, text: string): Promise<DispatchResult> {
  const provider = process.env.VOICE_PROVIDER ?? "log";
  if (provider === "log") {
    safeLog.info("notify:voice", `ivr_outbound to=${maskPhone(to)} ${text.slice(0, 120)}`);
    return { ok: true, providerMessageId: `ivr-${Date.now()}`, provider: "log" };
  }
  return { ok: false, failureReason: "voice_provider_not_configured", provider };
}

async function sendEmail(to: string | undefined, title: string, body: string): Promise<DispatchResult> {
  const target = to ?? env.notifications.adminEmail;
  if (env.notifications.emailProvider === "log") {
    safeLog.info("notify:email", `to=${target ?? "-"} ${title}: ${body.slice(0, 160)}`);
    return { ok: true, providerMessageId: `log-${Date.now()}`, provider: "log" };
  }
  return { ok: false, failureReason: "email_provider_not_configured", provider: env.notifications.emailProvider };
}

async function dispatchOnce(channel: DeliveryChannel, to: string | undefined, title: string, body: string): Promise<DispatchResult> {
  if (channel === "in_app") return { ok: true, provider: "in_app" };
  if (channel === "email") return sendEmail(to, title, body);
  if (!to) return { ok: false, failureReason: "no_destination", provider: channel };
  const text = title ? `${title}\n${body}` : body;
  if (channel === "sms") return sendSms(to, text);
  if (channel === "whatsapp") return sendWhatsapp(to, text);
  return sendVoice(to, text);
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** WhatsApp → SMS → voice; e-mail and in-app have no fallback. */
export function fallbackChain(channel: NotificationChannel): DeliveryChannel[] {
  if (channel === "whatsapp") return ["whatsapp", "sms", "voice"];
  if (channel === "sms") return ["sms", "voice"];
  return [channel];
}

export interface DeliveryOutcome {
  ok: boolean;
  attempts: number;
  channelUsed: DeliveryChannel | null;
  providerMessageId: string | null;
  failureReason: string | null;
  trail: Array<{ channel: DeliveryChannel; attempt: number; ok: boolean; provider: string; failureReason?: string | null }>;
}

/** Try each channel of the chain `attemptsPerChannel` times with exponential backoff. */
export async function deliverWithFallback(
  channel: NotificationChannel,
  to: string | undefined,
  title: string,
  body: string,
  opts: { noFallback?: boolean } = {},
): Promise<DeliveryOutcome> {
  const chain = opts.noFallback ? [channel as DeliveryChannel] : fallbackChain(channel);
  const trail: DeliveryOutcome["trail"] = [];
  let attempts = 0;
  let lastFailure: string | null = null;
  for (const ch of chain) {
    for (let attempt = 1; attempt <= NOTIFICATION_POLICY.attemptsPerChannel; attempt++) {
      attempts++;
      const res = await dispatchOnce(ch, to, title, body);
      trail.push({ channel: ch, attempt, ok: res.ok, provider: res.provider, failureReason: res.failureReason ?? null });
      if (res.ok) return { ok: true, attempts, channelUsed: ch, providerMessageId: res.providerMessageId ?? null, failureReason: null, trail };
      lastFailure = res.failureReason ?? "dispatch_failed";
      // A configuration error will not fix itself: move on to the next channel immediately.
      if (res.failureReason?.endsWith("not_configured") || res.failureReason === "no_destination") break;
      await sleep(NOTIFICATION_POLICY.backoffMs * attempt);
    }
  }
  return { ok: false, attempts, channelUsed: null, providerMessageId: null, failureReason: lastFailure, trail };
}

/* ------------------------------------------------------------------------------------------
 * Consent, opt-out and frequency cap
 * ---------------------------------------------------------------------------------------- */

/** Latest decision for the "reminders" purpose. Absent = not granted. */
export async function hasReminderConsent(userId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ status: schema.consents.status })
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, userId), eq(schema.consents.purpose, "reminders")))
    .orderBy(desc(schema.consents.occurredAt))
    .limit(1);
  return row?.status === "granted";
}

/** Citizens can stop all non-essential messages (STOP keyword, IVR menu, worker-assisted). */
export function isOptedOut(preferences: Record<string, unknown> | null | undefined): boolean {
  const p = preferences ?? {};
  return p.optOut === true || p.notificationsOptOut === true;
}

async function weeklyCount(userId: string, since: Date): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        gte(schema.notifications.createdAt, since),
        inArray(schema.notifications.type, NON_EMERGENCY_TYPES),
        inArray(schema.notifications.status, ["sent", "read"]),
      ),
    );
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------------------------------
 * notify()
 * ---------------------------------------------------------------------------------------- */

export type NotifyResult = typeof schema.notifications.$inferSelect & { suppressed?: string | null; deferred?: boolean };

/**
 * Persist and deliver one notification, applying the whole delivery policy.
 * The signature of the original service is preserved: `notify({ type, title, body, … })`.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const db = await getDb();
  const channel = input.channel ?? "in_app";
  const emergency = input.emergency ?? input.type === "emergency";
  const now = new Date();

  // Recipient profile: language, destination, consent and opt-out.
  let language = input.language ?? "fr";
  let to = input.to;
  let recipientRole: Role | null = null;
  let preferences: Record<string, unknown> = {};
  if (input.userId) {
    const [u] = await db
      .select({ phone: schema.users.phone, language: schema.users.languagePreference, role: schema.users.role, preferences: schema.users.preferences, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId));
    if (u) {
      language = input.language ?? u.language;
      to = to ?? u.phone ?? undefined;
      recipientRole = u.role;
      preferences = u.preferences ?? {};
      if (u.status !== "active") return persistSuppressed(input, channel, language, "recipient_inactive");
    }
  }

  // 1. Duplicate suppression.
  if (input.dedupeKey) {
    const since = new Date(now.getTime() - NOTIFICATION_POLICY.dedupeWindowHours * 3600 * 1000);
    const [dupe] = await db
      .select()
      .from(schema.notifications)
      .where(and(gte(schema.notifications.createdAt, since), sql`${schema.notifications.payload}->>'dedupeKey' = ${input.dedupeKey}`))
      .limit(1);
    if (dupe) return { ...dupe, suppressed: "duplicate" };
  }

  // 2. Consent and opt-out (never applied to emergencies or to worker alerts).
  const isCitizen = recipientRole === null || recipientRole === "citizen";
  if (!emergency && isCitizen && input.userId && CONSENT_REQUIRED_TYPES.includes(input.type)) {
    if (isOptedOut(preferences)) return persistSuppressed(input, channel, language, "opted_out");
    if (!(await hasReminderConsent(input.userId))) return persistSuppressed(input, channel, language, "no_consent");
  }

  // 3. Frequency cap.
  if (!emergency && isCitizen && input.userId && NON_EMERGENCY_TYPES.includes(input.type)) {
    const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    if ((await weeklyCount(input.userId, since)) >= NOTIFICATION_POLICY.weeklyCap) {
      return persistSuppressed(input, channel, language, "frequency_cap");
    }
  }

  // 4. Quiet hours (external channels only; in-app is silent by nature).
  let scheduledFor = input.scheduledFor ?? null;
  const external = EXTERNAL.includes(channel);
  if (!emergency && external && !scheduledFor && isQuietHours(now)) scheduledFor = nextDeliveryWindow(now);

  // 5. Wording: a sensitive subject only leaves the platform in its lock-screen safe form.
  let title = input.title;
  let body = input.body;
  if (input.sensitive && external) {
    const safe = await privacySafe(language);
    title = safe.title;
    body = safe.body;
  }

  const payload: Record<string, unknown> = {
    ...(input.payload ?? {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.caseId ? { caseId: input.caseId } : {}),
    ...(input.requiresAck ? { requiresAck: true } : {}),
    ...(input.sensitive ? { sensitive: true } : {}),
    ...(emergency ? { emergency: true } : {}),
    ...(input.sensitive && external ? { fullBodyWithheld: true } : {}),
  };

  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: input.userId ?? null,
      channel,
      type: input.type,
      title: title.slice(0, 240),
      body,
      status: "queued",
      payload,
      templateKey: input.templateKey ?? null,
      language,
      tenantId: input.tenantId ?? null,
      to: to ?? null,
      scheduledFor,
    })
    .returning();

  await emitEvent({
    type: "notification.queued",
    aggregateType: "notification",
    aggregateId: row.id,
    tenantId: input.tenantId ?? null,
    language,
    classification: input.sensitive ? "sensitive" : "internal",
    payload: { type: input.type, channel, templateKey: input.templateKey ?? null, scheduledFor: scheduledFor?.toISOString() ?? null },
  });

  if (scheduledFor && scheduledFor.getTime() > now.getTime()) {
    return { ...row, deferred: true };
  }
  return sendQueued(row.id);
}

async function persistSuppressed(input: NotifyInput, channel: NotificationChannel, language: LanguageCode, reason: string): Promise<NotifyResult> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: input.userId ?? null,
      channel,
      type: input.type,
      title: input.title.slice(0, 240),
      body: input.body,
      status: "failed",
      payload: { ...(input.payload ?? {}), suppressed: reason, ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}) },
      templateKey: input.templateKey ?? null,
      language,
      tenantId: input.tenantId ?? null,
      failureReason: reason,
    })
    .returning();
  await emitEvent({ type: "notification.suppressed", aggregateType: "notification", aggregateId: row.id, payload: { reason, type: input.type } });
  return { ...row, suppressed: reason };
}

/** Deliver a persisted notification (new, deferred or retried) and record the outcome. */
export async function sendQueued(notificationId: string): Promise<NotifyResult> {
  const db = await getDb();
  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
  if (!row) throw new Error("notification not found");
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const outcome = await deliverWithFallback(row.channel, row.to ?? undefined, row.title, row.body, { noFallback: payload.noFallback === true });
  const now = new Date();
  const requiresAck = payload.requiresAck === true;
  const [updated] = await db
    .update(schema.notifications)
    .set({
      status: outcome.ok ? "sent" : "failed",
      sentAt: outcome.ok ? now : row.sentAt,
      // Delivery is a provider fact; acknowledgement is a human act — they are never the same.
      deliveredAt: outcome.ok ? now : null,
      attempts: row.attempts + outcome.attempts,
      providerMessageId: outcome.providerMessageId,
      failureReason: outcome.failureReason,
      payload: { ...payload, delivery: outcome.trail, channelUsed: outcome.channelUsed },
    })
    .where(eq(schema.notifications.id, row.id))
    .returning();
  await emitEvent({
    type: outcome.ok ? "notification.sent" : "notification.failed",
    aggregateType: "notification",
    aggregateId: row.id,
    tenantId: row.tenantId,
    language: row.language,
    payload: { channel: row.channel, channelUsed: outcome.channelUsed, attempts: outcome.attempts, failureReason: outcome.failureReason, requiresAck },
  });
  return updated;
}

/** Human acknowledgement of an urgent alert. */
export async function acknowledgeNotification(notificationId: string, userId: string): Promise<NotifyResult | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
  if (!row) return null;
  if (row.userId && row.userId !== userId) return null;
  const now = new Date();
  const [updated] = await db
    .update(schema.notifications)
    .set({ acknowledgedAt: row.acknowledgedAt ?? now, readAt: row.readAt ?? now, status: "read" })
    .where(eq(schema.notifications.id, notificationId))
    .returning();
  await emitEvent({
    type: "notification.acknowledged",
    aggregateType: "notification",
    aggregateId: notificationId,
    actor: { type: "worker", id: userId },
    payload: { type: row.type, latencyMs: row.sentAt ? now.getTime() - row.sentAt.getTime() : null },
  });
  return updated;
}

/** Alerts that were sent but never acknowledged (used by the SLA sweep and dashboards). */
export async function unacknowledgedAlerts(olderThanMinutes = 15, now = new Date()) {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  return db
    .select()
    .from(schema.notifications)
    .where(
      and(
        isNull(schema.notifications.acknowledgedAt),
        eq(schema.notifications.status, "sent"),
        lte(schema.notifications.sentAt, cutoff),
        sql`${schema.notifications.payload}->>'requiresAck' = 'true'`,
      ),
    );
}

/** Deliver everything whose quiet-hours deferral or schedule has come due. */
export async function sendDueNotifications(now = new Date(), limit = 200) {
  const db = await getDb();
  const due = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.status, "queued"), lte(schema.notifications.scheduledFor, now)))
    .limit(limit);
  const results = [];
  for (const d of due) {
    if (isQuietHours(now)) break; // still night: leave them queued
    results.push(await sendQueued(d.id));
  }
  return results;
}

/* ------------------------------------------------------------------------------------------
 * Template-driven helpers
 * ---------------------------------------------------------------------------------------- */

export interface NotifyTemplateInput extends Omit<NotifyInput, "title" | "body" | "templateKey"> {
  key: string;
  vars?: Record<string, unknown>;
  /** Used when the template key is unknown (never blocks an operational alert). */
  fallbackTitle?: string;
  fallbackBody?: string;
}

export async function notifyTemplate(input: NotifyTemplateInput): Promise<NotifyResult> {
  let language = input.language ?? "fr";
  if (!input.language && input.userId) {
    const db = await getDb();
    const [u] = await db.select({ language: schema.users.languagePreference }).from(schema.users).where(eq(schema.users.id, input.userId));
    if (u) language = u.language;
  }
  const rendered = await renderTemplate(input.key, language, input.vars ?? {}, input.channel);
  const title = rendered?.title || input.fallbackTitle || input.key;
  const body = rendered?.body || input.fallbackBody || "";
  return notify({
    ...input,
    language,
    templateKey: input.key,
    title,
    body,
    sensitive: input.sensitive ?? rendered?.sensitivity === "sensitive",
  });
}

/** Notify every active user holding a role (optionally within a province). */
export async function notifyRole(role: Role, input: Omit<NotifyInput, "userId">, province?: string | null) {
  const db = await getDb();
  const where = province ? and(eq(schema.users.role, role), eq(schema.users.province, province)) : eq(schema.users.role, role);
  let recipients = await db.select({ id: schema.users.id, phone: schema.users.phone }).from(schema.users).where(where);
  if (recipients.length === 0 && province) {
    recipients = await db.select({ id: schema.users.id, phone: schema.users.phone }).from(schema.users).where(eq(schema.users.role, role));
  }
  const results: NotifyResult[] = [];
  for (const r of recipients) {
    results.push(await notify({ ...input, userId: r.id, to: r.phone ?? undefined }));
  }
  if (results.length === 0) {
    // Nobody holds this role yet: keep the alert in the shared queue so it is never lost.
    results.push(
      await notify({
        ...input,
        userId: null,
        channel: "in_app",
        payload: { ...(input.payload ?? {}), intendedRole: role, province: province ?? null },
      }),
    );
  }
  return results;
}

/** Same as notifyRole but with a template key. */
export async function notifyRoleTemplate(role: Role, input: Omit<NotifyTemplateInput, "userId">, province?: string | null) {
  const db = await getDb();
  const where = province ? and(eq(schema.users.role, role), eq(schema.users.province, province)) : eq(schema.users.role, role);
  let recipients = await db.select({ id: schema.users.id }).from(schema.users).where(where);
  if (recipients.length === 0 && province) {
    recipients = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, role));
  }
  const results: NotifyResult[] = [];
  for (const r of recipients) results.push(await notifyTemplate({ ...input, userId: r.id }));
  if (results.length === 0) {
    const rendered = await renderTemplate(input.key, input.language ?? "fr", input.vars ?? {});
    results.push(
      await notify({
        userId: null,
        channel: "in_app",
        type: input.type,
        title: rendered?.title ?? input.fallbackTitle ?? input.key,
        body: rendered?.body ?? input.fallbackBody ?? "",
        templateKey: input.key,
        payload: { ...(input.payload ?? {}), intendedRole: role, province: province ?? null },
        emergency: input.emergency,
        requiresAck: input.requiresAck,
      }),
    );
  }
  return results;
}

/* ------------------------------------------------------------------------------------------
 * Broadcasts
 * ---------------------------------------------------------------------------------------- */

export interface BroadcastAudience {
  role?: Role;
  province?: string | null;
  territory?: string | null;
  language?: LanguageCode | null;
}

export interface AudienceEstimate {
  total: number;
  reachable: number;
  optedOut: number;
  withoutConsent: number;
}

/** Audience estimate shown before a broadcast is approved. */
export async function estimateAudience(audience: BroadcastAudience): Promise<AudienceEstimate> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, phone: schema.users.phone, role: schema.users.role, preferences: schema.users.preferences })
    .from(schema.users)
    .where(
      and(
        audience.role ? eq(schema.users.role, audience.role) : undefined,
        audience.province ? eq(schema.users.province, audience.province) : undefined,
        audience.territory ? eq(schema.users.territory, audience.territory) : undefined,
        audience.language ? eq(schema.users.languagePreference, audience.language) : undefined,
        eq(schema.users.status, "active"),
      ),
    );
  let optedOut = 0;
  let withoutConsent = 0;
  let reachable = 0;
  for (const u of rows) {
    if (isOptedOut(u.preferences)) {
      optedOut++;
      continue;
    }
    if (u.role === "citizen" && !(await hasReminderConsent(u.id))) {
      withoutConsent++;
      continue;
    }
    reachable++;
  }
  return { total: rows.length, reachable, optedOut, withoutConsent };
}

export interface BroadcastInput extends BroadcastAudience {
  channel?: NotificationChannel;
  title: string;
  message: string;
  templateKey?: string;
  vars?: Record<string, unknown>;
  approvedBy: string;
  dedupeKey?: string;
  tenantId?: string | null;
}

/** Send an approved broadcast: opt-out compliant, deduplicated, one row per recipient. */
export async function sendBroadcast(input: BroadcastInput) {
  const db = await getDb();
  const recipients = await db
    .select({ id: schema.users.id, phone: schema.users.phone, role: schema.users.role, language: schema.users.languagePreference, preferences: schema.users.preferences })
    .from(schema.users)
    .where(
      and(
        input.role ? eq(schema.users.role, input.role) : undefined,
        input.province ? eq(schema.users.province, input.province) : undefined,
        input.territory ? eq(schema.users.territory, input.territory) : undefined,
        input.language ? eq(schema.users.languagePreference, input.language) : undefined,
        eq(schema.users.status, "active"),
      ),
    );
  const results: NotifyResult[] = [];
  for (const r of recipients) {
    if (isOptedOut(r.preferences)) continue;
    const key = input.templateKey ?? "broadcast.generic";
    results.push(
      await notifyTemplate({
        key,
        userId: r.id,
        channel: input.channel ?? "in_app",
        type: "broadcast",
        language: r.language,
        vars: { title: input.title, message: input.message, ...(input.vars ?? {}) },
        fallbackTitle: input.title,
        fallbackBody: input.message,
        payload: { approvedBy: input.approvedBy, broadcast: true },
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${r.id}` : undefined,
        tenantId: input.tenantId ?? null,
      }),
    );
  }
  const sent = results.filter((r) => r.status === "sent").length;
  const suppressed = results.filter((r) => r.suppressed).length;
  return { attempted: results.length, sent, suppressed, results };
}

function errMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

/** Delivery statistics for the operations dashboard. */
export async function deliveryStats(sinceDays = 7) {
  const db = await getDb();
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const rows = await db
    .select({ status: schema.notifications.status, channel: schema.notifications.channel, n: count() })
    .from(schema.notifications)
    .where(gte(schema.notifications.createdAt, since))
    .groupBy(schema.notifications.status, schema.notifications.channel);
  const [ack] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(gte(schema.notifications.createdAt, since), sql`${schema.notifications.acknowledgedAt} is not null`));
  return { since: since.toISOString(), byStatus: rows, acknowledged: ack?.n ?? 0 };
}
