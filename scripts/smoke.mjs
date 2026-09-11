/**
 * Production smoke test: exercises a running server the way a citizen, a
 * community health worker and an attacker each would, and fails loudly.
 *
 *   node scripts/smoke.mjs http://localhost:3000
 *
 * It is deliberately not a unit test. It runs against the built server over
 * HTTP, so it catches what only appears once the thing is actually running:
 * missing headers, a migration that did not apply, a route that needs a
 * database connection it does not have, a lockout that never triggers.
 */
const base = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DEMO_PIN = process.env.SMOKE_PIN ?? "1234";
const STAFF_PHONE = process.env.SMOKE_PHONE ?? "+243900000003";

/**
 * Every call carries a forwarded address, because in production the platform
 * always sits behind exactly one proxy that sets it. A fresh address per run
 * also keeps a deliberate lockout from one run out of the way of the next.
 */
const CALLER_IP = process.env.SMOKE_CLIENT_IP ?? `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(path, { method = "GET", body, token, cookie, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "x-forwarded-for": CALLER_IP,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { res, json, text };
}

section("Reachability and probes");
{
  const { res, json } = await call("/api/v1/system/health");
  check("health probe answers ok", res.status === 200 && json?.status === "ok", `status ${res.status} ${json?.error ?? ""}`);
}
{
  const { res } = await call("/");
  check("home page renders", res.status === 200, `status ${res.status}`);
}

section("Security headers");
{
  const { res } = await call("/");
  const csp = res.headers.get("content-security-policy") ?? "";
  check("content security policy is present", csp.includes("default-src 'self'"), csp.slice(0, 60));
  check("policy refuses third-party frames and forms", csp.includes("frame-ancestors 'none'") && csp.includes("form-action 'self'"));
  check("framing is denied", res.headers.get("x-frame-options") === "DENY");
  check("content type sniffing is off", res.headers.get("x-content-type-options") === "nosniff");
  check("server software is not advertised", !res.headers.get("x-powered-by"));
  const { res: api } = await call("/api/v1/system/health");
  check("API answers are never cached by an intermediary", (api.headers.get("cache-control") ?? "").includes("no-store"));
}

section("Anonymous citizen journey");
let citizenToken;
let ordinaryCaseId = null;
{
  const { res, json } = await call("/api/v1/auth/login", { method: "POST", body: { anonymous: true, language: "fr", province: "Kinshasa" } });
  citizenToken = json?.token;
  check("anonymous session is issued", res.status === 200 && typeof citizenToken === "string", `status ${res.status}`);
  check("the session is anonymous and a citizen", json?.user?.anonymous === true && json?.user?.role === "citizen");
}
{
  const { res, json } = await call("/api/v1/interactions", {
    method: "POST",
    token: citizenToken,
    body: { module: "health", text: "Mon enfant a de la fièvre depuis deux jours et il tousse.", language: "fr", channel: "pwa" },
  });
  check("a health question is answered", res.status === 200 || res.status === 201, `status ${res.status} ${JSON.stringify(json?.error ?? "").slice(0, 120)}`);
  check("the answer is spoken back in words, not codes", typeof json?.responseText === "string" && json.responseText.length > 40, String(json?.responseText).slice(0, 80));
  check("the turn completed rather than failing over", json?.status === "completed", `status ${json?.status}`);
  ordinaryCaseId = json?.caseId ?? null;
  // The severity a rule assigned is never handed to the citizen: they get the
  // instruction, not a number. It is read below through the worker's view.
  check("no severity score is returned to the citizen", json?.riskLevel === undefined && json?.severity === undefined);
}
let emergency;
{
  const { res, json } = await call("/api/v1/interactions", {
    method: "POST",
    token: citizenToken,
    body: { module: "health", text: "Mon bébé convulse et ne répond plus, il ne peut pas téter.", language: "fr", channel: "pwa" },
  });
  emergency = json;
  check("a danger sign is accepted", res.status === 200 || res.status === 201, `status ${res.status}`);
  check("a danger sign opens a case", !!json?.caseId, JSON.stringify(json ?? {}).slice(0, 120));
  check(
    "the citizen is told to seek care immediately",
    /immédiatement|immediatement|urgence|sans attendre|tout de suite/i.test(String(json?.responseText ?? "")),
    String(json?.responseText ?? "").slice(0, 120),
  );
}

section("Staff sign-in and case visibility");
let staffToken;
{
  const { res, json } = await call("/api/v1/auth/login", { method: "POST", body: { phone: STAFF_PHONE, pin: DEMO_PIN } });
  staffToken = json?.token;
  check("a seeded health worker can sign in", res.status === 200 && !!staffToken, `status ${res.status} ${json?.error?.message ?? ""}`);
}
{
  const { res, json } = await call("/api/v1/cases?limit=20", { token: staffToken });
  check("the worker sees the case queue", res.status === 200 && Array.isArray(json?.cases), `status ${res.status}`);
  const ids = (json?.cases ?? []).map((c) => c.id);
  const opened = emergency?.caseId;
  check("the emergency just raised is in the queue", !opened || ids.includes(opened), `looking for ${opened}`);
}
{
  // The severity the deterministic rule assigned, read where it is meant to be
  // read: by the worker who has to act on it.
  const opened = emergency?.caseId;
  const { res, json } = opened ? await call(`/api/v1/cases/${opened}`, { token: staffToken }) : { res: { status: 0 }, json: undefined };
  const record = json?.case ?? json;
  check("the worker can open the case", res.status === 200, `status ${res.status}`);
  check(
    "the danger sign was graded critical by rule, not by the model",
    record?.severity === "critical" || record?.severityLevel === 4 || record?.riskLevel === 4,
    JSON.stringify({ severity: record?.severity, severityLevel: record?.severityLevel, riskLevel: record?.riskLevel }),
  );

  if (ordinaryCaseId && res.status === 200) {
    const { res: otherRes, json: ordinary } = await call(`/api/v1/cases/${ordinaryCaseId}`, { token: staffToken });
    const other = ordinary?.case ?? ordinary;
    check(
      "a two-day fever is graded below an emergency",
      otherRes.status === 200 && other?.severity !== "critical" && other?.severityLevel !== 4,
      JSON.stringify({ status: otherRes.status, severity: other?.severity, severityLevel: other?.severityLevel }),
    );
  }
}
{
  const { res } = await call("/api/v1/admin/stats", { token: staffToken });
  check("a health worker cannot read platform administration", res.status === 403, `status ${res.status}`);
}
{
  const { res } = await call("/api/v1/cases");
  check("an unauthenticated caller is refused the case queue", res.status === 401, `status ${res.status}`);
}

section("Session withdrawal");
{
  await call("/api/v1/auth/logout", { method: "POST", token: staffToken });
  const { res } = await call("/api/v1/cases?limit=1", { token: staffToken });
  check("a token stops working the moment its owner signs out", res.status === 401, `status ${res.status}`);
}

section("Demonstration data");
{
  const { res } = await call("/api/v1/admin/seed", { method: "POST" });
  check("the seed endpoint is not open to the public", res.status === 401 || res.status === 403, `status ${res.status}`);
}

section("Public surface");
for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/blog", "/blog/rss.xml", "/manifest.webmanifest", "/fonts/inter.css", "/icons/icon-512.png"]) {
  const { res } = await call(path);
  check(`${path} is served`, res.status === 200, `status ${res.status}`);
}

section("Sign-in lockout");
{
  // Run last and from an address of its own: a lock lasts fifteen minutes, and
  // locking the address this script is calling from would fail everything after
  // it. The account counter is the one that matters — it cannot be sidestepped
  // by changing a header, because it is keyed on the number being attacked.
  const attacker = { "x-forwarded-for": `203.0.113.${10 + Math.floor(Math.random() * 200)}` };
  const phone = process.env.SMOKE_LOCKOUT_PHONE ?? `+24390099${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const statuses = [];
  let sawLock = false;
  for (let i = 0; i < 8; i++) {
    const { res } = await call("/api/v1/auth/login", { method: "POST", body: { phone, pin: "9999" }, headers: attacker });
    statuses.push(res.status);
    if (res.status === 429) {
      sawLock = true;
      break;
    }
  }
  check("repeated wrong PINs lock the account", sawLock, `statuses ${statuses.join(",")}`);

  // From a completely different address, the same account is still locked.
  const { res: elsewhere } = await call("/api/v1/auth/login", {
    method: "POST",
    body: { phone, pin: "9999" },
    headers: { "x-forwarded-for": "198.51.100.44" },
  });
  check("the account stays locked from another address", elsewhere.status === 429, `status ${elsewhere.status}`);
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.log(`${failures} failed.`);
  process.exit(1);
}
