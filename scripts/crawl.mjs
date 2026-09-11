/**
 * Walks every page of a running instance as a signed-in platform administrator
 * and reports anything that would look broken to a user: a console error, a
 * failed request the page made for itself, an error boundary, or an internal
 * link that leads nowhere.
 *
 *   node scripts/crawl.mjs http://localhost:3000
 */
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const EXEC = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PHONE = process.env.CRAWL_PHONE ?? "+243900000001";
const PIN = process.env.CRAWL_PIN ?? "1234";
const CALLER_IP = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

const ROUTES = [
  "/", "/sante", "/agriculture", "/education", "/urgence", "/historique", "/messages",
  "/notifications", "/notifications/envoyer", "/parametres", "/rapports", "/recherche",
  "/ressources", "/langues", "/cas", "/cas/nouveau", "/tableau-de-bord",
  "/tableau-de-bord/sante", "/tableau-de-bord/agriculture", "/tableau-de-bord/education",
  "/admin", "/admin/audit", "/admin/utilisateurs", "/connexion", "/aide",
  "/blog", "/services", "/programme", "/gouvernance", "/financement", "/partenaires",
  "/acces", "/langues-nationales", "/contact", "/confidentialite", "/conditions",
  "/accessibilite",
];

const login = await fetch(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": CALLER_IP },
  body: JSON.stringify({ phone: PHONE, pin: PIN }),
});
const body = await login.json();
if (!body?.token) {
  console.error(`Could not sign in as ${PHONE}: ${JSON.stringify(body).slice(0, 200)}`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "x-forwarded-for": CALLER_IP },
});
await ctx.addCookies([{ name: "cvai_session", value: body.token, domain: new URL(base).hostname, path: "/" }]);

const problems = [];
const linkTargets = new Set();

for (const route of ROUTES) {
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === base) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  let status = 0;
  try {
    const res = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = res?.status() ?? 0;
    await page.waitForLoadState("load", { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(900);
  } catch (err) {
    problems.push({ route, kind: "navigation", detail: String(err).slice(0, 160) });
    await page.close();
    continue;
  }

  const text = await page.evaluate(() => document.body?.innerText ?? "");
  if (/Application error|Une erreur s'est produite|Something went wrong|Internal Server Error/i.test(text)) {
    problems.push({ route, kind: "error boundary", detail: text.slice(0, 140).replace(/\s+/g, " ") });
  }
  if (status >= 400) problems.push({ route, kind: "http", detail: String(status) });
  for (const e of errors) problems.push({ route, kind: "console", detail: e });
  for (const f of failed) problems.push({ route, kind: "request", detail: f });

  for (const href of await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""))) {
    if (href.startsWith("/") && !href.startsWith("//")) linkTargets.add(href.split("#")[0]);
  }

  const label = problems.some((p) => p.route === route) ? "ISSUES" : "ok    ";
  console.log(`  ${label} ${status} ${route}`);
  await page.close();
}

console.log(`\nChecking ${linkTargets.size} distinct internal link targets…`);
const broken = [];
for (const href of linkTargets) {
  const res = await fetch(`${base}${href}`, { headers: { cookie: `cvai_session=${body.token}`, "x-forwarded-for": CALLER_IP }, redirect: "manual" });
  if (res.status >= 400) broken.push(`${res.status} ${href}`);
}

await browser.close();

if (problems.length === 0 && broken.length === 0) {
  console.log(`\nNo console errors, no failed requests, no broken internal links across ${ROUTES.length} pages.`);
  process.exit(0);
}
console.log("\nProblems:");
for (const p of problems) console.log(`  ${p.route}  [${p.kind}]  ${p.detail}`);
for (const b of broken) console.log(`  broken link  ${b}`);
process.exit(1);
