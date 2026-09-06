/**
 * CONGO VOICE AI OS — service worker.
 *
 * Connectivity in rural DRC is intermittent, so the app must keep working with no network:
 *  · the app shell is precached and served offline;
 *  · API reads are network-first with a cached fallback;
 *  · a turn posted while offline (voice note, photo, text) is queued in IndexedDB and the
 *    caller gets an immediate 202 with a queued id;
 *  · the queue is replayed by the "cvos-sync" background sync, on reconnection, or on
 *    demand from the page, each item carrying its own Idempotency-Key.
 *
 * Keep the constants below in sync with src/lib/channels/offline-queue.ts.
 */

const VERSION = "v1";
const SHELL_CACHE = `cvos-shell-${VERSION}`;
const DATA_CACHE = `cvos-data-${VERSION}`;
const QUEUE_DB_NAME = "cvos-offline";
const QUEUE_DB_VERSION = 1;
const QUEUE_STORE = "outbox";
const SYNC_TAG = "cvos-sync";

const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.svg", "/icons/icon-512.svg"];

const OFFLINE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hors ligne — CONGO VOICE AI OS</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;color:#e2e8f0;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}p{max-width:32rem;color:#94a3b8}</style>
</head><body><div><h1>Vous êtes hors ligne</h1>
<p>Vos messages vocaux sont enregistrés sur le téléphone et seront envoyés dès le retour du réseau.</p></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/* ─────────────────────────────── IndexedDB queue ─────────────────────────────── */

function openQueue() {
  return new Promise((resolve, reject) => {
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
    request.onerror = () => reject(request.error);
  });
}

function queueOp(mode, run) {
  return openQueue().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, mode);
        const request = run(tx.objectStore(QUEUE_STORE));
        request.onsuccess = () => {
          resolve(request.result);
          db.close();
        };
        request.onerror = () => {
          reject(request.error);
          db.close();
        };
      }),
  );
}

/** UUIDv7: time-ordered so a replayed queue keeps the citizen's turn order. */
function uuidv7() {
  const bytes = new Uint8Array(16);
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  crypto.getRandomValues(bytes.subarray(6));
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function enqueueTurn(request, sessionId) {
  const form = await request.clone().formData();
  const item = {
    id: uuidv7(),
    sessionId,
    createdAt: Date.now(),
    inputKind: form.get("input_kind") || (form.get("audio") ? "voice" : "text"),
    text: form.get("text") || undefined,
    langHint: form.get("lang_hint") || undefined,
    moduleHint: form.get("module") || undefined,
    status: "pending",
    attempts: 0,
  };
  const audio = form.get("audio");
  if (audio && typeof audio !== "string") {
    item.blob = audio;
    item.fileName = audio.name || "voice.webm";
    item.mimeType = audio.type || "audio/webm";
    item.inputKind = "voice";
  } else {
    const media = form.getAll("media[]").filter((m) => typeof m !== "string");
    if (media.length > 0) {
      item.blob = media[0];
      item.fileName = media[0].name || "media.jpg";
      item.mimeType = media[0].type || "image/jpeg";
      item.inputKind = "image";
    }
  }
  await queueOp("readwrite", (store) => store.put(item));
  if ("sync" in self.registration) {
    try {
      await self.registration.sync.register(SYNC_TAG);
    } catch {
      /* background sync unavailable: the page will flush on reconnection */
    }
  }
  return item;
}

function buildBody(item) {
  const form = new FormData();
  form.set("input_kind", item.inputKind || "text");
  if (item.text) form.set("text", item.text);
  if (item.langHint) form.set("lang_hint", item.langHint);
  if (item.moduleHint) form.set("module", item.moduleHint);
  if (item.blob) {
    if (item.inputKind === "voice") form.set("audio", item.blob, item.fileName || "voice.webm");
    else form.append("media[]", item.blob, item.fileName || "media.jpg");
  }
  return form;
}

async function replayQueue() {
  const items = (await queueOp("readonly", (store) => store.getAll())) || [];
  const pending = items.filter((i) => i.status !== "sent").sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;
  for (const item of pending) {
    try {
      const res = await fetch(`/api/v1/sessions/${item.sessionId}/turns`, {
        method: "POST",
        headers: { "Idempotency-Key": item.id },
        body: buildBody(item),
        credentials: "same-origin",
      });
      if (res.ok) {
        await queueOp("readwrite", (store) => store.delete(item.id));
        sent += 1;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        await queueOp("readwrite", (store) =>
          store.put({ ...item, status: "failed", attempts: (item.attempts || 0) + 1, lastError: `http_${res.status}` }),
        );
      } else {
        await queueOp("readwrite", (store) =>
          store.put({ ...item, status: "pending", attempts: (item.attempts || 0) + 1, lastError: `http_${res.status}` }),
        );
        throw new Error("retry later");
      }
    } catch (err) {
      await broadcast({ type: "cvos-sync-progress", sent, remaining: pending.length - sent });
      throw err; // let background sync retry with its own backoff
    }
  }
  await broadcast({ type: "cvos-sync-complete", sent });
  return sent;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of clients) client.postMessage(message);
}

/* ─────────────────────────────── fetch strategy ─────────────────────────────── */

const TURN_PATH = /^\/api\/v1\/sessions\/([^/]+)\/turns\/?$/;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Queue outgoing turns when the network is unavailable.
  const turnMatch = TURN_PATH.exec(url.pathname);
  if (request.method === "POST" && turnMatch) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        const item = await enqueueTurn(request, turnMatch[1]);
        return new Response(
          JSON.stringify({
            queued: true,
            queued_id: item.id,
            session_id: item.sessionId,
            code: "QUEUED_OFFLINE",
            safe_localised_message:
              "Pas de réseau : votre message est enregistré et sera envoyé automatiquement.",
            retryable: true,
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    return;
  }

  if (request.method !== "GET") return;

  // API reads: network first, cached copy as the offline fallback.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return (
            cached ||
            new Response(
              JSON.stringify({
                code: "DEPENDENCY_UNAVAILABLE",
                message_key: "channel.error.dependency_unavailable",
                safe_localised_message:
                  "Le service est momentanément indisponible. Votre message est enregistré, réessayez bientôt.",
                retryable: true,
                fields: [],
                request_id: "offline",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            )
          );
        }),
    );
    return;
  }

  // Navigations: network first, then the shell, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) || (await caches.match("/"));
          return cached || new Response(OFFLINE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
        }),
    );
    return;
  }

  // Static assets: cache first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(replayQueue());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cvos-flush") event.waitUntil(replayQueue().catch(() => undefined));
  if (data.type === "cvos-skip-waiting") self.skipWaiting();
});
