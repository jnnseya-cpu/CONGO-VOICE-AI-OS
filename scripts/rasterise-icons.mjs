/**
 * Renders the SVG app icons to PNG. Android's install prompt and, more strictly,
 * iOS home-screen icons do not accept SVG, so a PWA that ships only vector icons
 * installs with a blank or letter tile on real handsets.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const EXEC = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const jobs = [
  { src: "public/icons/icon-192.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icons/icon-512.svg", out: "public/icons/icon-512.png", size: 512 },
  { src: "public/icons/maskable.svg", out: "public/icons/maskable-512.png", size: 512 },
  { src: "public/icons/icon-512.svg", out: "public/icons/apple-touch-icon.png", size: 180 },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
for (const job of jobs) {
  const svg = await fs.readFile(path.resolve(job.src), "utf8");
  const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;padding:0}svg{display:block;width:${job.size}px;height:${job.size}px}</style>${svg}`);
  await page.screenshot({ path: job.out, omitBackground: true });
  await page.close();
  console.log("wrote", job.out);
}
await browser.close();
