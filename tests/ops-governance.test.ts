import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { seedReferenceData } from "@server/db/reference";
import { EPI_SCHEDULE, PROVINCES, nextSowWindow, revisionNudges, vaccinationDueDates } from "@server/db/reference";
import {
  cancelReminders,
  fireDueSchedules,
  runScheduler,
  scheduleAncReminders,
  schedulePlantingReminders,
  scheduleRevisionReminders,
  scheduleVaccinationReminders,
} from "@server/core/scheduler";
import { base32Decode, base32Encode, generateSecret, hotp, otpauthUri, requireStepUp, stepUpStatus, totp, verifyCode, verifyTotp } from "@server/core/mfa";
import { buildAccessPackage, createDataRequest, processDataRequest, tombstoneToken, tombstoneUser } from "@server/core/privacy";
import { maskPhone, redact, redactText } from "@server/core/redact";
import type { Session } from "@server/core/auth";

const DAY = 24 * 3600 * 1000;
const ids = { consenting: "", revoking: "", admin: "" };

async function grant(userId: string, purpose: string, status: "granted" | "revoked") {
  const db = await getDb();
  await db.insert(schema.consents).values({ userId, purpose, status, method: "voice", language: "fr" });
}

describe("scheduler, reminders and consent", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await seedReferenceData();
    const [a] = await db.insert(schema.users).values({ role: "citizen", phone: "+243840000001", languagePreference: "fr", province: "Kongo-Central" }).returning();
    const [b] = await db.insert(schema.users).values({ role: "citizen", phone: "+243840000002", languagePreference: "sw", province: "Nord-Kivu" }).returning();
    const [admin] = await db.insert(schema.users).values({ role: "platform_admin", name: "Admin", phone: "+243840000003" }).returning();
    ids.consenting = a.id;
    ids.revoking = b.id;
    ids.admin = admin.id;
    await grant(a.id, "reminders", "granted");
    await grant(b.id, "reminders", "granted");
  });

  it("derives vaccination dates from the DRC EPI calendar", () => {
    const dob = new Date();
    const due = vaccinationDueDates(dob, dob);
    expect(due.length).toBe(EPI_SCHEDULE.length - 1); // the birth dose is already past its reminder window
    expect(due[0].dose.key).toBe("week6");
    expect(Math.round((due[0].dueAt.getTime() - dob.getTime()) / DAY)).toBe(42);
    expect(due.at(-1)?.dose.antigens).toContain("VAR 2");
  });

  it("derives antenatal, planting and revision dates", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const planting = nextSowWindow("Kongo-Central", "manioc", now);
    expect(planting?.label).toContain("Saison");
    expect(planting!.remindAt.getTime()).toBeLessThan(planting!.opensAt.getTime());
    const nudges = revisionNudges(new Date(now.getTime() + 40 * DAY), now);
    expect(nudges.map((n) => n.daysLeft)).toEqual([30, 14, 7, 2]);
    expect(PROVINCES).toHaveLength(26);
  });

  it("fires a due reminder in the citizen's language", async () => {
    const db = await getDb();
    const dob = new Date();
    const created = await scheduleVaccinationReminders(ids.consenting, dob, { childLabel: "Votre enfant", now: dob });
    expect(created.length).toBeGreaterThan(0);

    const result = await fireDueSchedules(new Date(dob.getTime() + 45 * DAY));
    expect(result.fired).toBeGreaterThanOrEqual(1);
    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, ids.consenting));
    expect(notifications[0].templateKey).toBe("reminder.vaccination");
    expect(notifications[0].body).toContain("vaccin");
  });

  it("stops reminders as soon as the reminders consent is revoked", async () => {
    const db = await getDb();
    const dob = new Date();
    await scheduleVaccinationReminders(ids.revoking, dob, { now: dob });

    // The first dose fires while consent stands.
    const before = await fireDueSchedules(new Date(dob.getTime() + 45 * DAY));
    expect(before.fired).toBeGreaterThanOrEqual(1);

    await grant(ids.revoking, "reminders", "revoked");

    // Everything still pending is cancelled, and anything due later is refused at send time.
    const cancelled = await cancelReminders(ids.revoking);
    expect(cancelled.length).toBeGreaterThan(0);

    await db
      .insert(schema.schedules)
      .values({ userId: ids.revoking, kind: "vaccination", channel: "sms", language: "sw", scheduledFor: new Date(Date.now() - 1000), payload: { vaccine: "VAR 1", dueDate: "2026-06-01" } });
    const after = await fireDueSchedules(new Date());
    expect(after.fired).toBe(0);
    expect(after.cancelled).toBeGreaterThanOrEqual(1);

    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.eventType, "reminder.suppressed"));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("schedules antenatal, planting and revision reminders", async () => {
    const db = await getDb();
    const now = new Date();
    const anc = await scheduleAncReminders(ids.consenting, new Date(now.getTime() - 30 * DAY), { now });
    expect(anc.length).toBeGreaterThan(0);
    const planting = await schedulePlantingReminders(ids.consenting, "Kongo-Central", ["manioc", "maïs"], { now });
    expect(planting.length).toBeGreaterThan(0);
    const revision = await scheduleRevisionReminders(ids.consenting, new Date(now.getTime() + 40 * DAY), { exam: "tenafep", subject: "mathématiques", now });
    expect(revision.map((r) => (r.payload as { daysLeft: number }).daysLeft)).toEqual([30, 14, 7, 2]);
    const kinds = await db.select().from(schema.schedules).where(eq(schema.schedules.userId, ids.consenting));
    expect(new Set(kinds.map((k) => k.kind))).toEqual(new Set(["vaccination", "anc", "planting", "revision"]));
  });

  it("runs the whole scheduler and reports every step", async () => {
    const report = await runScheduler();
    expect(report.errors).toEqual([]);
    expect(report.auditChain?.ok).not.toBe(false);
    expect(report).toMatchObject({
      reminders: expect.any(Object),
      slaBreaches: expect.any(Number),
      blockedCases: expect.any(Number),
      reportsGenerated: expect.any(Number),
      acuAlerts: expect.any(Number),
      overdueDataRequests: expect.any(Number),
    });
  });
});

