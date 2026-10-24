/**
 * Does the installed worker take control of the page and serve the application
 * when the page's own network is gone?
 *
 *   node scripts/pwa-offline.mjs http://localhost:3000
 *
 * Scope, stated because the gap matters. A driver's offline mode stops the
 * page's requests; it does not stop the ones a service worker makes on the
 * page's behalf. The queued-turn receipt — "no network: your message is saved
 * and will be sent" — travels that second path, so it cannot be proven here and
 * is not asserted here. It is covered by `tests/offline-capacity.test.ts` (the
 * outbox's ordering and exactly-once replay) and `tests/service-worker.test.ts`
 * (the worker's cache and queue policy). Proving it in a browser needs the
 * server genuinely stopped, which is a manual exercise rather than a check that
 * belongs in a pipeline.
 *
 * What this does prove, on the real build: the worker installs, activates,
 * claims the page, has the shell in a cache, and renders a page from it with the
 * network down. Those four are the difference between a progressive web
 * application and a web page with a manifest.
 *
 * Needs a running instance and a Chromium. CHROMIUM_PATH overrides the browser.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const DEFAULT_EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXEC = process.env.CHROMIUM_PATH ?? (existsSync(DEFAULT_EXEC) ? DEFAULT_EXEC : undefined);

const results = [];
const check = (name, condition, detail = "") => {
  results.push({ name, ok: Boolean(condition) });
  console.log(`  ${condition ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
// A phone-sized viewport, because that is the device this is for.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
const page = await ctx.newPage();

await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });

const registration = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "service workers unsupported in this browser";
  try {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    return "ready";
  } catch (err) {
    return String(err);
  }
});
check("the service worker registers and activates", registration === "ready", registration === "ready" ? "" : registration);

// The precache is written during install; a second navigation puts a real page
// in the shell cache and lets the worker claim this client.
await page.waitForTimeout(2500);
await page.goto(`${base}/sante`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1500);

const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
check("the worker controls the page", controlled, controlled ? "" : "no controller: its fetch handler never runs");

const cacheNames = await page.evaluate(() => window.caches.keys());
check("the shell is in a cache", cacheNames.some((n) => n.startsWith("cvos-shell-")), cacheNames.join(", ") || "no caches");

await ctx.setOffline(true);
const navigation = await page.goto(`${base}/sante`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => ({ error: String(err) }));
const text = navigation?.error ? "" : await page.textContent("body").catch(() => "");
check("a page still renders with the network down", text.length > 200, navigation?.error ?? `${text.length} characters rendered`);
await ctx.setOffline(false);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} offline checks passed.`);
if (failed.length > 0) process.exit(1);
