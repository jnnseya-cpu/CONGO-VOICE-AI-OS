/**
 * The check you run against a deployed origin before you send anyone to it.
 *
 *   node scripts/preflight.mjs https://congovoicecd.com
 *
 * Everything here has been got wrong at least once by somebody: a service that
 * answers on one origin while believing it lives on another, a webhook that
 * fails signature validation because the URL it was called on is not the URL it
 * thinks it has, a readiness probe that is green because nothing checks whether
 * an escalation could actually reach a person.
 *
 * It makes no assumptions about credentials: every check is one an anonymous
 * caller can make, which is also the point — anything it can see, so can
 * anyone.
 */
const raw = process.argv[2];
if (!raw) {
  console.error("usage: node scripts/preflight.mjs https://your-domain");
  process.exit(1);
}
const base = raw.replace(/\/$/, "");
const origin = new URL(base).origin;
const host = new URL(base).host;

const results = [];
function record(ok, name, detail = "") {
  results.push({ ok, name, detail });
  console.log(`  ${ok ? "ok    " : "FAIL  "} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function get(path, init = {}) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", ...init });
  const text = res.headers.get("content-type")?.includes("json") || res.status >= 400 ? await res.text().catch(() => "") : await res.text();
  return { res, text };
}

console.log(`\nPreflight against ${base}\n`);

/* ── 1. It is alive, and able to do the job ──────────────────────────────── */
try {
  const { res, text } = await get("/api/v1/system/health");
  const body = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  })();
  if (res.status === 200) {
    record(true, "readiness probe", "ok");
  } else {
    const failing = (body.failing ?? []).map((c) => `${c.id}: ${c.detail}`).join(" | ");
    record(false, "readiness probe", `${res.status} ${failing || text.slice(0, 200)}`);
  }
} catch (err) {
  record(false, "readiness probe", String(err).slice(0, 160));
}

/* ── 2. The origin it serves is the origin it believes in ────────────────── */
try {
  const { res, text } = await get("/");
  record(res.status === 200, "home page", String(res.status));
  const canonical = text.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1];
  const ogUrl = text.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i)?.[1];
  for (const [name, value] of [["canonical link", canonical], ["og:url", ogUrl]]) {
    if (!value) record(false, name, "absent");
    else record(new URL(value).origin === origin, name, value);
  }
} catch (err) {
  record(false, "home page", String(err).slice(0, 160));
}

for (const path of ["/sitemap.xml", "/robots.txt"]) {
  try {
    const { res, text } = await get(path);
    const mentionsOrigin = text.includes(origin);
    record(res.status === 200 && mentionsOrigin, path, res.status === 200 ? (mentionsOrigin ? "points at this origin" : "points somewhere else") : String(res.status));
  } catch (err) {
    record(false, path, String(err).slice(0, 160));
  }
}

/* ── 3. Transport ────────────────────────────────────────────────────────── */
if (base.startsWith("https://")) {
  try {
    const res = await fetch(`http://${host}/`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    record(res.status >= 300 && res.status < 400 && location.startsWith("https://"), "http redirects to https", `${res.status} ${location}`);
  } catch {
    // A platform that refuses plain HTTP outright is also a correct answer.
    record(true, "http redirects to https", "plain http refused");
  }
} else {
  record(false, "transport", "the origin is not https; citizens' answers would travel in clear");
}

/* ── 4. Headers a public service should not be missing ───────────────────── */
try {
  const { res } = await get("/");
  const h = (n) => res.headers.get(n);
  record(Boolean(h("content-security-policy")), "content-security-policy", h("content-security-policy")?.slice(0, 60) ?? "absent");
  record(Boolean(h("strict-transport-security")) || !base.startsWith("https://"), "strict-transport-security", h("strict-transport-security") ?? "absent");
  record(h("x-content-type-options") === "nosniff", "x-content-type-options", h("x-content-type-options") ?? "absent");
  record(Boolean(h("referrer-policy")), "referrer-policy", h("referrer-policy") ?? "absent");
} catch (err) {
  record(false, "security headers", String(err).slice(0, 160));
}

/* ── 5. Nothing private is answering an anonymous caller ─────────────────── */
for (const path of ["/api/v1/admin/status", "/api/v1/audit-logs", "/api/v1/cases", "/api/v1/review/submissions"]) {
  try {
    const { res } = await get(path);
    record(res.status === 401 || res.status === 403, `${path} refuses an anonymous caller`, String(res.status));
  } catch (err) {
    record(false, path, String(err).slice(0, 160));
  }
}

/* ── 6. The telephony webhook is reachable and refuses an unsigned call ──── */
try {
  const res = await fetch(`${base}/api/hooks/ivr/twilio`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "CallSid=preflight&From=%2B243000000000",
    redirect: "manual",
  });
  // 403 means signature validation is on and working. 200 means it is off,
  // which is correct only where no auth token is configured at all.
  record(res.status === 403 || res.status === 200, "IVR webhook reachable", `${res.status}${res.status === 200 ? " (signature validation not enforced — set TWILIO_AUTH_TOKEN)" : ""}`);
} catch (err) {
  record(false, "IVR webhook reachable", String(err).slice(0, 160));
}

/* ── 7. No development data on a public origin ───────────────────────────── */
try {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "+243900000001", pin: "1234" }),
  });
  const body = await res.json().catch(() => ({}));
  record(!body?.token, "seeded demo administrator cannot sign in", body?.token ? "PIN 1234 still works — reseed or disable" : "refused");
} catch (err) {
  record(false, "seeded demo administrator cannot sign in", String(err).slice(0, 160));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nNot ready:");
  for (const f of failed) console.log(`  ${f.name} — ${f.detail}`);
  process.exit(1);
}
console.log("Ready to receive traffic on this origin.");
