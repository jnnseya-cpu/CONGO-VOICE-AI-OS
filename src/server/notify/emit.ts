import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { notify, notifyRole } from "@server/core/notifications";
import type { NotificationType } from "@server/core/notifications";
import type { Role } from "@server/db/schema";
import { CHANNELS, event, type CommsEvent, type EventChannel } from "./catalogue";

/**
 * Raise a catalogue event and let it fan out.
 *
 * A call site says what happened and supplies the variables. It does not choose
 * the wording, the channels, or whether the notice can be switched off — those
 * belong to the catalogue, where they can be reviewed by somebody who does not
 * read code, and tested.
 *
 * The one thing this adds beyond `notify()` is the mandatory rule. `notify()`
 * already honours opt-outs, quiet hours and frequency caps, which is correct for
 * a revision reminder and wrong for a danger sign. A mandatory event is sent as
 * an emergency so those defences stand aside — and the reason it may do so is
 * written next to it in the catalogue rather than being a boolean somebody set
 * once.
 */

export interface EmitTarget {
  /** One person. */
  userId?: string | null;
  /** Everybody holding a role — escalations, supervision notices. */
  role?: Role;
  /** Overrides the recipient's stored destination. Rarely needed. */
  to?: string;
}

export interface EmitInput extends EmitTarget {
  vars?: Record<string, string | number>;
  /** Narrow the fan-out. Never widens it, and never overrides a mandatory channel. */
  onlyChannels?: EventChannel[];
  payload?: Record<string, unknown>;
}

export interface EmitResult {
  eventId: string;
  mandatory: boolean;
  /** One entry per channel the event went out on. */
  sent: Array<{ channel: EventChannel; ok: boolean; reason?: string }>;
  /** Placeholders the catalogue declares that the call site did not supply. */
  missingVars: string[];
}

/** `{{name}}` substitution. An unsupplied variable is reported, never printed raw. */
export function render(template: string, vars: Record<string, string | number> = {}): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") {
      missing.push(key);
      // Better a gap than the literal braces: a citizen must never be shown
      // "{{caseRef}}", and a notice with a hole is still readable.
      return "…";
    }
    return String(value);
  });
  return { text, missing: [...new Set(missing)] };
}

/** How a catalogue event maps onto the existing notification types. */
function typeFor(def: CommsEvent): NotificationType {
  if (def.category === "clinical_safety" && def.severity === "critical") return "emergency";
  if (def.id.startsWith("case.") || def.category === "clinical_safety") return "escalation";
  if (def.category === "platform" || def.category === "oversight") return "system";
  if (def.id.includes("reminder") || def.id.includes("follow_up") || def.id.includes("revision")) return "reminder";
  if (def.id.includes("report")) return "report";
  return "alert";
}

export async function emit(eventId: string, input: EmitInput = {}): Promise<EmitResult> {
  const def = event(eventId);
  if (!def) {
    // A typo in an event id must not be a silent no-op: the notice simply never
    // arrives, and nothing says so.
    throw new Error(`unknown communication event: ${eventId}`);
  }

  const title = render(def.title, input.vars);
  const body = render(def.body, input.vars);
  const missingVars = [...new Set([...title.missing, ...body.missing])];

  // A narrowing is honoured for ordinary notices and ignored for mandatory ones:
  // the point of mandatory is that no configuration removes it.
  const channels = def.mandatory
    ? def.channels
    : def.channels.filter((c) => !input.onlyChannels || input.onlyChannels.includes(c));

  const sent: EmitResult["sent"] = [];
  for (const channel of channels) {
    const common = {
      channel,
      type: typeFor(def),
      title: title.text,
      body: body.text,
      templateKey: def.id,
      // Emergency is what makes notify() stand its defences down. It is set from
      // the catalogue's own mandatory flag, never from the call site.
      emergency: def.mandatory === true,
      payload: { ...input.payload, event: def.id, severity: def.severity, category: def.category },
    } as const;

    try {
      if (input.role) {
        await notifyRole(input.role, common);
      } else if (input.userId) {
        await notify({ ...common, userId: input.userId, to: input.to });
      } else if (input.to) {
        await notify({ ...common, to: input.to });
      } else {
        sent.push({ channel, ok: false, reason: "no_recipient" });
        continue;
      }
      sent.push({ channel, ok: true });
    } catch (err) {
      // One channel failing must not stop the others: the whole point of the
      // fan-out is that a citizen unreachable by SMS may still take a call.
      sent.push({ channel, ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { eventId: def.id, mandatory: def.mandatory === true, sent, missingVars };
}

/** Deliveries recorded against catalogue events, newest first — for the console. */
export async function recentDeliveries(limit = 40) {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.notifications.id,
      channel: schema.notifications.channel,
      status: schema.notifications.status,
      templateKey: schema.notifications.templateKey,
      title: schema.notifications.title,
      createdAt: schema.notifications.createdAt,
      sentAt: schema.notifications.sentAt,
      failureReason: schema.notifications.failureReason,
    })
    .from(schema.notifications)
    .orderBy(schema.notifications.createdAt)
    .limit(limit);
  return rows.reverse().map((r) => ({ ...r, event: r.templateKey ? event(r.templateKey) ?? null : null }));
}

/**
 * How many of each catalogue event have actually gone out.
 *
 * The number that matters in the console is not how many events exist but how
 * many have ever fired: an event declared and never emitted is a signal an
 * operator is waiting for that will never come.
 */
export async function eventActivity(): Promise<Map<string, { sent: number; failed: number }>> {
  const db = await getDb();
  const rows = await db
    .select({ templateKey: schema.notifications.templateKey, status: schema.notifications.status })
    .from(schema.notifications);
  const out = new Map<string, { sent: number; failed: number }>();
  for (const r of rows) {
    if (!r.templateKey || !event(r.templateKey)) continue;
    const entry = out.get(r.templateKey) ?? { sent: 0, failed: 0 };
    if (r.status === "failed") entry.failed++;
    else entry.sent++;
    out.set(r.templateKey, entry);
  }
  return out;
}

/** Channel coverage crossed with what has actually been delivered. */
export async function channelActivity(): Promise<Array<{ channel: EventChannel; events: number; sent: number }>> {
  const db = await getDb();
  const rows = await db.select({ channel: schema.notifications.channel, status: schema.notifications.status }).from(schema.notifications);
  const { EVENTS } = await import("./catalogue");
  return CHANNELS.map((channel) => ({
    channel,
    events: EVENTS.filter((e) => e.channels.includes(channel)).length,
    sent: rows.filter((r) => r.channel === channel && r.status !== "failed").length,
  }));
}

/** A user's own notification history is read elsewhere; this is the operator's view. */
export async function userDeliveries(userId: string, limit = 20) {
  const db = await getDb();
  return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).limit(limit);
}
