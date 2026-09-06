import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import {
  NOTIFICATION_POLICY,
  acknowledgeNotification,
  deliverWithFallback,
  estimateAudience,
  fallbackChain,
  isQuietHours,
  localHour,
  nextDeliveryWindow,
  notify,
  notifyTemplate,
  renderTemplate,
  sendBroadcast,
  sendDueNotifications,
  unacknowledgedAlerts,
} from "@server/core/notifications";
import { seedReferenceData } from "@server/db/reference";

const ids: { citizen: string; worker: string; noConsent: string } = { citizen: "", worker: "", noConsent: "" };

async function grantReminders(userId: string) {
  const db = await getDb();
  await db.insert(schema.consents).values({ userId, purpose: "reminders", status: "granted", method: "voice", language: "fr" });
}

describe("notification templates and delivery policy", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await seedReferenceData();
    const [citizen] = await db.insert(schema.users).values({ role: "citizen", phone: "+243810000001", languagePreference: "fr", province: "Kinshasa" }).returning();
    const [worker] = await db.insert(schema.users).values({ role: "chw", phone: "+243810000002", languagePreference: "ln", province: "Kinshasa" }).returning();
    const [noConsent] = await db.insert(schema.users).values({ role: "citizen", phone: "+243810000003", languagePreference: "sw", province: "Tshopo" }).returning();
    ids.citizen = citizen.id;
    ids.worker = worker.id;
    ids.noConsent = noConsent.id;
    await grantReminders(citizen.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the catalogue in the five national languages, with the PRD wording", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.notificationTemplates);
    const keys = new Set(rows.map((r) => r.key));
    for (const key of ["emergency.worker_alert", "case.assigned", "case.sla_breach", "followup.due", "reminder.vaccination", "reminder.anc", "reminder.planting", "reminder.revision", "alert.cluster", "alert.learner_support", "broadcast.generic", "report.ready"]) {
      expect(keys.has(key)).toBe(true);
      expect(rows.filter((r) => r.key === key).map((r) => r.language).sort()).toEqual(["fr", "kg", "ln", "lua", "sw"]);
    }
    const emergency = await renderTemplate("emergency.worker_alert", "fr", { title: "T", province: "Kinshasa", caseRef: "ABC" });
    expect(emergency?.body).toContain("Ce cas de santé nécessite une revue urgente.");
    const cluster = await renderTemplate("alert.cluster", "fr", {});
    expect(cluster?.body).toContain("Les signalements de maladie des cultures augmentent dans cette zone.");
    const learner = await renderTemplate("alert.learner_support", "fr", { topic: "les fractions", count: 4, days: 7 });
    expect(learner?.body).toContain("Cet apprenant demande souvent de l'aide sur les fractions.");
    const sla = await renderTemplate("case.sla_breach", "fr", {});
    expect(sla?.body).toContain("Ce cas n'a pas été suivi dans le délai requis.");
  });

  it("renders in the recipient's own language and drops unknown placeholders", async () => {
    const ln = await renderTemplate("case.assigned", "ln", { title: "Likambo", province: "Kinshasa", dueAt: "demain" });
    expect(ln?.language).toBe("ln");
    expect(ln?.body).not.toContain("{{");
    const partial = await renderTemplate("case.assigned", "fr", { title: "Cas" });
    expect(partial?.body).not.toContain("undefined");
  });

  it("computes quiet hours on Africa/Kinshasa time (21:00–06:00)", () => {
    expect(localHour(new Date("2026-03-10T20:30:00Z"))).toBe(21);
    expect(isQuietHours(new Date("2026-03-10T20:30:00Z"))).toBe(true); // 21:30 local
    expect(isQuietHours(new Date("2026-03-10T04:30:00Z"))).toBe(true); // 05:30 local
    expect(isQuietHours(new Date("2026-03-10T09:00:00Z"))).toBe(false); // 10:00 local
    const window = nextDeliveryWindow(new Date("2026-03-10T22:00:00Z"));
    expect(localHour(window)).toBe(NOTIFICATION_POLICY.quietHourEnd);
    expect(window.getTime()).toBeGreaterThan(new Date("2026-03-10T22:00:00Z").getTime());
  });

  it("defers a non-emergency SMS during quiet hours and sends it when the window opens", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T22:30:00Z")); // 23:30 local
    const deferred = await notify({ userId: ids.citizen, channel: "sms", type: "reminder", title: "Rappel", body: "Message de nuit" });
    expect(deferred.status).toBe("queued");
    expect(deferred.deferred).toBe(true);
    expect(deferred.scheduledFor).not.toBeNull();

    vi.setSystemTime(new Date("2026-03-11T06:30:00Z")); // 07:30 local
    const sent = await sendDueNotifications(new Date("2026-03-11T06:30:00Z"));
    expect(sent.map((s) => s.id)).toContain(deferred.id);
    expect(sent.find((s) => s.id === deferred.id)?.status).toBe("sent");
  });

  it("never defers an emergency", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T23:00:00Z"));
    const alert = await notify({ userId: ids.worker, channel: "sms", type: "emergency", title: "Urgence", body: "Cas critique", emergency: true });
    expect(alert.status).toBe("sent");
    expect(alert.deferred).toBeUndefined();
  });

  it("caps a citizen at three non-emergency messages per rolling week", async () => {
    const db = await getDb();
    const results = [];
    for (let i = 0; i < NOTIFICATION_POLICY.weeklyCap + 1; i++) {
      results.push(await notify({ userId: ids.citizen, channel: "in_app", type: "reminder", title: `Rappel ${i}`, body: "Corps" }));
    }
    const sent = results.filter((r) => r.status === "sent");
    const suppressed = results.filter((r) => r.suppressed === "frequency_cap");
    expect(sent.length).toBeLessThanOrEqual(NOTIFICATION_POLICY.weeklyCap);
    expect(suppressed.length).toBeGreaterThanOrEqual(1);
    expect(suppressed[0].failureReason).toBe("frequency_cap");

    // The cap never applies to an emergency.
    const emergency = await notify({ userId: ids.citizen, channel: "in_app", type: "emergency", title: "Urgence", body: "Corps", emergency: true });
    expect(emergency.status).toBe("sent");

    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.eventType, "notification.suppressed"));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("suppresses a reminder to a citizen who never granted the reminders purpose", async () => {
    const result = await notify({ userId: ids.noConsent, channel: "in_app", type: "reminder", title: "Rappel", body: "Corps" });
    expect(result.suppressed).toBe("no_consent");
    expect(result.status).toBe("failed");
  });

  it("falls back WhatsApp → SMS → voice and records every attempt", async () => {
    expect(fallbackChain("whatsapp")).toEqual(["whatsapp", "sms", "voice"]);
    expect(fallbackChain("sms")).toEqual(["sms", "voice"]);
    expect(fallbackChain("in_app")).toEqual(["in_app"]);

    // WhatsApp configured for a provider without credentials: it fails, SMS (log) takes over.
    vi.resetModules();
    process.env.WHATSAPP_PROVIDER = "twilio";
    const mod = await import("@server/core/notifications");
    const outcome = await mod.deliverWithFallback("whatsapp", "+243810000001", "Titre", "Corps");
    expect(outcome.ok).toBe(true);
    expect(outcome.channelUsed).toBe("sms");
    expect(outcome.trail[0]).toMatchObject({ channel: "whatsapp", ok: false });
    expect(outcome.trail.some((t) => t.channel === "sms" && t.ok)).toBe(true);

    // SMS unavailable too: outbound IVR is the last resort.
    process.env.SMS_PROVIDER = "twilio";
    vi.resetModules();
    const mod2 = await import("@server/core/notifications");
    const voice = await mod2.deliverWithFallback("sms", "+243810000001", "Titre", "Corps");
    expect(voice.ok).toBe(true);
    expect(voice.channelUsed).toBe("voice");

    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.SMS_PROVIDER;
    vi.resetModules();
  });

  it("does not treat a sent alert as acknowledged until a human acknowledges it", async () => {
    const alert = await notify({ userId: ids.worker, channel: "in_app", type: "alert", title: "Cas urgent", body: "À examiner", requiresAck: true, emergency: true });
    expect(alert.status).toBe("sent");
    expect(alert.deliveredAt).not.toBeNull();
    expect(alert.acknowledgedAt).toBeNull();

    const pending = await unacknowledgedAlerts(0);
    expect(pending.map((p) => p.id)).toContain(alert.id);

    const acked = await acknowledgeNotification(alert.id, ids.worker);
    expect(acked?.acknowledgedAt).not.toBeNull();
    expect(acked?.status).toBe("read");

    const stillPending = await unacknowledgedAlerts(0);
    expect(stillPending.map((p) => p.id)).not.toContain(alert.id);
  });

  it("uses the lock-screen safe wording for sensitive subjects on external channels", async () => {
    const sensitive = await notifyTemplate({
      key: "reminder.anc",
      userId: ids.citizen,
      channel: "sms",
      type: "alert",
      emergency: true, // bypass the weekly cap for this assertion
      vars: { dueDate: "2026-04-01" },
    });
    expect(sensitive.body).not.toMatch(/prénatal|grossesse|enceinte/i);
    expect((sensitive.payload as Record<string, unknown>).fullBodyWithheld).toBe(true);
  });

  it("suppresses duplicates within the dedupe window", async () => {
    const first = await notify({ userId: ids.worker, channel: "in_app", type: "alert", title: "Alerte", body: "Corps", dedupeKey: "dup-test-1", emergency: true });
    const second = await notify({ userId: ids.worker, channel: "in_app", type: "alert", title: "Alerte", body: "Corps", dedupeKey: "dup-test-1", emergency: true });
    expect(second.suppressed).toBe("duplicate");
    expect(second.id).toBe(first.id);
  });

  it("estimates a broadcast audience and excludes opted-out citizens", async () => {
    const db = await getDb();
    const [optedOut] = await db
      .insert(schema.users)
      .values({ role: "citizen", phone: "+243810000004", languagePreference: "fr", province: "Kinshasa", preferences: { optOut: true } })
      .returning();
    await grantReminders(optedOut.id);

    const estimate = await estimateAudience({ role: "citizen", province: "Kinshasa" });
    expect(estimate.total).toBeGreaterThanOrEqual(2);
    expect(estimate.optedOut).toBeGreaterThanOrEqual(1);

    const result = await sendBroadcast({
      role: "citizen",
      province: "Kinshasa",
      channel: "in_app",
      title: "Campagne de vaccination",
      message: "La campagne se tient du 10 au 14 avril dans votre zone.",
      approvedBy: ids.worker,
      dedupeKey: "campaign-test",
    });
    expect(result.attempted).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, optedOut.id));
    expect(rows).toHaveLength(0);
  });

  it("records delivery metadata on every message", async () => {
    const n = await notify({ userId: ids.worker, channel: "sms", type: "alert", title: "Titre", body: "Corps", emergency: true });
    expect(n.attempts).toBeGreaterThanOrEqual(1);
    expect(n.providerMessageId).toBeTruthy();
    expect(n.deliveredAt).not.toBeNull();
    const payload = n.payload as Record<string, unknown>;
    expect(Array.isArray(payload.delivery)).toBe(true);
    expect(payload.channelUsed).toBe("sms");
  });
});

// Re-exported so the file fails loudly if the public surface is renamed.
void deliverWithFallback;
