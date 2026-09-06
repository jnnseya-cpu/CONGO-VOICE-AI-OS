/**
 * Offline-first outbox (browser side).
 *
 * A voice note recorded with no network is written to IndexedDB immediately and replayed
 * later — by this helper when the tab is open, or by the service worker's "cvos-sync"
 * background sync when it is not. Every queued item carries its own Idempotency-Key, so a
 * replay can never create a second interaction.
 *
 * This module is intentionally free of server imports: it runs in the browser and in the
 * service worker's module scope.
 */

export const QUEUE_DB_NAME = "cvos-offline";
export const QUEUE_DB_VERSION = 1;
export const QUEUE_STORE = "outbox";
export const SYNC_TAG = "cvos-sync";

export type QueuedStatus = "pending" | "sending" | "sent" | "failed";

export interface QueuedTurn {
  /** UUIDv7-style: time-ordered, so replays keep the citizen's turn order. */
  id: string;
  sessionId: string;
  createdAt: number;
  inputKind: "voice" | "text" | "image" | "video";
  text?: string;
  langHint?: string;
  moduleHint?: string;
  /** Recorded audio or photo bytes. */
  blob?: Blob;
  fileName?: string;
  mimeType?: string;
  status: QueuedStatus;
  attempts: number;
  lastError?: string;
}

/** UUIDv7: 48-bit big-endian timestamp, version 7, random tail. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  let ms = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  const random = new Uint8Array(10);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(random);
  else for (let i = 0; i < 10; i++) random[i] = Math.floor(Math.random() * 256);
  bytes.set(random, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, mode);
    const request = run(transaction.objectStore(QUEUE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export interface EnqueueInput {
  sessionId: string;
  inputKind: QueuedTurn["inputKind"];
  text?: string;
  langHint?: string;
  moduleHint?: string;
  blob?: Blob;
  fileName?: string;
  mimeType?: string;
}

/** Queues a turn for delivery. Returns the queued item (its id is the Idempotency-Key). */
export async function enqueue(input: EnqueueInput): Promise<QueuedTurn> {
  const item: QueuedTurn = {
    id: uuidv7(),
    sessionId: input.sessionId,
    createdAt: Date.now(),
    inputKind: input.inputKind,
    text: input.text,
    langHint: input.langHint,
    moduleHint: input.moduleHint,
    blob: input.blob,
    fileName: input.fileName,
    mimeType: input.mimeType,
    status: "pending",
    attempts: 0,
  };
  const db = await openQueue();
  await tx(db, "readwrite", (store) => store.put(item));
  db.close();
  void requestBackgroundSync();
  return item;
}

export async function listQueue(status?: QueuedStatus): Promise<QueuedTurn[]> {
  const db = await openQueue();
  const all = await tx<QueuedTurn[]>(db, "readonly", (store) => store.getAll() as IDBRequest<QueuedTurn[]>);
  db.close();
  const rows = status ? all.filter((r) => r.status === status) : all;
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Number of turns still waiting for the network — shown in the PWA's offline badge. */
export async function countUnsynced(): Promise<number> {
  try {
    const rows = await listQueue();
    return rows.filter((r) => r.status === "pending" || r.status === "failed" || r.status === "sending").length;
  } catch {
    return 0;
  }
}

export async function remove(id: string): Promise<void> {
  const db = await openQueue();
  await tx(db, "readwrite", (store) => store.delete(id));
  db.close();
}

async function update(item: QueuedTurn): Promise<void> {
  const db = await openQueue();
  await tx(db, "readwrite", (store) => store.put(item));
  db.close();
}

export function buildTurnBody(item: QueuedTurn): FormData {
  const form = new FormData();
  form.set("input_kind", item.inputKind);
  if (item.text) form.set("text", item.text);
  if (item.langHint) form.set("lang_hint", item.langHint);
  if (item.moduleHint) form.set("module", item.moduleHint);
  if (item.blob) {
    const name = item.fileName ?? (item.inputKind === "voice" ? "voice.webm" : "media.jpg");
    if (item.inputKind === "voice") form.set("audio", item.blob, name);
    else form.append("media[]", item.blob, name);
  }
  return form;
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

/**
 * Replays every queued turn against /api/v1/sessions/{id}/turns. Safe to call as often as
 * you like: each item is sent with its own Idempotency-Key.
 */
export async function flush(fetchImpl: typeof fetch = fetch): Promise<FlushResult> {
  let sent = 0;
  let failed = 0;
  let items: QueuedTurn[] = [];
  try {
    items = (await listQueue()).filter((i) => i.status !== "sent");
  } catch {
    return { sent: 0, failed: 0, remaining: 0 };
  }
  for (const item of items) {
    try {
      await update({ ...item, status: "sending", attempts: item.attempts + 1 });
      const res = await fetchImpl(`/api/v1/sessions/${item.sessionId}/turns`, {
        method: "POST",
        headers: { "Idempotency-Key": item.id },
        body: buildTurnBody(item),
        credentials: "same-origin",
      });
      if (res.ok) {
        await remove(item.id);
        sent += 1;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // Permanent rejection: keep the evidence but stop retrying.
        await update({ ...item, status: "failed", attempts: item.attempts + 1, lastError: `http_${res.status}` });
        failed += 1;
      } else {
        await update({ ...item, status: "pending", attempts: item.attempts + 1, lastError: `http_${res.status}` });
        failed += 1;
      }
    } catch (err) {
      await update({
        ...item,
        status: "pending",
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : "network_error",
      });
      failed += 1;
    }
  }
  return { sent, failed, remaining: await countUnsynced() };
}

type SyncCapableRegistration = ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };

/** Asks the service worker to replay the queue as soon as the network returns. */
export async function requestBackgroundSync(tag: string = SYNC_TAG): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    const registration = (await navigator.serviceWorker.ready) as SyncCapableRegistration;
    if (!registration.sync) return false;
    await registration.sync.register(tag);
    return true;
  } catch {
    return false;
  }
}
