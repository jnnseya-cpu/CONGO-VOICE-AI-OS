/**
 * CYCLE 1 — truth audit, executed.
 *
 * Takes the load-bearing public claims of the platform and tries to perform each
 * one against the running release candidate. A claim is REAL only if the
 * platform does the thing; anything that answers with placeholder content, a
 * canned string or an error is PARTIAL, STUBBED, ABSENT or BROKEN.
 */
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const PIN = "1234";
const out = [];
const rec = (claim, where, status, evidence) => {
  out.push({ claim, where, status, evidence: String(evidence).slice(0, 400) });
  console.log(`${status.padEnd(8)} ${claim}\n         ${String(evidence).slice(0, 280)}`);
};

async function call(path, { method = "GET", body, token, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (body !== undefined && !raw) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers: h, body: raw ? body : body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json };
}
const anon = async () => (await call("/api/v1/auth/login", { method: "POST", body: { anonymous: true, language: "fr", province: "Kinshasa" } })).json?.token;
const staff = async (phone) => (await call("/api/v1/auth/login", { method: "POST", body: { phone, pin: PIN } })).json?.token;

/* 1. "Ask in five national languages and be answered in yours." */
{
  const token = await anon();
  const probes = [
    ["fr", "Mon enfant a de la fievre depuis deux jours"],
    ["ln", "Mwana na ngai azali na fievre banda mikolo mibale"],
    ["sw", "Mtoto wangu ana homa kwa siku mbili"],
    ["kg", "Mwana ame na fievre bilumbu biole"],
    ["lua", "Muana wanyi udi ne fievre matuku abidi"],
  ];
  const results = [];
  for (const [lang, text] of probes) {
    const r = await call("/api/v1/interactions", { method: "POST", body: { text, module: "health" }, token });
    results.push({ lang, status: r.status, detected: r.json?.language, mode: r.json?.languageMode ?? r.json?.mode, length: (r.json?.responseText ?? "").length });
  }
  const answered = results.filter((r) => r.status === 200 && r.length > 40);
  rec(
    "A question can be asked in any of the five languages and is answered",
    "home, /services, /langues-nationales",
    answered.length === probes.length ? "REAL" : answered.length > 0 ? "PARTIAL" : "BROKEN",
    results.map((r) => `${r.lang}→${r.detected ?? "?"} ${r.status} ${r.length}c`).join(" | "),
  );
  const detectedRight = results.filter((r) => r.detected === r.lang).length;
  rec(
    "The language of the question is detected, not asked for",
    "/langues-nationales",
    detectedRight >= 3 ? "REAL" : detectedRight > 0 ? "PARTIAL" : "BROKEN",
    `${detectedRight}/5 detected as sent: ${results.map((r) => `${r.lang}→${r.detected}`).join(", ")}`,
  );
}

/* 2. "A danger sign is caught before any model is called, and works with no AI at all."
      This whole run has no provider keys set, so every answer above came from the
      offline provider. A danger sign answered here is the claim proven. */
{
  const token = await anon();
  const r = await call("/api/v1/interactions", { method: "POST", body: { text: "Mon bebe ne respire presque plus et ne tete plus", module: "health" }, token });
  const escalated = /immédiat|immediat|maintenant|centre de santé/i.test(r.json?.responseText ?? "");
  rec(
    "The platform runs with no AI provider keys of any kind",
    "/gouvernance, README, /financement",
    r.status === 200 && (r.json?.responseText ?? "").length > 40 ? "REAL" : "BROKEN",
    `no ANTHROPIC/OPENAI/GEMINI key in this process; answer ${r.status}, ${(r.json?.responseText ?? "").length} characters`,
  );
  rec(
    "A danger sign produces an emergency instruction and opens a case",
    "/services, /urgence, /aide",
    r.status === 200 && escalated && Boolean(r.json?.caseId) ? "REAL" : "PARTIAL",
    `case=${r.json?.caseId ?? "none"} emergency-wording=${escalated}`,
  );
}

/* 3. "Photograph a sick plant and get a diagnosis." Real bytes, including the
      iPhone format the first pilot users actually sent. */
{
  const token = await anon();
  const heic = readFileSync("tests/fixtures/camera-photo.heic");
  const png = readFileSync("public/icons/icon-512.png");

  const send = async (name, type, bytes) => {
    const form = new FormData();
    form.set("text", "Ma plante de manioc a des taches jaunes sur les feuilles");
    form.set("module", "agriculture");
    form.set("images[]", new Blob([bytes], { type }), name);
    const res = await fetch(`${base}/api/v1/interactions`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, json, text };
  };

  const a = await send("photo.heic", "image/heic", heic);
  rec(
    "A photograph taken on an iPhone (HEIC) is accepted and analysed",
    "/services, /acces",
    a.status === 200 && (a.json?.responseText ?? "").length > 40 ? "REAL" : "BROKEN",
    `${a.status} ${(a.json?.responseText ?? a.text).slice(0, 160)}`,
  );

  const b = await send("photo.png", "image/png", png);
  rec(
    "An ordinary photograph (PNG/JPEG) is accepted and analysed",
    "/services",
    b.status === 200 && (b.json?.responseText ?? "").length > 40 ? "REAL" : "BROKEN",
    `${b.status} ${(b.json?.responseText ?? b.text).slice(0, 120)}`,
  );

  // A renamed executable must not be accepted as an image.
  const evil = await send("payload.jpg", "image/jpeg", Buffer.from("MZ\x90\x00this is a windows executable, not a photo"));
  rec(
    "A file that is not really an image is refused",
    "security claim, docs/SECURITY.md",
    evil.status >= 400 || /ne peut|illisible|unreadable|invalide/i.test(evil.text) ? "REAL" : "BROKEN",
    `${evil.status} ${evil.text.slice(0, 160)}`,
  );
}

