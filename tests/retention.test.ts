import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { RETENTION_DAYS, sweepExpiredMedia } from "@server/core/privacy";
import { storage } from "@server/core/storage";
import { getDb, resetDbForTests, schema } from "@server/db/client";

async function putFile(kind: "audio" | "image" | "document", ageDays: number, opts: { hold?: Date } = {}) {
  const db = await getDb();
  const key = `test/retention-${kind}-${ageDays}-${Math.random().toString(36).slice(2)}.bin`;
  await storage().put(key, Buffer.from("contenu"), "application/octet-stream");
  const [row] = await db
    .insert(schema.files)
    .values({
      kind,
      storageKey: key,
      mimeType: "application/octet-stream",
      sizeBytes: 7,
      createdAt: new Date(Date.now() - ageDays * 86_400_000),
      legalHoldUntil: opts.hold ?? null,
    })
    .returning();
  return row;
}

describe("media retention (SEC-06)", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("deletes a recording once it is past its period, bytes and row together", async () => {
    const old = await putFile("audio", RETENTION_DAYS.audio + 1);
    const sweep = await sweepExpiredMedia();
    expect(sweep.deleted).toBe(1);
    expect(sweep.byKind.audio).toBe(1);

    const db = await getDb();
    expect(await db.select().from(schema.files).where(eq(schema.files.id, old.id))).toHaveLength(0);
    await expect(storage().get(old.storageKey)).rejects.toBeTruthy();
  });

  it("keeps a recording that is still within its period", async () => {
    const recent = await putFile("audio", RETENTION_DAYS.audio - 1);
    expect((await sweepExpiredMedia()).deleted).toBe(0);
    const db = await getDb();
    expect(await db.select().from(schema.files).where(eq(schema.files.id, recent.id))).toHaveLength(1);
  });

  it("holds voice for a shorter time than photographs", () => {
    expect(RETENTION_DAYS.audio).toBeLessThan(RETENTION_DAYS.image);
  });

  it("leaves a file alone while it is under legal hold", async () => {
    const held = await putFile("audio", RETENTION_DAYS.audio + 30, { hold: new Date(Date.now() + 86_400_000) });
    expect((await sweepExpiredMedia()).deleted).toBe(0);
    const db = await getDb();
    expect(await db.select().from(schema.files).where(eq(schema.files.id, held.id))).toHaveLength(1);
  });

  it("applies each kind its own period", async () => {
    await putFile("audio", 120);
    await putFile("image", 120);
    const sweep = await sweepExpiredMedia();
    // 120 days is past the voice period and inside the photograph period.
    expect(sweep.byKind.audio).toBe(1);
    expect(sweep.byKind.image ?? 0).toBe(0);
  });

  it("records the deletion, so it can be pointed to afterwards", async () => {
    await putFile("audio", RETENTION_DAYS.audio + 1);
    await sweepExpiredMedia();
    const db = await getDb();
    const entries = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "retention.media_swept"));
    expect(entries.length).toBeGreaterThan(0);
  });
});
