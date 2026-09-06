import { beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { AUDIT_GENESIS, audit, auditRowHash, canonicalJson, verifyAuditChain } from "@/lib/core/audit";

describe("tamper-evident audit chain", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("produces a canonical JSON representation independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalJson({ at: new Date("2026-01-01T00:00:00Z") })).toContain("2026-01-01T00:00:00.000Z");
  });

  it("chains every row to its predecessor within the day", async () => {
    const db = await getDb();
    await audit({ action: "test.one", actorRole: "system", entityType: "case", entityId: "a" });
    await audit({ action: "test.two", actorRole: "system", entityType: "case", entityId: "b" });
    await audit({ action: "test.three", actorRole: "system", entityType: "case", entityId: "c" });

    const rows = await db.select().from(schema.auditLogs).orderBy(asc(schema.auditLogs.createdAt), asc(schema.auditLogs.id));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0].prevHash).toBeNull();
    expect(rows[0].hash).toBeTruthy();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].hash);
    }
    // Timestamps are strictly increasing so the chain order is unambiguous.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].createdAt.getTime()).toBeGreaterThan(rows[i - 1].createdAt.getTime());
    }
  });

  it("verifies a clean day", async () => {
    const result = await verifyAuditChain(new Date());
    expect(result.ok).toBe(true);
    expect(result.brokenAt).toBeNull();
    expect(result.checked).toBeGreaterThanOrEqual(3);
  });

  it("detects a modified row", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.auditLogs).orderBy(asc(schema.auditLogs.createdAt));
    const victim = rows[1];
    await db.update(schema.auditLogs).set({ action: "test.two.tampered" }).where(eq(schema.auditLogs.id, victim.id));

    const result = await verifyAuditChain(new Date());
    expect(result.ok).toBe(false);
    expect(result.brokenAt?.id).toBe(victim.id);
    expect(result.brokenAt?.reason).toBe("hash_mismatch");

    // Restore and confirm the chain verifies again: the hash is a pure function of the row.
    await db.update(schema.auditLogs).set({ action: victim.action }).where(eq(schema.auditLogs.id, victim.id));
    expect((await verifyAuditChain(new Date())).ok).toBe(true);
  });

  it("detects a deleted row through the broken link", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.auditLogs).orderBy(asc(schema.auditLogs.createdAt));
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.id, rows[1].id));
    const result = await verifyAuditChain(new Date());
    expect(result.ok).toBe(false);
    expect(result.brokenAt?.reason).toBe("prev_hash_mismatch");
  });

  it("hashes with sha256(prevHash + canonical row) and starts each day from GENESIS", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      action: "case.created",
      actorUserId: null,
      actorRole: "system",
      entityType: "case",
      entityId: "x",
      beforeValue: null,
      afterValue: { a: 1 },
      systemEvent: null,
      aiSummary: null,
      ip: null,
      tenantId: null,
      traceId: null,
      purpose: null,
      createdAt: new Date("2026-01-01T10:00:00Z"),
    };
    const first = auditRowHash(null, row);
    expect(first).toBe(auditRowHash(AUDIT_GENESIS, row));
    expect(first).toHaveLength(64);
    expect(auditRowHash("aaaa", row)).not.toBe(first);
    // Any change to the content changes the hash.
    expect(auditRowHash(null, { ...row, afterValue: { a: 2 } })).not.toBe(first);
  });
});
