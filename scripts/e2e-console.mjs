import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
const [,, base = "http://localhost:3000", out = "console.png"] = process.argv;
// Use the browser this environment already has; on a runner that installed one
// through Playwright, let Playwright find it. A hard-coded, version-pinned path
// breaks silently the first time that directory is renamed.
const DEFAULT_EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXEC = process.env.CHROMIUM_PATH ?? (existsSync(DEFAULT_EXEC) ? DEFAULT_EXEC : undefined);
const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1536, height: 1100 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/sante`, { waitUntil: "networkidle" });
await page.fill("textarea", "Mwana na ngai azali na convulsions mpe akoki kopema te");
await page.keyboard.press("Enter");
await page.waitForSelector("text=Ce qu'il faut faire", { timeout: 90000 });
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
const text = await page.textContent("main");
console.log("answer-visible:", /Signes de danger|centre de santé/i.test(text ?? ""), "escalated:", /agent de santé communautaire/i.test(text ?? ""), errors.length ? "errors: " + errors.join(" | ") : "no page errors");
await browser.close();