describe("TOTP multi-factor authentication", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!ids.admin) {
      const [admin] = await db.insert(schema.users).values({ role: "platform_admin", phone: "+243840000099" }).returning();
      ids.admin = admin.id;
    }
  });

  it("round-trips base32 and matches the RFC 4226 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    // RFC 4226 appendix D, counter 0..3.
    expect(hotp(secret, 0)).toBe("755224");
    expect(hotp(secret, 1)).toBe("287082");
    expect(hotp(secret, 2)).toBe("359152");
  });

  it("verifies a current code and tolerates one step of drift", () => {
    const secret = generateSecret();
    const now = new Date();
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, new Date(now.getTime() - 30_000)), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, new Date(now.getTime() - 120_000)), now)).toBe(false);
    expect(verifyTotp(secret, "000000", new Date(0))).toBe(false);
    expect(verifyTotp(secret, "abc", now)).toBe(false);
    expect(otpauthUri(secret, "+243840000003")).toContain("otpauth://totp/");
  });

  it("gates high-risk actions until a recent second factor exists", async () => {
    const db = await getDb();
    const session = { userId: ids.admin, role: "platform_admin", language: "fr", anonymous: false, exp: Date.now() + 1000 } as Session;
    await expect(requireStepUp(session)).rejects.toThrow(/authentification/i);

    const secret = generateSecret();
    await db.update(schema.users).set({ mfaSecret: secret, mfaEnabled: false }).where(eq(schema.users.id, ids.admin));
    const bad = await verifyCode(ids.admin, "000000");
    expect(bad.ok).toBe(false);

    const good = await verifyCode(ids.admin, totp(secret));
    expect(good.ok).toBe(true);
    expect(good.enabled).toBe(true);
    await expect(requireStepUp(session)).resolves.toMatchObject({ satisfied: true });

    // A field worker is not required to enrol, so the gate lets them through.
    const [chw] = await db.insert(schema.users).values({ role: "chw", phone: "+243840000004" }).returning();
    const chwSession = { userId: chw.id, role: "chw", language: "fr", anonymous: false, exp: Date.now() + 1000 } as Session;
    await expect(requireStepUp(chwSession)).resolves.toMatchObject({ required: false });

    // The step-up expires.
    const stale = await stepUpStatus(ids.admin, "platform_admin", new Date(Date.now() + 30 * 60_000));
    expect(stale.satisfied).toBe(false);
    expect(stale.reason).toBe("expired");
  });
});

