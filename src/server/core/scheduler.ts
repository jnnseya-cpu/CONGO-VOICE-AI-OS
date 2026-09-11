/**
 * Scheduler — the platform's heartbeat.
 *
 * One entry point, `runScheduler()`, executed by cron (POST /api/v1/workflow/run or
 * `npm run workflow:run`). It fires everything that is due and returns a summary:
 *
 *   1. due reminders (vaccination, antenatal, planting, revision, case follow-up)
 *   2. notifications deferred by quiet hours
 *   3. SLA breach sweep and blocked cases
 *   4. scheduled report definitions and expired report cleanup
 *   5. daily audit-chain integrity check
 *   6. ACU cap alerts
 *   7. data requests approaching their 30-day deadline
 *
 * Every step is independent: one failure never stops the others.
 */
import "server-only";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { audit, verifyAuditChain } from "./audit";
import { emitEvent } from "./events";
import { hasReminderConsent, notifyRole, notifyTemplate, sendDueNotifications } from "./notifications";
import { checkAcuCaps } from "./metering";
import { overdueDataRequests } from "./privacy";
import { pruneAuthAttempts } from "./lockout";
import { pruneRateLimitCounters } from "./rate-limit";
import { safeLog } from "./redact";
import { detectBlockedCases, detectSlaBreaches } from "@server/ai/agents/workflow";
import { expireReports, runDueReportDefinitions } from "@server/reports";
import {
  EXAM_LABELS,
  ancDueDates,
  nextSowWindow,
  revisionNudges,
  vaccinationDueDates,
} from "@server/db/reference/calendars";
import type { LanguageCode } from "@server/db/schema";

export type ScheduleKind = "vaccination" | "anc" | "planting" | "revision" | "follow_up" | "sla" | "report";

/** Reminder kinds that require the citizen to have granted the "reminders" purpose. */
const CITIZEN_REMINDERS: ScheduleKind[] = ["vaccination", "anc", "planting", "revision", "follow_up"];

const TEMPLATE_FOR_KIND: Record<ScheduleKind, string> = {
  vaccination: "reminder.vaccination",
  anc: "reminder.anc",
  planting: "reminder.planting",
  revision: "reminder.revision",
  follow_up: "followup.due",
  sla: "case.sla_breach",
  report: "report.ready",
};

/* ------------------------------------------------------------------------------------------
 * Creating schedules
 * ---------------------------------------------------------------------------------------- */

export interface ScheduleReminderInput {
  userId: string;
  kind: ScheduleKind;
  scheduledFor: Date;
  language?: LanguageCode;
  channel?: "in_app" | "sms" | "whatsapp" | "email";
  caseId?: string | null;
  payload?: Record<string, unknown>;
}

export async function scheduleReminder(input: ScheduleReminderInput) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.schedules)
    .values({
      userId: input.userId,
      caseId: input.caseId ?? null,
      kind: input.kind,
      channel: input.channel ?? "sms",
      language: input.language ?? "fr",
      scheduledFor: input.scheduledFor,
      payload: input.payload ?? {},
    })
    .returning();
  return row;
}

