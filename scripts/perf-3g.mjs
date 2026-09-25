/**
 * Page and API timing on the connection people actually have (NFR-P-04).
 *
 * The target is a 3G profile, so measuring on a data-centre link says nothing.
 * Chromium is throttled to a slow 3G shape and the pages a citizen and a worker
 * open first are measured, then compared with the objective.
 *
 *   node scripts/perf-3g.mjs http://localhost:3000
 */
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const EXEC = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Slow 3G, as the specification's pilot provinces experience it.
const NETWORK = { downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 };
const TARGET_MS = Number(process.env.PERF_TARGET_MS ?? 2500);

const PAGES = ["/", "/sante", "/blog", "/connexion"];

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const results = [];

for (const path of PAGES) {
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK });
  // A mid-range handset, not a workstation.
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const started = Date.now();
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const domContentLoaded = Date.now() - started;
  await page.waitForLoadState("load", { timeout: 120_000 }).catch(() => undefined);
  const loaded = Date.now() - started;

  results.push({ path, domContentLoaded, loaded });
  await page.close();
}

await browser.close();

console.log(`Slow 3G, 4x CPU throttling. Objective: first paint of the document under ${TARGET_MS} ms (NFR-P-04).\n`);
let failed = 0;
for (const r of results) {
  const ok = r.domContentLoaded <= TARGET_MS;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok    " : "SLOW  "} ${String(r.domContentLoaded).padStart(6)} ms  document   ${String(r.loaded).padStart(6)} ms  fully loaded   ${r.path}`);
}
console.log(`\n${results.length - failed}/${results.length} pages within the objective.`);
process.exit(failed > 0 ? 1 : 0);
