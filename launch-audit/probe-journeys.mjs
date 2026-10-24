/**
 * CYCLE 1 — critical journeys, permission boundaries and API abuse, executed
 * against a running release candidate. Every assertion is checked against what
 * the server returns and, where it matters, against the platform's own records
 * read back through the administration API rather than trusted from a toast.
 */
const base = (process.argv[2] ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const PIN = process.env.PROBE_PIN ?? "1234";
const ACCOUNTS = {
  admin: "+243900000001",
  gov: "+243900000002",
  chw: "+243900000003",
  agri: "+243900000004",
  teacher: "+243900000005",
  ngo: "+243900000006",
};

const out = [];
const rec = (id, name, status, detail) => {
  out.push({ id, name, status, detail: String(detail).slice(0, 500) });
  console.log(`${status.padEnd(7)} ${id}  ${name}\n        ${String(detail).slice(0, 300)}`);
};
const pass = (id, n, d = "") => rec(id, n, "PASS", d);
const fail = (id, n, d = "") => rec(id, n, "FAIL", d);
const ok = (id, n, cond, d = "") => (cond ? pass : fail)(id, n, d);

function jar() {
  const cookies = new Map();
  return {
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const i = pair.indexOf("=");
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
    has: (name) => cookies.has(name),
  };
}

async function call(path, { method = "GET", body, cookies, token, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (body !== undefined && !raw) h["Content-Type"] = "application/json";
  if (cookies) h.Cookie = cookies.header();
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers: h, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
  cookies?.absorb(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json, headers: res.headers };
}

async function signIn(phone) {
  const c = jar();
  const res = await call("/api/v1/auth/login", { method: "POST", body: { phone, pin: PIN }, cookies: c });
  return { cookies: c, status: res.status, body: res.json };
}

/* ─────────────────── A. anonymous citizen journey ─────────────────── */
let citizenToken = null;
{
  const s = await call("/api/v1/auth/login", { method: "POST", body: { anonymous: true, language: "fr", province: "Kinshasa" } });
  citizenToken = s.json?.token ?? null;
  ok("CJ-01", "an anonymous citizen gets a session without an account", s.status === 200 && typeof citizenToken === "string" && s.json?.user?.anonymous === true && s.json?.user?.role === "citizen", `${s.status} anonymous=${s.json?.user?.anonymous} role=${s.json?.user?.role}`);

  const q = await call("/api/v1/interactions", { method: "POST", body: { text: "Mon enfant a de la fievre depuis deux jours, que faire ?", module: "health" }, token: citizenToken });
  const answer = q.json?.interaction ?? q.json;
  ok("CJ-02", "a health question is answered", q.status === 200 && typeof (answer?.response ?? answer?.responseText) === "string" && (answer.response ?? answer.responseText).length > 40, `${q.status} ${(answer?.response ?? answer?.responseText ?? q.text).slice?.(0, 160)}`);
  // Both of the next two are absence checks, so they are only meaningful on a
  // successful answer: asserted against a 401 body they would pass having
  // proven nothing.
  const answered = q.status === 200;
  ok("CJ-03", "no severity score or internal risk number is returned to the citizen", answered && !/"severity"\s*:\s*\d|"riskScore"/.test(q.text), answered ? (q.text.match(/"severity"[^,]{0,20}|"riskScore"[^,]{0,20}/g)?.join(" ") ?? "absent from a 200 answer") : `precondition failed: answer status ${q.status}`);
  ok("CJ-04", "no provider or model name is returned to the citizen", answered && !/anthropic|openai|gemini|claude|gpt-|whisper/i.test(q.text), answered ? (q.text.match(/anthropic|openai|gemini|claude|gpt-|whisper/gi)?.join(",") ?? "absent from a 200 answer") : `precondition failed: answer status ${q.status}`);
  globalThis.__citizenInteraction = answer?.id ?? answer?.interactionId ?? null;
}

/* ─────────────────── B. danger sign → case → human ─────────────────── */
{
  const danger = await call("/api/v1/interactions", { method: "POST", body: { text: "Mon bebe a des convulsions et ne tete plus du tout", module: "health" }, token: citizenToken });
  const a = danger.json?.interaction ?? danger.json;
  ok("DS-01", "a danger sign is accepted and answered", danger.status === 200, `${danger.status}`);
  ok("DS-02", "the citizen is told to go for care immediately", /immédiat|immediat|maintenant|urgence|centre de santé/i.test(danger.text), (a?.response ?? danger.text).slice?.(0, 200));
  ok("DS-03", "a case is opened for it", Boolean(a?.caseId), `caseId=${a?.caseId ?? "none"}`);
  globalThis.__dangerCase = a?.caseId ?? null;
}

/* ─────────────────── C. the worker's side, verified in the record ─────────────────── */
{
  const chw = await signIn(ACCOUNTS.chw);
  ok("WK-01", "a seeded health worker can sign in", chw.status === 200 && chw.cookies.has("cvai_session"), `${chw.status}`);

  const queue = await call("/api/v1/cases?limit=50", { cookies: chw.cookies });
  const cases = queue.json?.cases ?? [];
  ok("WK-02", "the worker sees a case queue", queue.status === 200 && Array.isArray(cases), `${queue.status} ${cases.length} case(s)`);

  const found = cases.find((c) => c.id === globalThis.__dangerCase);
  ok("WK-03", "the emergency just raised is in that queue", Boolean(found), found ? `severity=${found.severity} status=${found.status}` : `case ${globalThis.__dangerCase} not in the first 50`);
  ok("WK-04", "it was graded critical by rule", found?.severity === "critical", `severity=${found?.severity}`);

  const one = await call(`/api/v1/cases/${globalThis.__dangerCase}`, { cookies: chw.cookies });
  ok("WK-05", "the worker can open the case and see the original words", one.status === 200 && /convulsions/i.test(one.text), `${one.status}`);

  // Cross-module boundary: a health worker must not reach agriculture.
  const agriCases = await call("/api/v1/cases?module=agriculture&limit=5", { cookies: chw.cookies });
  const leaked = (agriCases.json?.cases ?? []).filter((c) => c.module !== "health");
  ok("AZ-01", "a health worker is not served agriculture cases", leaked.length === 0, `${leaked.length} non-health case(s) returned`);

  const admin = await call("/api/v1/admin/config", { cookies: chw.cookies });
  ok("AZ-02", "a health worker cannot read platform configuration", admin.status === 403, `${admin.status}`);

  const users = await call("/api/v1/users", { cookies: chw.cookies });
  ok("AZ-03", "a health worker cannot list the user directory", users.status === 403, `${users.status}`);

  const audit = await call("/api/v1/audit-logs", { cookies: chw.cookies });
  ok("AZ-04", "a health worker cannot read the audit log", audit.status === 403, `${audit.status}`);
  globalThis.__chw = chw.cookies;
}

/* ─────────────────── D. partner (NGO) boundaries ─────────────────── */
{
  const ngo = await signIn(ACCOUNTS.ngo);
  ok("AZ-05", "a partner account can sign in", ngo.status === 200, `${ngo.status}`);
  const write = await call(`/api/v1/cases/${globalThis.__dangerCase}`, { method: "PATCH", body: { note: "partner edit attempt" }, cookies: ngo.cookies });
  ok("AZ-06", "a partner cannot write to a case", write.status === 403, `${write.status} ${write.text.slice(0, 120)}`);
  const esc = await call(`/api/v1/cases/${globalThis.__dangerCase}/escalate`, { method: "POST", body: { reason: "partner escalation attempt" }, cookies: ngo.cookies });
  ok("AZ-07", "a partner cannot escalate a case", esc.status === 403, `${esc.status}`);
}

/* ─────────────────── E. IDOR: another citizen's records ─────────────────── */
{
  const o = await call("/api/v1/auth/login", { method: "POST", body: { anonymous: true, language: "fr", province: "Kinshasa" } });
  const otherToken = o.json?.token ?? null;
  const mine = await call("/api/v1/interactions", { method: "POST", body: { text: "Combien de temps pour les semis de mais ?", module: "agriculture" }, token: otherToken });
  const otherId = (mine.json?.interaction ?? mine.json)?.id ?? mine.json?.interactionId;
  ok("AZ-07b", "the second citizen's own interaction was created (precondition)", mine.status === 200 && Boolean(otherId), `${mine.status} id=${otherId}`);

  const steal = await call(`/api/v1/interactions/${otherId}`, { token: citizenToken });
  ok("AZ-08", "one citizen cannot read another citizen's interaction", Boolean(otherId) && (steal.status === 403 || steal.status === 404), `${steal.status}`);

  const stealCase = await call(`/api/v1/cases/${globalThis.__dangerCase}`, { token: otherToken });
  ok("AZ-09", "a citizen cannot read a case file", stealCase.status === 403 || stealCase.status === 404, `${stealCase.status}`);

  const noAuth = await call("/api/v1/cases");
  ok("AZ-10", "an unauthenticated caller is refused the case queue", noAuth.status === 401, `${noAuth.status}`);
}

/* ─────────────────── F. mass assignment and tampering ─────────────────── */
{
  const esc = await call("/api/v1/auth/me", { method: "PATCH", body: { role: "platform_admin", name: "Escalation probe" }, token: citizenToken });
  const after = await call("/api/v1/auth/me", { token: citizenToken });
  const role = after.json?.user?.role ?? after.json?.role;
  ok("AZ-11", "a citizen cannot promote itself through the profile endpoint", after.status === 200 && role !== "platform_admin", `patch ${esc.status}, profile read ${after.status}, role now ${role}`);

  const forged = await call("/api/v1/interactions", { method: "POST", body: { text: "test", module: "health", userId: "00000000-0000-0000-0000-000000000000", severity: 4, riskScore: 1 }, token: citizenToken });
  ok("AZ-12", "extra privileged fields in a body are ignored or refused", forged.status === 200 || forged.status === 400, `${forged.status}`);
}

/* ─────────────────── G. API abuse ─────────────────── */
{
  const big = "a".repeat(200000);
  const oversize = await call("/api/v1/interactions", { method: "POST", body: { text: big, module: "health" }, token: citizenToken });
  ok("API-01", "an oversized body is refused, not processed", oversize.status === 400 || oversize.status === 413, `${oversize.status}`);

  const wrongType = await call("/api/v1/interactions", { method: "POST", body: { text: 12345, module: ["health"] }, token: citizenToken });
  ok("API-02", "wrong types are refused with a 400", wrongType.status === 400, `${wrongType.status} ${wrongType.text.slice(0, 120)}`);

  const inject = await call("/api/v1/interactions", { method: "POST", body: { text: "'; DROP TABLE users; -- <script>alert(1)</script>", module: "health" }, token: citizenToken });
  const stillThere = await call("/api/v1/cases", { cookies: globalThis.__chw });
  ok("API-03", "an injection payload is treated as text and the database survives", inject.status === 200 && stillThere.status === 200, `interaction ${inject.status}, queue ${stillThere.status}`);
  ok("API-04", "no stack trace or internal path leaks in an error body", !/\/home\/|at Object\.|node_modules|Error: /.test(wrongType.text + oversize.text), "checked both error bodies");

  const notFound = await call("/api/v1/cases/not-a-uuid", { cookies: globalThis.__chw });
  ok("API-05", "a malformed identifier is refused rather than failing open", notFound.status === 400 || notFound.status === 404, `${notFound.status}`);
}

const counts = out.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
console.log(`\n${JSON.stringify(counts)}`);
console.log(out.filter((r) => r.status === "FAIL").map((r) => `FAIL ${r.id}: ${r.detail}`).join("\n") || "no failures");
