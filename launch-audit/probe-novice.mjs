/**
 * CYCLE 1 — the novice walkthrough, executed.
 *
 * A first-time user on a mid-range phone (360 px) over a throttled slow-3G link,
 * who has never seen the product, will not read instructions, and leaves if
 * confused. Every step is timed. The question is not "does the feature exist"
 * but "would this person reach the thing they came for, unaided".
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const DEFAULT_EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXEC = process.env.CHROMIUM_PATH ?? (existsSync(DEFAULT_EXEC) ? DEFAULT_EXEC : undefined);
const SHOTS = "launch-audit/evidence";
mkdirSync(SHOTS, { recursive: true });

const log = [];
const step = (name, ms, note) => {
  log.push({ name, ms, note });
  console.log(`  ${String(ms).padStart(6)} ms  ${name}${note ? ` — ${note}` : ""}`);
};

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fr-CD",
});
// Slow 3G, the way the Chrome dev tools profile defines it.
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 400,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const t0 = Date.now();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

/* 1. Landing: can the novice tell what this is and what to do? */
await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
step("landing page painted", Date.now() - t0);
await page.screenshot({ path: `${SHOTS}/novice-01-landing-360.png`, fullPage: false });

const firstScreen = await page.evaluate(() => {
  const vh = window.innerHeight;
  const visible = [...document.querySelectorAll("h1,h2,p,a,button")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.height > 0; })
    .map((el) => ({ tag: el.tagName, text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90) }))
    .filter((e) => e.text.length > 0);
  const actions = [...document.querySelectorAll("a,button")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.width * r.height > 0; })
    .map((el) => ({ text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
  return { visible: visible.slice(0, 14), actions: actions.slice(0, 14) };
});
console.log("    first screen says:", firstScreen.visible.map((v) => `${v.tag}:${v.text}`).join(" | ").slice(0, 400));
console.log("    tappable now:", firstScreen.actions.map((a) => `${a.text}(${a.w}x${a.h})`).join(", ").slice(0, 400));

const tooSmall = firstScreen.actions.filter((a) => a.text && (a.h < 44 || a.w < 44));
step("touch targets on the first screen", 0, tooSmall.length ? `${tooSmall.length} under 44 px: ${tooSmall.map((a) => `${a.text}(${a.w}x${a.h})`).join(", ").slice(0, 200)}` : "all at least 44 px");

const horizontal = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
step("no sideways scrolling at 360 px", 0, horizontal ? "FAIL: the page is wider than the screen" : "fits");

/* 2. The core promise: ask a health question and get usable guidance. */
const askStart = Date.now();
/*
 * What a person can actually tap: an element whose box is inside the 360 px
 * viewport. The off-canvas drawer's links are "visible" to a driver — rendered
 * and enabled, merely translated off-screen — and clicking one is something no
 * phone user can do without opening the drawer first. Asserting on them would
 * flatter the product.
 */
const onScreenHealth = await page.evaluate(() => {
  const vw = window.innerWidth;
  const hit = [...document.querySelectorAll('a[href="/sante"], a[href^="/sante"]')].find((el) => {
    const r = el.getBoundingClientRect();
    const labelled = (el.textContent ?? "").trim().length > 0;
    return labelled && r.left >= 0 && r.right <= vw && r.top >= 0 && r.width > 0 && r.height > 0;
  });
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  return { text: (hit.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60), y: Math.round(r.top + window.scrollY) };
});
const drawerOnly = onScreenHealth === null;
if (!drawerOnly) {
  await page.locator('a[href^="/sante"]').filter({ hasText: new RegExp(onScreenHealth.text.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click({ timeout: 30000 }).catch(async () => {
    await page.goto(`${base}/sante`, { waitUntil: "domcontentloaded", timeout: 120000 });
  });
} else {
  await page.goto(`${base}/sante`, { waitUntil: "domcontentloaded", timeout: 120000 });
}
const hasHealth = !drawerOnly;
await page.waitForLoadState("domcontentloaded");
step("reached the health page", Date.now() - askStart, hasHealth ? `by tapping "${onScreenHealth.text}" at y=${onScreenHealth.y}` : "NOTE: no link inside the 360 px viewport on the home page; reached by URL");
await page.screenshot({ path: `${SHOTS}/novice-02-sante-360.png` });

/*
 * Wait for the page to be interactive before judging it. A phone on slow 3G
 * paints the document before the client code has hydrated, and asserting in
 * that gap reports "nothing to type into" on a page that has a text box — which
 * would be a defect invented by the harness.
 */
// `:visible` matters: the drawer and the upload helper contribute hidden
// textareas, and .first() keeps selecting one of those rather than the box the
// person is looking at.
const box = page.locator("textarea:visible").first();
const canType = await box.waitFor({ state: "visible", timeout: 60000 }).then(() => 1).catch(() => 0);
step("a place to type the question is visible", 0, canType ? "textarea present" : "FAIL: nothing to type into");

let answerMs = -1;
if (canType) {
  await box.fill("Mon enfant a de la fièvre depuis deux jours et il tousse");
  const sendStart = Date.now();
  // The novice presses the obvious button, not a keyboard shortcut.
  const send = page.locator("button:visible").filter({ hasText: /envoyer|poser|demander|continuer/i }).first();
  if (await send.count()) await send.click({ timeout: 30000 });
  else await box.press("Enter");
  const appeared = await page
    .waitForSelector("text=/Ce qu'il faut faire|Ce que j'ai compris|conduite à tenir|centre de santé/i", { timeout: 180000 })
    .then(() => true)
    .catch(() => false);
  answerMs = Date.now() - sendStart;
  step("an answer the novice can act on appeared", answerMs, appeared ? "guidance text found" : "FAIL: no guidance within 180 s");
  await page.screenshot({ path: `${SHOTS}/novice-03-answer-360.png`, fullPage: true });

  const readable = await page.evaluate(() => {
    const main = document.querySelector("main");
    const text = (main?.textContent ?? "").replace(/\s+/g, " ");
    return {
      jargon: ["tenant", "workspace", "token", "webhook", "sync", "payload", "endpoint", "ACU", "p95"].filter((w) => text.toLowerCase().includes(w.toLowerCase())),
      length: text.length,
    };
  });
  step("no technical jargon in the answer", 0, readable.jargon.length ? `FAIL: ${readable.jargon.join(", ")}` : "none of the jargon words present");
}

/* 3. The emergency route: can they find what to do right now? */
const emStart = Date.now();
await page.goto(`${base}/urgence`, { waitUntil: "domcontentloaded", timeout: 120000 });
const emergency = await page.evaluate(() => (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 300));
step("the emergency page loads and says what to do", Date.now() - emStart, emergency.slice(0, 160));

/* 4. Language: can a Lingala speaker switch without reading French instructions? */
const langStart = Date.now();
await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
const switcher = page.locator('select, [role="combobox"], button:has-text("Français")').first();
const hasSwitcher = await switcher.count();
step("a language control is reachable from the home page", Date.now() - langStart, hasSwitcher ? "present" : "FAIL: none found");
if (hasSwitcher) {
  const tag = await switcher.evaluate((el) => el.tagName);
  if (tag === "SELECT") {
    await switcher.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => (document.querySelector("main")?.textContent ?? "").slice(0, 120));
    step("the page changes language when asked", 0, after.replace(/\s+/g, " ").slice(0, 110));
    await page.screenshot({ path: `${SHOTS}/novice-04-language-360.png` });
  }
}

/* 5. Coming back tomorrow: the sign-in page, in a novice's words.
      Read in French first — the previous step left the browser in Lingala, and a
      French-only regex would then "find" nothing and report a defect that is
      really a language change. */
await ctx.addCookies([{ name: "cvai_lang", value: "fr", url: base }]);
await page.goto(`${base}/connexion`, { waitUntil: "domcontentloaded", timeout: 120000 });
const signin = await page.evaluate(() => {
  const main = document.querySelector("main");
  const text = (main?.textContent ?? "").replace(/\s+/g, " ");
  const labels = [...document.querySelectorAll("label")].map((l) => (l.textContent ?? "").trim()).filter(Boolean);
  // Either the words, or a control that reveals them: both are a way out.
  const recovery =
    /oubli|perdu|aide|récupér|nimero|code/i.test(text) &&
    [...document.querySelectorAll("button,summary,a")].some((el) => /oubli|perdu|aide|récupér|kozanga|forget/i.test(el.textContent ?? ""));
  return { labels, recovery, text: text.slice(0, 200) };
});
step("sign-in asks for things a citizen has", 0, `labels: ${signin.labels.join(" / ") || "none"}`);
step("a way out if they have forgotten their code", 0, signin.recovery ? "recovery wording present" : "FAIL: nothing about a forgotten code");
await page.screenshot({ path: `${SHOTS}/novice-05-connexion-360.png` });

console.log(`\n  total time to the core value: ${answerMs >= 0 ? ((Date.now() - t0) / 1000).toFixed(1) : "not reached"} s (answer alone ${(answerMs / 1000).toFixed(1)} s)`);
console.log(`  page errors during the walk: ${errors.length ? errors.join(" | ").slice(0, 300) : "none"}`);
await browser.close();
