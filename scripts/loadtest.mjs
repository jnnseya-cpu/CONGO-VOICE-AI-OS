#!/usr/bin/env node
/**
 * Load, measured rather than assumed.
 *
 *   node scripts/loadtest.mjs --url http://127.0.0.1:3210 --profile all
 *   node scripts/loadtest.mjs --url https://www.congovoicecd.com --profile read
 *
 * Reports p50, p95, p99, throughput and error rate per stage, and the stage at
 * which the error rate or latency stops being acceptable.
 *
 * Read this before quoting a number from it. Run against localhost it measures
 * this machine — a single container, an in-process PGlite database and the
 * offline AI provider — so the figures describe the application's own cost per
 * request with no network and no provider latency in them. That is a useful
 * floor and a genuine regression guard, and it is NOT a substitute for loading
 * the deployed service: Cloud Run's concurrency and cold starts, Cloud SQL's
 * connection limit and round trip, the load balancer, and the real latency of a
 * model call are all absent from it, and every one of them binds before the
 * application does. Label any figure from a local run as local.
 *
 * The --profile write stage spends money when pointed at a deployment with real
 * provider keys configured: each interaction is at least one model call. It
 * refuses to run against a non-local URL unless ALLOW_PAID=1 is set.
 */
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const BASE = (arg("url", "http://127.0.0.1:3210") ?? "").replace(/\/$/, "");
const PROFILE = arg("profile", "read");
const STAGES = (arg("stages", "1,5,10,25,50") ?? "").split(",").map(Number).filter((n) => n > 0);
const SECONDS = Number(arg("seconds", "10"));
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)/.test(BASE);

/** Launch targets. A number is a promise, not a wish; state them. */
const TARGETS = {
  readP95Ms: Number(arg("read-p95", "800")),
  writeP95Ms: Number(arg("write-p95", "4000")),
  maxErrorRate: Number(arg("max-error-rate", "0.01")),
};

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function anonymousToken() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ anonymous: true, language: "fr", consent: true }),
  });
  if (!res.ok) throw new Error(`anonymous login failed: ${res.status}`);
  const body = await res.json();
  return body.token ?? body.session?.token ?? body.accessToken;
}

const QUESTIONS = [
  "Mon enfant de 3 ans a de la fièvre depuis deux jours",
  "Quel engrais pour mon champ d'arachide sur sol sableux ?",
  "Je ne comprends pas les fractions",
  "Mtoto wangu ana homa na kikohozi",
  "Mwana na ngai azali na pousi mpe tembe",
];

/** One request. Returns {ms, ok, status}. */
async function once(kind, token, i) {
  const started = performance.now();
  try {
    let res;
    if (kind === "read") {
      res = await fetch(`${BASE}/api/v1/system/ready`, { headers: { "cache-control": "no-cache" } });
    } else if (kind === "page") {
      res = await fetch(`${BASE}/`, { headers: { "cache-control": "no-cache" } });
    } else {
      res = await fetch(`${BASE}/api/v1/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: QUESTIONS[i % QUESTIONS.length], wantsAudio: false }),
      });
    }
    // Drain the body: not draining understates latency and leaks sockets.
    await res.arrayBuffer();
    return { ms: performance.now() - started, ok: res.ok, status: res.status };
  } catch (err) {
    return { ms: performance.now() - started, ok: false, status: 0, error: String(err.message ?? err) };
  }
}

async function stage(kind, concurrency, seconds, token) {
  const deadline = Date.now() + seconds * 1000;
  const samples = [];
  let ok = 0;
  let failed = 0;
  const statuses = new Map();
  let counter = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      const r = await once(kind, token, counter++);
      samples.push(r.ms);
      if (r.ok) ok += 1;
      else failed += 1;
      statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
    }
  };
  const wallStart = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wall = (performance.now() - wallStart) / 1000;

  samples.sort((a, b) => a - b);
  const total = ok + failed;
  return {
    concurrency,
    requests: total,
    rps: total / wall,
    errorRate: total === 0 ? 1 : failed / total,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples.at(-1) ?? NaN,
    statuses: [...statuses.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(" "),
  };
}

function row(r) {
  const f = (n) => (Number.isFinite(n) ? n.toFixed(0).padStart(6) : "     -");
  return `  ${String(r.concurrency).padStart(4)} ${String(r.requests).padStart(8)} ${r.rps.toFixed(1).padStart(8)} ${(r.errorRate * 100).toFixed(2).padStart(7)}% ${f(r.p50)} ${f(r.p95)} ${f(r.p99)} ${f(r.max)}   ${r.statuses}`;
}

async function main() {
  if (!isLocal && (PROFILE === "write" || PROFILE === "all") && process.env.ALLOW_PAID !== "1") {
    console.error("Refusing: the write profile against a deployment calls paid AI providers per request.");
    console.error("Set ALLOW_PAID=1 if that is genuinely what you want, and watch the provider bill.");
    process.exit(2);
  }

  console.log(`target   ${BASE}${isLocal ? "  (LOCAL — see the note in this file before quoting these numbers)" : ""}`);
  console.log(`profile  ${PROFILE}`);
  console.log(`stages   ${STAGES.join(", ")} concurrent, ${SECONDS}s each`);
  console.log(`targets  read p95 < ${TARGETS.readP95Ms}ms · write p95 < ${TARGETS.writeP95Ms}ms · errors < ${(TARGETS.maxErrorRate * 100).toFixed(1)}%`);

  const kinds = PROFILE === "read" ? ["read", "page"] : PROFILE === "write" ? ["write"] : ["read", "page", "write"];
  let token = null;
  if (kinds.includes("write")) {
    token = await anonymousToken();
    console.log("auth     anonymous session obtained");
  }

  const breaking = {};
  for (const kind of kinds) {
    console.log(`\n${kind}`);
    console.log("  conc  requests      rps   errors    p50    p95    p99    max   statuses");
    for (const c of STAGES) {
      const r = await stage(kind, c, SECONDS, token);
      console.log(row(r));
      const budget = kind === "write" ? TARGETS.writeP95Ms : TARGETS.readP95Ms;
      if (!breaking[kind] && (r.errorRate > TARGETS.maxErrorRate || r.p95 > budget)) {
        breaking[kind] = { concurrency: c, why: r.errorRate > TARGETS.maxErrorRate ? `errors ${(r.errorRate * 100).toFixed(2)}%` : `p95 ${r.p95.toFixed(0)}ms` };
      }
    }
  }

  console.log("\nresult");
  for (const kind of kinds) {
    if (breaking[kind]) console.log(`  ${kind}: first stage outside target at ${breaking[kind].concurrency} concurrent (${breaking[kind].why})`);
    else console.log(`  ${kind}: within target at every stage up to ${STAGES.at(-1)} concurrent`);
  }
  if (isLocal) {
    console.log("\n  These are local figures. Cloud Run concurrency and cold starts, the Cloud SQL");
    console.log("  connection limit and round trip, the load balancer and real provider latency are");
    console.log("  all absent, and each of them binds before the application does. Do not present");
    console.log("  this as the deployed service's capacity.");
  }
  process.exit(Object.keys(breaking).length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