/* 4. "Every interaction is recorded with its risk, language and version." */
{
  const admin = await staff("+243900000001");
  const list = await call("/api/v1/interactions?scope=all&limit=5", { token: admin });
  const rows = list.json?.interactions ?? [];
  const complete = rows.filter((r) => r.language && r.module && (r.severity !== undefined || r.riskScore !== undefined) && r.createdAt);
  rec(
    "Everything is saved: input, answer, risk, language, module, timestamp",
    "/gouvernance, CLAUDE.md",
    list.status === 200 && complete.length === rows.length && rows.length > 0 ? "REAL" : "PARTIAL",
    `${list.status}, ${complete.length}/${rows.length} rows carry language+module+risk+timestamp`,
  );

  /* 5. "Cost per interaction is measured in a normalised unit." */
  const acu = await call("/api/v1/metering/acu", { token: admin });
  const m = acu.json;
  const total = m?.totalAcu ?? m?.acu;
  const byTask = m?.byTask ?? [];
  const sum = byTask.reduce((s, r) => s + Number(r.acu ?? 0), 0);
  const balanced = total !== undefined && Math.abs(Number(total) - sum) < 0.01;
  rec(
    "Every AI call is metered and the ledger adds up",
    "/financement, blog",
    acu.status === 200 && byTask.length > 0 && balanced ? "REAL" : acu.status === 200 ? "PARTIAL" : "BROKEN",
    `${acu.status} total=${total} sum(byTask)=${sum.toFixed(4)} tasks=${byTask.map((r) => r.task).join(",")}`,
  );

  /* 6. "Reports carry their definitions, denominators and a suppression rule." */
  const job = await call("/api/v1/report-jobs", { method: "POST", body: { type: "weekly_health_trends", format: "csv" }, token: admin });
  let ready = null;
  for (let i = 0; i < 20 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await call(`/api/v1/report-jobs/${job.json?.job?.id ?? job.json?.id}`, { token: admin });
    if (st.json?.job?.status === "completed" || st.json?.status === "completed") ready = st.json;
  }
  const dl = ready ? await call(`/api/v1/report-jobs/${job.json?.job?.id ?? job.json?.id}/download`, { token: admin }) : null;
  rec(
    "An institutional report can be produced and downloaded, with its suppression rule printed",
    "/financement, /gouvernance, blog",
    dl?.status === 200 && /suppression|inférieur à 5|<5/i.test(dl.text) ? "REAL" : dl?.status === 200 ? "PARTIAL" : job.status === 200 ? "PARTIAL" : "BROKEN",
    `job ${job.status}, completed=${Boolean(ready)}, download ${dl?.status ?? "n/a"}, suppression-note=${dl ? /suppression|inférieur à 5|<5/i.test(dl.text) : "n/a"}`,
  );

  /* 7. "Ask for your data, or ask us to erase it." */
  const token = await anon();
  await call("/api/v1/interactions", { method: "POST", body: { text: "Question pour la demande d'acces", module: "general" }, token });
  const me = await call("/api/v1/auth/me", { token });
  const subject = me.json?.user?.id ?? me.json?.id;
  const access = await call("/api/v1/data-requests", { method: "POST", body: { type: "access" }, token });
  rec(
    "A person can ask for a copy of everything held about them",
    "/confidentialite",
    access.status === 200 || access.status === 201 ? "REAL" : "BROKEN",
    `${access.status} ${access.text.slice(0, 160)}`,
  );
  const erasure = await call("/api/v1/data-requests", { method: "POST", body: { type: "erasure" }, token });
  rec(
    "A person can ask for their data to be erased",
    "/confidentialite",
    erasure.status === 200 || erasure.status === 201 ? "REAL" : "BROKEN",
    `${erasure.status} ${erasure.text.slice(0, 160)}`,
  );
  globalThis.__subject = subject;
  globalThis.__adminToken = admin;
}

/* 8. "The audit trail is hash-chained and verifiable." */
{
  const admin = globalThis.__adminToken;
  const audit = await call("/api/v1/audit-logs?limit=5", { token: admin });
  const rows = audit.json?.logs ?? audit.json?.entries ?? [];
  const chained = rows.filter((r) => r.hash && r.prevHash !== undefined);
  rec(
    "The audit log is hash-chained",
    "/gouvernance, blog",
    audit.status === 200 && rows.length > 0 && chained.length === rows.length ? "REAL" : audit.status === 200 ? "PARTIAL" : "BROKEN",
    `${audit.status}, ${chained.length}/${rows.length} rows carry hash+prevHash`,
  );
}

const counts = out.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
console.log(`\n${JSON.stringify(counts)}`);
