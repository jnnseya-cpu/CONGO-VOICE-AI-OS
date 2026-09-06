import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import { audit } from "@/lib/core/audit";
import { schema } from "@/lib/db/client";
import { hasReminderConsent } from "@/lib/core/notifications";
import {
  cancelReminders,
  scheduleAncReminders,
  schedulePlantingReminders,
  scheduleRevisionReminders,
  scheduleVaccinationReminders,
  upcomingReminders,
} from "@/lib/core/scheduler";

/** A citizen's reminder subscriptions and what is coming next. */
export const GET = handle({ auth: true }, async ({ db, user }) => {
  const consented = await hasReminderConsent(user.userId);
  const upcoming = await upcomingReminders(user.userId);
  const [latestConsent] = await db
    .select()
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, user.userId), eq(schema.consents.purpose, "reminders")))
    .orderBy(desc(schema.consents.occurredAt))
    .limit(1);
  return { optedIn: consented, consent: latestConsent ?? null, upcoming };
});

const Body = z.object({
  kind: z.enum(["vaccination", "anc", "planting", "revision"]),
  /** Vaccination: the child's date of birth. */
  dateOfBirth: z.string().datetime().optional(),
  childLabel: z.string().max(80).optional(),
  /** Antenatal: the first day of the last menstrual period. */
  lastMenstrualPeriod: z.string().datetime().optional(),
  /** Planting: the crops followed in the citizen's province. */
  crops: z.array(z.string().max(80)).max(10).optional(),
  province: z.string().max(120).optional(),
  /** Revision: the examination date. */
  examDate: z.string().datetime().optional(),
  exam: z.string().max(32).optional(),
  subject: z.string().max(80).optional(),
  channel: z.enum(["sms", "whatsapp", "in_app"]).optional(),
});

/**
 * Opt in to a reminder programme. Consent (purpose "reminders") must already be granted
 * through /api/v1/consents: this endpoint never grants it implicitly.
 */
export const POST = handle({ auth: true }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  if (!(await hasReminderConsent(user.userId))) {
    throw badRequest("Consentement « rappels » requis : accordez-le d'abord via /api/v1/consents.");
  }
  const [profile] = await db.select({ province: schema.users.province, language: schema.users.languagePreference }).from(schema.users).where(eq(schema.users.id, user.userId));
  const language = profile?.language ?? user.language;

  let created;
  switch (body.kind) {
    case "vaccination":
      if (!body.dateOfBirth) throw badRequest("dateOfBirth est requis pour les rappels de vaccination.");
      created = await scheduleVaccinationReminders(user.userId, new Date(body.dateOfBirth), { childLabel: body.childLabel, language, channel: body.channel });
      break;
    case "anc":
      if (!body.lastMenstrualPeriod) throw badRequest("lastMenstrualPeriod est requis pour les rappels prénatals.");
      created = await scheduleAncReminders(user.userId, new Date(body.lastMenstrualPeriod), { language });
      break;
    case "planting": {
      const province = body.province ?? profile?.province;
      if (!province || !body.crops?.length) throw badRequest("province et crops sont requis pour les rappels de calendrier cultural.");
      created = await schedulePlantingReminders(user.userId, province, body.crops, { language });
      break;
    }
    case "revision":
      if (!body.examDate) throw badRequest("examDate est requis pour les rappels de révision.");
      created = await scheduleRevisionReminders(user.userId, new Date(body.examDate), { exam: body.exam, subject: body.subject, language });
      break;
  }
  await audit({ action: "reminder.subscribed", actorUserId: user.userId, actorRole: user.role, entityType: "schedule", after: { kind: body.kind, count: created.length }, purpose: "reminders", ip });
  return { kind: body.kind, scheduled: created.length, reminders: created };
});

/** Stop all reminders (STOP keyword, IVR menu, or the citizen's own screen). */
export const DELETE = handle({ auth: true }, async ({ user, ip }) => {
  const cancelled = await cancelReminders(user.userId);
  await audit({ action: "reminder.unsubscribed", actorUserId: user.userId, actorRole: user.role, entityType: "schedule", after: { cancelled: cancelled.length }, purpose: "reminders", ip });
  return { cancelled: cancelled.length };
});
