/**
 * A storage failure must not cost a citizen their answer.
 *
 * Saving the recording ran outside the pipeline's error handling, so a storage
 * driver that could not load turned every spoken question into a 500 — a parent
 * describing a child's symptoms saw "Erreur interne" and no referral. The
 * recording is evidence; the answer is the service.
 *
 * It must also not be lost quietly: "everything saved" includes the failures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { seedReferenceData } from "@server/db/reference";

const storeUpload = vi.hoisted(() => vi.fn());
vi.mock("@server/core/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@server/core/storage")>()),
  storeUpload,
}));

const { runInteraction } = await import("@server/ai/agents/orchestrator");

const audio = { data: Buffer.from("a spoken question about a feverish child"), mimeType: "audio/webm" };
// An anonymous citizen, which is who reaches the voice console without signing in.
const ask = () => runInteraction({ user: null, audio, moduleHint: "health", text: "mon enfant a de la fièvre" });

beforeEach(async () => {
  await resetDbForTests();
  await seedReferenceData();
  storeUpload.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("when the recording cannot be stored", () => {
  beforeEach(() => {
    // Exactly the production failure: STORAGE_DRIVER=gcs with the client absent.
    storeUpload.mockRejectedValue(new Error("Cannot find module '@google-cloud/storage'"));
  });

  it("still answers, rather than throwing", async () => {
    const out = await ask();
    expect(out.interactionId).toBeTruthy();
    expect(out.responseText.length).toBeGreaterThan(0);
  });

  it("does not mark the interaction as failed", async () => {
    const out = await ask();
    expect(out.status).not.toBe("failed");
  });

  it("records the gap, so an unsaved recording is not invisible", async () => {
    await ask();
    const db = await getDb();
    const entries = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "file.store_failed"));
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0].afterValue)).toContain("google-cloud/storage");
  });

  it("notes it on the interaction row too, where an operator would look", async () => {
    const out = await ask();
    const db = await getDb();
    const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, out.interactionId));
    expect(row.errorMessage).toContain("recording_not_stored");
  });

  it("leaves no dangling file row pointing at something that was never written", async () => {
    await ask();
    const db = await getDb();
    expect(await db.select().from(schema.files)).toHaveLength(0);
  });
});

describe("when the recording stores normally", () => {
  it("attaches it and records no failure", async () => {
    storeUpload.mockResolvedValue({ key: "voice/abc", sizeBytes: 42, sha256: "f".repeat(64) });
    const out = await ask();
    const db = await getDb();
    const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, out.interactionId));
    expect(row.audioFileId).toBeTruthy();
    expect(row.errorMessage ?? "").not.toContain("recording_not_stored");
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "file.store_failed"))).toHaveLength(0);
  });
});