/** DRC EPI calendar: one reminder per remaining dose for a child of known date of birth. */
export async function scheduleVaccinationReminders(
  userId: string,
  dateOfBirth: Date,
  opts: { childLabel?: string; language?: LanguageCode; channel?: "sms" | "whatsapp" | "in_app"; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const created = [];
  for (const due of vaccinationDueDates(dateOfBirth, now)) {
    created.push(
      await scheduleReminder({
        userId,
        kind: "vaccination",
        scheduledFor: due.remindAt,
        language: opts.language,
        channel: opts.channel ?? "sms",
        payload: {
          doseKey: due.dose.key,
          vaccine: due.dose.label,
          antigens: due.dose.antigens,
          dueDate: due.dueAt.toISOString().slice(0, 10),
          childLabel: opts.childLabel ?? "Votre enfant",
        },
      }),
    );
  }
  await emitEvent({ type: "reminder.vaccination.scheduled", aggregateType: "user", aggregateId: userId, classification: "confidential", payload: { doses: created.length } });
  return created;
}

/** Antenatal contacts from the last menstrual period. Sensitive: lock-screen safe wording. */
export async function scheduleAncReminders(userId: string, lastMenstrualPeriod: Date, opts: { language?: LanguageCode; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const created = [];
  for (const c of ancDueDates(lastMenstrualPeriod, now)) {
    created.push(
      await scheduleReminder({
        userId,
        kind: "anc",
        scheduledFor: c.remindAt,
        language: opts.language,
        payload: { contact: c.contact.key, label: c.contact.label, dueDate: c.dueAt.toISOString().slice(0, 10) },
      }),
    );
  }
  await emitEvent({ type: "reminder.anc.scheduled", aggregateType: "user", aggregateId: userId, classification: "sensitive", payload: { contacts: created.length } });
  return created;
}

export async function schedulePlantingReminders(userId: string, province: string, crops: string[], opts: { language?: LanguageCode; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const created = [];
  for (const crop of crops) {
    const next = nextSowWindow(province, crop, now);
    if (!next) continue;
    created.push(
      await scheduleReminder({
        userId,
        kind: "planting",
        scheduledFor: next.remindAt,
        language: opts.language,
        payload: { crop, province, dueDate: next.opensAt.toISOString().slice(0, 10), window: next.label },
      }),
    );
  }
  return created;
}

export async function scheduleRevisionReminders(
  userId: string,
  examDate: Date,
  opts: { exam?: string; subject?: string; language?: LanguageCode; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const created = [];
  for (const n of revisionNudges(examDate, now)) {
    created.push(
      await scheduleReminder({
        userId,
        kind: "revision",
        scheduledFor: n.remindAt,
        language: opts.language,
        payload: { daysLeft: n.daysLeft, exam: EXAM_LABELS[opts.exam ?? "none"] ?? opts.exam ?? "vos évaluations", subject: opts.subject ?? "vos matières principales" },
      }),
    );
  }
  return created;
}

/** Cancel pending reminders — used when consent is revoked or a citizen opts out. */
export async function cancelReminders(userId: string, kinds: ScheduleKind[] = CITIZEN_REMINDERS) {
  const db = await getDb();
  const cancelled = await db
    .update(schema.schedules)
    .set({ status: "cancelled" })
    .where(and(eq(schema.schedules.userId, userId), eq(schema.schedules.status, "scheduled"), inArray(schema.schedules.kind, kinds)))
    .returning();
  if (cancelled.length) {
    await emitEvent({ type: "reminder.cancelled", aggregateType: "user", aggregateId: userId, payload: { count: cancelled.length, kinds } });
  }
  return cancelled;
}

/* ------------------------------------------------------------------------------------------
 * Firing due schedules
 * ---------------------------------------------------------------------------------------- */

export interface FireResult {
  fired: number;
  cancelled: number;
  failed: number;
}

/**
 * Send every schedule that has come due. Consent is re-checked at send time, not at
 * scheduling time: a citizen who revoked consent yesterday receives nothing today.
 */
export async function fireDueSchedules(now = new Date(), limit = 200): Promise<FireResult> {
  const db = await getDb();
  const due = await db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.status, "scheduled"), lte(schema.schedules.scheduledFor, now)))
    .limit(limit);

  let fired = 0;
  let cancelled = 0;
  let failed = 0;
  for (const s of due) {
    const kind = s.kind as ScheduleKind;
    try {
      if (!s.userId) {
        await db.update(schema.schedules).set({ status: "cancelled", firedAt: now }).where(eq(schema.schedules.id, s.id));
        cancelled++;
        continue;
      }
      if (CITIZEN_REMINDERS.includes(kind) && !(await hasReminderConsent(s.userId))) {
        await db.update(schema.schedules).set({ status: "cancelled", firedAt: now }).where(eq(schema.schedules.id, s.id));
        await emitEvent({ type: "reminder.suppressed", aggregateType: "schedule", aggregateId: s.id, payload: { reason: "no_consent", kind } });
        cancelled++;
        continue;
      }
      const result = await notifyTemplate({
        key: TEMPLATE_FOR_KIND[kind] ?? "broadcast.generic",
        userId: s.userId,
        channel: s.channel,
        type: kind === "follow_up" ? "follow_up" : "reminder",
        language: s.language,
        vars: { ...(s.payload ?? {}), caseRef: s.caseId ? s.caseId.slice(0, 8).toUpperCase() : "" },
        payload: { scheduleId: s.id, kind, caseId: s.caseId },
        caseId: s.caseId,
        sensitive: kind === "anc",
        dedupeKey: `schedule:${s.id}`,
        fallbackTitle: "Rappel",
        fallbackBody: "Vous avez un rappel du programme CONGO VOICE AI OS.",
      });
      const delivered = result.status === "sent" || result.deferred === true;
      await db
        .update(schema.schedules)
        .set({ status: delivered ? "sent" : "failed", firedAt: now, payload: { ...(s.payload ?? {}), notificationId: result.id, suppressed: result.suppressed ?? null } })
        .where(eq(schema.schedules.id, s.id));
      if (delivered) fired++;
      else failed++;
    } catch (err) {
      safeLog.error("scheduler", `schedule ${s.id} failed`, err);
      await db.update(schema.schedules).set({ status: "failed", firedAt: now }).where(eq(schema.schedules.id, s.id));
      failed++;
    }
  }
  return { fired, cancelled, failed };
}

/* ------------------------------------------------------------------------------------------
 * The run
 * ---------------------------------------------------------------------------------------- */

export interface SchedulerReport {
  startedAt: string;
  durationMs: number;
  reminders: FireResult;
  deferredNotificationsSent: number;
  slaBreaches: number;
  blockedCases: number;
  reportsGenerated: number;
  reportsExpired: number;
  auditChain: { date: string; ok: boolean; checked: number; brokenAt: unknown } | null;
  acuAlerts: number;
  overdueDataRequests: number;
  securityCountersPruned: number;
  errors: Array<{ step: string; message: string }>;
}

async function step<T>(name: string, errors: SchedulerReport["errors"], fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    safeLog.error("scheduler", `${name} failed`, err);
    errors.push({ step: name, message });
    return fallback;
  }
}

