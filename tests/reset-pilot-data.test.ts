/**
 * Clearing the pilot's test exchanges, and what must survive it.
 *
 * The dangerous part of a reset is not what it deletes but what it is allowed
 * to delete. These tests hold the three boundaries: the audit chain survives
 * because it is the proof of what the programme did and a reset that edits the
 * proof is the one operation nobody should have; named accounts survive because
 * the administrator running it would otherwise delete their own way back in;
 * and clinical content survives because a board's signature is not untidy data.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { seedReferenceData } from "@server/db/reference";
import { countPilotData, resetPilotData } from "@server/core/reset";
import { audit } from "@server/core/audit";
import { verifyAuditChain } from "@server/core/audit";

const actor = { userId: "", role: "platform_admin" };

beforeEach(async () => {
  await resetDbForTests();
  await seedReferenceData();
  const db = await getDb();
  const [admin] = await db
    .insert(schema.users)
    .values({ role: "platform_admin", phone: "admin", name: "Administrateur", languagePreference: "fr" })
    .returning();
  actor.userId = admin.id;

  // A pilot's worth of test traffic.
  const [citizen] = await db
    .insert(schema.users)
    .values({ role: "citizen", isAnonymous: true, languagePreference: "fr" })
    .returning();
  const [interaction] = await db
    .insert(schema.interactions)
    .values({ userId: citizen.id, module: "health", channel: "text", originalInput: "merci", status: "completed" })
    .returning();
  await db.insert(schema.cases).values({ userId: citizen.id, module: "health", title: "Cas d'essai", status: "open", severity: "medium" });
  await db.insert(schema.notifications).values({ userId: citizen.id, type: "escalation", title: "Alerte", body: "Essai" });
  await db.insert(schema.files).values({ userId: citizen.id, kind: "audio", storageKey: "voice/essai", mimeType: "audio/webm", sizeBytes: 10 });
  await audit({ action: "interaction.completed", actorUserId: citizen.id, entityType: "interaction", entityId: interaction.id });
});

describe("counting before deleting", () => {
  it("reports what would go without removing anything", async () => {
    const before = await countPilotData();
    expect(before.interactions).toBe(1);
    expect(before.cases).toBe(1);
    expect(before.anonymousUsers).toBe(1);
    // Counting is not deleting.
    expect((await countPilotData()).interactions).toBe(1);
  });
});

describe("what a reset removes", () => {
  it("clears the exchanges, cases, notifications and files", async () => {
    await resetPilotData(actor);
    const after = await countPilotData();
    expect(after.interactions).toBe(0);
    expect(after.cases).toBe(0);
    expect(after.notifications).toBe(0);
    expect(after.files).toBe(0);
  });

  it("removes anonymous sessions, which testing created", async () => {
    await resetPilotData(actor);
    expect((await countPilotData()).anonymousUsers).toBe(0);
  });
});

describe("what a reset must never remove", () => {
  it("keeps every named account, including the one running it", async () => {
    await resetPilotData(actor);
    const db = await getDb();
    const [admin] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId));
    expect(admin).toBeTruthy();
    expect(admin.role).toBe("platform_admin");
  });

  it("keeps the audit log, and leaves its chain verifiable", async () => {
    const db = await getDb();
    const before = (await db.select().from(schema.auditLogs)).length;
    expect(before).toBeGreaterThan(0);

    await resetPilotData(actor);

    const after = await db.select().from(schema.auditLogs);
    // Nothing removed, one added for the purge itself.
    expect(after.length).toBeGreaterThan(before);
    // The whole reason not to touch it: deleting rows breaks the hash chain and
    // the platform would then correctly report its record as tampered with.
    const verdict = await verifyAuditChain();
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
  });

  it("records the purge as an action of the programme", async () => {
    await resetPilotData(actor);
    const db = await getDb();
    const [entry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "system.pilot_data_reset"));
    expect(entry).toBeTruthy();
    expect(entry.actorUserId).toBe(actor.userId);
    expect(JSON.stringify(entry.afterValue)).toContain("interactions");
  });

  it("keeps the clinical content and the reference data", async () => {
    const db = await getDb();
    const protocolsBefore = (await db.select().from(schema.protocolVersions)).length;
    const provincesBefore = (await db.select().from(schema.provinces)).length;

    await resetPilotData(actor);

    expect((await db.select().from(schema.protocolVersions)).length).toBe(protocolsBefore);
    expect((await db.select().from(schema.provinces)).length).toBe(provincesBefore);
  });
});

describe("running it twice", () => {
  it("is harmless on an already-empty deployment", async () => {
    await resetPilotData(actor);
    await expect(resetPilotData(actor)).resolves.toBeTruthy();
    expect((await countPilotData()).interactions).toBe(0);
  });
});
