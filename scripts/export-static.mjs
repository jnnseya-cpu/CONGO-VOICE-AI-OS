/**
 * Renders a page of the running app into one self-contained HTML file (styles inlined,
 * scripts removed) for a shareable static preview of the design.
 * usage: node scripts/export-static.mjs http://localhost:3000/ out.html [sessionToken]
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
const [,, url, out, cookie] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
if (cookie) await ctx.addCookies([{ name: "cvai_session", value: cookie, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(600);
const html = await page.evaluate(async () => {
  const css = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (sheet.href && !sheet.href.startsWith(location.origin)) continue;
      css.push(Array.from(sheet.cssRules).map((r) => r.cssText).join("\n"));
    } catch { /* cross-origin */ }
  }
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll("script, link[rel=stylesheet], style, [data-nextjs-toast], nextjs-portal, #__next-build-watcher").forEach((n) => n.remove());
  // Forms and links stay visible but inert.
  clone.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", "#"));
  const style = document.createElement("style");
  style.textContent = css.join("\n");
  clone.querySelector("head").appendChild(style);
  return "<!doctype html>\n" + clone.outerHTML;
});
await fs.writeFile(out, html);
console.log("exported", out, (html.length / 1024).toFixed(0) + " KB");
await browser.close();