export async function runScheduler(now = new Date()): Promise<SchedulerReport> {
  const started = Date.now();
  const errors: SchedulerReport["errors"] = [];

  const reminders = await step("reminders", errors, () => fireDueSchedules(now), { fired: 0, cancelled: 0, failed: 0 });
  const deferred = await step("deferred_notifications", errors, () => sendDueNotifications(now), []);
  const breaches = await step("sla_sweep", errors, () => detectSlaBreaches(now), []);
  const blocked = await step("blocked_cases", errors, () => detectBlockedCases(now), []);
  const reports = await step("scheduled_reports", errors, () => runDueReportDefinitions(now), []);
  const expired = await step("expire_reports", errors, () => expireReports(now), 0);
  const acuAlerts = await step("acu_caps", errors, () => checkAcuCaps(now), []);
  const overdue = await step("data_requests", errors, () => overdueDataRequests(now), []);

  // Security counters are unbounded otherwise: one row per address that ever
  // mistyped a PIN, one per rate-limit bucket that ever filled.
  const pruned = await step(
    "prune_security_counters",
    errors,
    async () => {
      const db = await getDb();
      const attempts = await pruneAuthAttempts(db, 86_400_000, now.getTime());
      const buckets = await pruneRateLimitCounters(db, 3_600_000, now.getTime());
      return attempts + buckets;
    },
    0,
  );

  // Daily integrity check of yesterday's audit chain (a closed day cannot change any more).
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const chain = await step("audit_chain", errors, () => verifyAuditChain(yesterday), null);
  if (chain && !chain.ok) {
    await notifyRole("platform_admin", {
      type: "alert",
      channel: "in_app",
      title: "Intégrité du journal d'audit compromise",
      body: `La chaîne du ${chain.date} ne se vérifie plus (${chain.brokenAt?.reason ?? "rupture"} à l'entrée ${chain.brokenAt?.index ?? "?"}). Une investigation est requise.`,
      payload: { date: chain.date, brokenAt: chain.brokenAt },
      emergency: true,
      requiresAck: true,
    });
    await audit({ action: "audit.chain_broken", actorRole: "system", entityType: "audit_chain", entityId: chain.date, after: chain.brokenAt, systemEvent: "scheduler" });
    await emitEvent({ type: "audit.chain.broken", aggregateType: "audit_chain", aggregateId: chain.date, classification: "restricted", payload: { brokenAt: chain.brokenAt } });
  }

  if (overdue.length) {
    await notifyRole("platform_admin", {
      type: "alert",
      channel: "in_app",
      title: "Demandes d'accès ou d'effacement en retard",
      body: `${overdue.length} demande(s) dépassent le délai légal de 30 jours.`,
      payload: { ids: overdue.map((r) => r.id) },
      requiresAck: true,
      dedupeKey: `data-requests-overdue:${now.toISOString().slice(0, 10)}`,
    });
  }

  const report: SchedulerReport = {
    startedAt: now.toISOString(),
    durationMs: Date.now() - started,
    reminders,
    deferredNotificationsSent: deferred.length,
    slaBreaches: breaches.length,
    blockedCases: blocked.length,
    reportsGenerated: reports.length,
    reportsExpired: expired,
    auditChain: chain,
    acuAlerts: acuAlerts.length,
    overdueDataRequests: overdue.length,
    securityCountersPruned: pruned,
    errors,
  };
  await emitEvent({ type: "scheduler.run.completed", aggregateType: "scheduler", aggregateId: now.toISOString().slice(0, 10), payload: { ...report, errors: errors.length } });
  return report;
}

/** Upcoming schedules for a citizen (reminders screen). */
export async function upcomingReminders(userId: string, limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.userId, userId), eq(schema.schedules.status, "scheduled"), isNotNull(schema.schedules.scheduledFor)))
    .orderBy(schema.schedules.scheduledFor)
    .limit(limit);
}
