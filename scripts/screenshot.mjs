import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
const [,, url, out, width = "1536", height = "1024", cookie] = process.argv;
// Use the browser this environment already has; on a runner that installed one
// through Playwright, let Playwright find it. A hard-coded, version-pinned path
// breaks silently the first time that directory is renamed.
const DEFAULT_EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXEC = process.env.CHROMIUM_PATH ?? (existsSync(DEFAULT_EXEC) ? DEFAULT_EXEC : undefined);
const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
if (cookie) await ctx.addCookies([{ name: "cvai_session", value: cookie, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// "networkidle" never settles once the service worker is registered, so wait
// for the document and then give the page a moment to paint.
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForLoadState("load", { timeout: 30000 }).catch(() => undefined);
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: process.env.FULL === "1" });
console.log("saved", out, errors.length ? "errors: " + errors.slice(0, 5).join(" | ") : "no console errors");
await browser.close();
