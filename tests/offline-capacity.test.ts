/**
 * NFR-007: "72 hours of field capture and at least 200 queued events per managed
 * device without data loss."
 *
 * A community health worker in a territory with no coverage records for three
 * days and syncs when they reach a signal. If the outbox drops the oldest turn
 * to make room, or replays a turn twice, the record of a sick child is either
 * lost or duplicated. So the figures in the specification are tested, not
 * assumed: two hundred events, captured across seventy-two hours, replayed in
 * the order they were spoken, each one exactly once.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { QUEUE_DB_NAME, countUnsynced, enqueue, flush, listQueue, uuidv7 } from "@server/channels/offline-queue";

const HOURS_72 = 72 * 60 * 60 * 1000;
const CAPACITY = 200;

function resetQueue(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(QUEUE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function captureOverThreeDays(count: number): Promise<void> {
  const start = Date.now() - HOURS_72;
  const spacing = Math.floor(HOURS_72 / count);
  for (let i = 0; i < count; i++) {
    const item = await enqueue({
      sessionId: `session-${i % 7}`,
      inputKind: i % 3 === 0 ? "voice" : "text",
      text: `Tour ${i}`,
      langHint: ["fr", "ln", "kg", "sw", "lu"][i % 5],
    });
    // enqueue stamps createdAt with the clock; rewrite it so the queue really
    // holds three days of capture rather than three days claimed in a comment.
    await rewriteCreatedAt(item.id, start + i * spacing);
  }
}

function rewriteCreatedAt(id: string, createdAt: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB_NAME);
    open.onsuccess = () => {
      const db = open.result;
      const store = db.transaction("outbox", "readwrite").objectStore("outbox");
      const get = store.get(id);
      get.onsuccess = () => {
        const put = store.put({ ...get.result, createdAt });
        put.onsuccess = () => {
          db.close();
          resolve();
        };
        put.onerror = () => reject(put.error);
      };
      get.onerror = () => reject(get.error);
    };
    open.onerror = () => reject(open.error);
  });
}

describe("offline capture and replay (NFR-007)", () => {
  beforeEach(async () => {
    await resetQueue();
  });

  it("holds two hundred events captured over seventy-two hours without losing one", async () => {
    await captureOverThreeDays(CAPACITY);

    const queued = await listQueue();
    expect(queued).toHaveLength(CAPACITY);
    expect(await countUnsynced()).toBe(CAPACITY);

    const span = queued[queued.length - 1].createdAt - queued[0].createdAt;
    expect(span).toBeGreaterThanOrEqual(HOURS_72 - 60 * 60 * 1000);

    // Order is the order the citizen spoke in, not the order the network returned.
    for (let i = 1; i < queued.length; i++) {
      expect(queued[i].createdAt).toBeGreaterThan(queued[i - 1].createdAt);
    }
    expect(new Set(queued.map((q) => q.id)).size).toBe(CAPACITY);
  });

  it("replays every one of them exactly once when the signal returns", async () => {
    await captureOverThreeDays(CAPACITY);

    const seen: string[] = [];
    const result = await flush(async (_url, init) => {
      seen.push(String(new Headers(init?.headers).get("Idempotency-Key")));
      return new Response("{}", { status: 200 });
    });

    expect(result.sent).toBe(CAPACITY);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(seen).toHaveLength(CAPACITY);
    // Each turn carries its own key, so a second delivery cannot open a second case.
    expect(new Set(seen).size).toBe(CAPACITY);
    expect(await listQueue()).toHaveLength(0);
  });

  it("keeps every event when the sync itself fails halfway through", async () => {
    await captureOverThreeDays(CAPACITY);

    let delivered = 0;
    const partial = await flush(async () => {
      delivered += 1;
      if (delivered > CAPACITY / 2) throw new Error("network dropped");
      return new Response("{}", { status: 200 });
    });

    expect(partial.sent).toBe(CAPACITY / 2);
    // Nothing is discarded: what did not go stays on the handset.
    expect(partial.sent + partial.remaining).toBe(CAPACITY);
    expect(await listQueue()).toHaveLength(CAPACITY / 2);

    const rest = await flush(async () => new Response("{}", { status: 200 }));
    expect(rest.sent).toBe(CAPACITY / 2);
    expect(await countUnsynced()).toBe(0);
  });

  it("does not resend a turn the server already accepted", async () => {
    await captureOverThreeDays(10);
    const keys: string[] = [];
    await flush(async (_url, init) => {
      keys.push(String(new Headers(init?.headers).get("Idempotency-Key")));
      return new Response("{}", { status: 200 });
    });
    const again = await flush(async (_url, init) => {
      keys.push(String(new Headers(init?.headers).get("Idempotency-Key")));
      return new Response("{}", { status: 200 });
    });
    expect(again.sent).toBe(0);
    expect(keys).toHaveLength(10);
  });

  it("stops retrying a turn the server refuses, but keeps the evidence", async () => {
    await captureOverThreeDays(5);
    const result = await flush(async () => new Response("{}", { status: 422 }));
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(5);

    const failed = await listQueue("failed");
    expect(failed).toHaveLength(5);
    // The citizen's words are still on the device for a worker to look at.
    expect(failed[0].text).toBeTruthy();
    expect(failed[0].lastError).toBe("http_422");
  });

  it("orders identifiers by time, so a replay keeps the order of the conversation", () => {
    const early = uuidv7(Date.now() - HOURS_72);
    const late = uuidv7(Date.now());
    expect(early < late).toBe(true);
  });
});
