/**
 * Automated WCAG 2.2 AA conformance check (NFR-008, NFR-U-01).
 *
 * Runs axe-core against every page of a running instance, signed in as a
 * platform administrator so the staff portals are covered as well as the
 * citizen PWA. Any violation at level A or AA fails the run.
 *
 * What this proves and what it does not: automated rules catch contrast,
 * labelling, landmark, name/role/value and keyboard-reachability defects. They
 * do not catch whether a screen makes sense when it is read aloud. The
 * specification also asks for voice-specific usability testing with citizens,
 * which is fieldwork and cannot be run here.
 *
 *   node scripts/a11y.mjs http://localhost:3000
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
// Use the browser this environment already has; on a runner that installed one
// through Playwright, let Playwright find it.
const DEFAULT_EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXEC = process.env.CHROMIUM_PATH ?? (existsSync(DEFAULT_EXEC) ? DEFAULT_EXEC : undefined);
const PHONE = process.env.CRAWL_PHONE ?? "+243900000001";
const PIN = process.env.CRAWL_PIN ?? "1234";
const CALLER_IP = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

/** Level A and AA, including the 2.1 and 2.2 additions the specification names. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const ROUTES = [
  "/", "/sante", "/agriculture", "/education", "/urgence", "/historique", "/messages",
  "/notifications", "/notifications/envoyer", "/parametres", "/rapports", "/recherche",
  "/ressources", "/langues", "/cas", "/cas/nouveau", "/tableau-de-bord",
  "/tableau-de-bord/sante", "/tableau-de-bord/agriculture", "/tableau-de-bord/education",
  "/admin", "/admin/audit", "/admin/utilisateurs", "/admin/comite", "/connexion", "/aide",
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

const browser = await chromium.launch({ ...(EXEC ? { executablePath: EXEC } : {}), args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "x-forwarded-for": CALLER_IP },
});
await ctx.addCookies([{ name: "cvai_session", value: body.token, domain: new URL(base).hostname, path: "/" }]);

const failures = [];
let checked = 0;

for (const route of ROUTES) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("load", { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(600);
  } catch (err) {
    failures.push({ route, id: "navigation", impact: "blocker", help: String(err).slice(0, 140), nodes: [] });
    await page.close();
    continue;
  }

  await page.addScriptTag({ content: AXE_SOURCE });
  const result = await page.evaluate(
    async (tags) => await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }),
    TAGS,
  );

  checked += 1;
  const violations = result.violations ?? [];
  for (const v of violations) {
    failures.push({
      route,
      id: v.id,
      impact: v.impact ?? "unknown",
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => {
        const data = n.any?.[0]?.data ?? {};
        const ratio = data.contrastRatio
          ? `  ${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}:1, needs ${data.expectedContrastRatio}`
          : "";
        return `${n.target.join(" ")}${ratio}`;
      }),
    });
  }
  console.log(`  ${violations.length === 0 ? "ok    " : "FAIL  "} ${route}${violations.length ? `  (${violations.map((v) => v.id).join(", ")})` : ""}`);
  await page.close();
}

await browser.close();

if (failures.length === 0) {
  console.log(`\nNo WCAG 2.2 A/AA violations on ${checked} pages (axe-core, tags: ${TAGS.join(", ")}).`);
  console.log("Voice-specific usability testing with citizens is fieldwork and is not covered by this check.");
  process.exit(0);
}

console.log(`\n${failures.length} violations across ${new Set(failures.map((f) => f.route)).size} pages:`);
for (const f of failures) {
  console.log(`  ${f.route}  [${f.impact}] ${f.id}: ${f.help}`);
  for (const n of f.nodes) console.log(`      ${n}`);
}
process.exit(1);