describe("privacy: access, erasure and log redaction", () => {
  it("scrubs personal data before anything reaches a log", () => {
    expect(redactText("Appelez le +243 81 234 5678 demain")).toContain("[tel]");
    expect(redactText("Appelez le +243 81 234 5678 demain")).not.toContain("234");
    expect(redactText("mon numéro est 0812345678")).toContain("[tel]");
    // Case references and short identifiers are not phone numbers.
    expect(redactText("réf. A2966E15 traitée")).toBe("réf. A2966E15 traitée");
    expect(redactText("cas 12345678 clos")).toBe("cas 12345678 clos");
    expect(redactText("Le patient Jean Kabila est arrivé")).toContain("[nom]");
    expect(redactText("écrire à test.user@example.org")).toContain("[email]");
    expect(redact({ phone: "+243812345678", note: "rien" })).toMatchObject({ phone: "[redacted]", note: "rien" });
    expect(maskPhone("+243812345678")).toBe("***678");
    expect(maskPhone(null)).toBe("—");
  });

  it("builds an access package and completes the request", async () => {
    const db = await getDb();
    const [citizen] = await db.insert(schema.users).values({ role: "citizen", name: "Citoyenne", phone: "+243850000001", province: "Kinshasa" }).returning();
    const [interaction] = await db.insert(schema.interactions).values({ userId: citizen.id, module: "health", transcript: "j'ai de la fièvre", status: "completed" }).returning();
    await db.insert(schema.cases).values({ module: "health", userId: citizen.id, interactionId: interaction.id, title: "Fièvre", severity: "medium" });

    const pkg = await buildAccessPackage(citizen.id);
    expect(pkg?.counts.interactions).toBe(1);
    expect(pkg?.counts.cases).toBe(1);

    const request = await createDataRequest({ userId: citizen.id, type: "access", requestedBy: { userId: citizen.id, role: "citizen" } });
    const days = (request.dueAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    const done = await processDataRequest(request.id, { userId: ids.admin, role: "platform_admin" });
    expect(done?.request.status).toBe("completed");
  });

  it("tombstones a person on erasure while keeping the statutory audit trail", async () => {
    const db = await getDb();
    const [citizen] = await db.insert(schema.users).values({ role: "citizen", name: "À effacer", phone: "+243850000002", province: "Kinshasa" }).returning();
    const [interaction] = await db
      .insert(schema.interactions)
      .values({ userId: citizen.id, module: "health", transcript: "contenu personnel", response: "réponse", status: "completed" })
      .returning();
    await db.insert(schema.cases).values({ module: "health", userId: citizen.id, interactionId: interaction.id, title: "Cas nominatif", severity: "medium", notes: "notes personnelles" });
    await db.insert(schema.files).values({ userId: citizen.id, kind: "audio", storageKey: "missing/key.webm", mimeType: "audio/webm", sizeBytes: 10 });
    const auditsBefore = await db.select().from(schema.auditLogs);

    const result = await tombstoneUser(citizen.id, { userId: ids.admin, role: "platform_admin" });
    expect(result.tombstoneId).toBe(tombstoneToken(citizen.id));
    expect(result.interactionsPseudonymised).toBe(1);

    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, citizen.id));
    expect(after.name).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.status).toBe("erased");
    expect(after.pseudoId).toBe(result.tombstoneId);

    const [i] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, interaction.id));
    expect(i.transcript).toBeNull();
    expect(i.auditStatus).toBe("erased");

    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.userId, citizen.id));
    expect(c.title).toContain("Cas anonymisé");
    expect(c.notes).toBeNull();
    // Statistics survive: the case row itself is kept.
    expect(c.module).toBe("health");

    const files = await db.select().from(schema.files).where(eq(schema.files.userId, citizen.id));
    expect(files).toHaveLength(0);

    const auditsAfter = await db.select().from(schema.auditLogs);
    expect(auditsAfter.length).toBeGreaterThan(auditsBefore.length);
    expect(auditsAfter.some((a) => a.action === "privacy.erasure_executed")).toBe(true);
  });

  it("refuses to erase while a legal hold is in force", async () => {
    const db = await getDb();
    const [citizen] = await db.insert(schema.users).values({ role: "citizen", name: "Sous scellés", phone: "+243850000003" }).returning();
    const request = await createDataRequest({ userId: citizen.id, type: "erasure", requestedBy: { userId: citizen.id, role: "citizen" } });
    await db.update(schema.dataRequests).set({ legalHold: true }).where(eq(schema.dataRequests.id, request.id));

    const held = await processDataRequest(request.id, { userId: ids.admin, role: "platform_admin" });
    expect(held?.request.status).toBe("on_hold");
    expect(held?.result).toBeNull();

    const [unchanged] = await db.select().from(schema.users).where(eq(schema.users.id, citizen.id));
    expect(unchanged.name).toBe("Sous scellés");

    const audits = await db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.entityType, "data_request"), eq(schema.auditLogs.entityId, request.id)));
    expect(audits.map((a) => a.action)).toContain("privacy.request_on_hold");
  });
});
