/**
 * CYCLE 1 — failure injection and recovery, executed.
 *
 * The question is not whether a dependency can fail; it is what a citizen is
 * told when it does, and whether the platform comes back without help.
 */
const base = (process.argv[2] ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const CRON = process.env.CRON_SECRET;
const out = [];
const rec = (id, name, status, detail) => {
  out.push({ id, name, status, detail: String(detail).slice(0, 400) });
  console.log(`${status.padEnd(7)} ${id}  ${name}\n        ${String(detail).slice(0, 300)}`);
};
const H = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const login = async (phone) => (await (await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, pin: "1234" }) })).json()).token;
const anon = async () => (await (await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymous: true, language: "fr", province: "Kinshasa" }) })).json()).token;

/* 1. No AI provider at all — the state this whole run is in. A danger sign
      must still produce the emergency instruction and a case. */
{
  const token = await anon();
  const r = await (await fetch(`${base}/api/v1/interactions`, { method: "POST", headers: H(token), body: JSON.stringify({ text: "Mon bebe ne respire presque plus", module: "health" }) })).json();
  rec("RS-01", "with no AI provider configured, a danger sign still escalates", /immédiat|maintenant|centre de santé/i.test(r.responseText ?? "") && Boolean(r.caseId) ? "PASS" : "FAIL", `case=${r.caseId} text=${(r.responseText ?? "").slice(0, 110)}`);
}

/* 2. A dependency that answers slowly or not at all: the health probe is the
      platform's own account of what is broken. It must be honest. */
{
  const h = await fetch(`${base}/api/v1/system/health`);
  const body = await h.json();
  const ids = (body.failing ?? []).map((f) => f.id);
  rec("RS-02", "the platform reports its own degradation rather than claiming health", h.status === 503 && ids.length > 0 ? "PASS" : "FAIL", `${h.status} failing=${ids.join(", ")}`);
  /*
   * The check identifiers are meant to be public; the explanations are not. So
   * this looks for the things a detail would contain — a provider name, an
   * environment variable's value, a "not set" phrase, a staleness figure — and
   * not for words that merely appear inside an identifier such as
   * "deployment_jurisdiction_declared".
   */
  const serialised = JSON.stringify(body);
  const leaks = [
    /anthropic|openai|gemini|google_tts|twilio|africastalking/i,
    /non défini|non defini|not set|absente/i,
    /Juridictions autorisées|Hébergement déclaré/i,
    /\bdétail|\bdetail/i,
    /il y a \d+ min/i,
  ].filter((re) => re.test(serialised));
  rec("RS-03", "the public degradation report carries identifiers only, not explanations", leaks.length === 0 ? "PASS" : "FAIL", leaks.length ? `leaked pattern(s): ${leaks.map(String).join(" ")}` : `body is ${serialised.slice(0, 160)}`);
}

/* 3. The readiness probe answers a different question and must stay green, or
      the container is killed by its own orchestrator. */
{
  const r = await fetch(`${base}/api/v1/system/ready`);
  rec("RS-04", "the container's own readiness probe is green while the programme is degraded", r.status === 200 ? "PASS" : "FAIL", `${r.status} ${(await r.text()).slice(0, 120)}`);
}

/* 4. The scheduler is a single point of failure for reminders, SLA sweeps,
      retention and audit verification. A stale scheduler must be visible. */
{
  const run = await fetch(`${base}/api/v1/workflow/run`, { method: "POST", headers: { "x-cron-secret": CRON ?? "" } });
  const body = await run.json().catch(() => null);
  rec("RS-05", "the scheduler runs and reports what it did", run.status === 200 && body?.startedAt ? "PASS" : "FAIL", `${run.status} sla=${body?.slaBreaches} reminders=${JSON.stringify(body?.reminders)} audit=${JSON.stringify(body?.auditChain ?? body?.audit ?? "n/a").slice(0, 80)}`);

  const forged = await fetch(`${base}/api/v1/workflow/run`, { method: "POST", headers: { "x-cron-secret": "not-the-secret" } });
  rec("RS-06", "the scheduler refuses a caller without its secret", forged.status === 401 ? "PASS" : "FAIL", `${forged.status}`);

  const none = await fetch(`${base}/api/v1/workflow/run`, { method: "POST" });
  rec("RS-07", "the scheduler refuses an anonymous caller", none.status === 401 ? "PASS" : "FAIL", `${none.status}`);
}

/* 5. Retries and duplicate submission: the same turn sent twice with one
      idempotency key must produce one interaction, not two. */
{
  const token = await anon();
  const key = `probe-${Date.now()}`;
  const body = JSON.stringify({ text: "Combien de fois faut-il arroser les semis ?", module: "agriculture" });
  const a = await (await fetch(`${base}/api/v1/interactions`, { method: "POST", headers: { ...H(token), "Idempotency-Key": key }, body })).json();
  const b = await (await fetch(`${base}/api/v1/interactions`, { method: "POST", headers: { ...H(token), "Idempotency-Key": key }, body })).json();
  rec("RS-08", "a duplicate submission under one key yields one interaction", a.interactionId && a.interactionId === b.interactionId ? "PASS" : "FAIL", `first=${a.interactionId} second=${b.interactionId}`);
}

/* 6. Concurrency on the money-adjacent path: ten simultaneous turns must all be
      metered, with no lost ledger rows. */
{
  const admin = await login("+243900000001");
  const before = await (await fetch(`${base}/api/v1/metering/acu`, { headers: H(admin) })).json();
  const token = await anon();
  const burst = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      fetch(`${base}/api/v1/interactions`, { method: "POST", headers: H(token), body: JSON.stringify({ text: `Question simultanee numero ${i}`, module: "general" }) }).then((r) => r.status),
    ),
  );
  const after = await (await fetch(`${base}/api/v1/metering/acu`, { headers: H(admin) })).json();
  const calls = (after.byTask ?? []).reduce((s, r) => s + Number(r.calls ?? 0), 0) - (before.byTask ?? []).reduce((s, r) => s + Number(r.calls ?? 0), 0);
  rec("RS-09", "ten simultaneous turns are all served", burst.every((s) => s === 200) ? "PASS" : "FAIL", `statuses: ${[...new Set(burst)].join(",")}`);
  rec("RS-10", "every served turn left a metering row", calls >= 10 ? "PASS" : "PARTIAL", `${calls} new metered call(s) for 10 turns`);
}

const counts = out.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
console.log(`\n${JSON.stringify(counts)}`);
