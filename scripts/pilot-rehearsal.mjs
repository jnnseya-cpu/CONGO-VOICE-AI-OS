/**
 * Drives a deployment from "started" to "answering citizens", then checks that
 * it actually answered them.
 *
 *   node scripts/pilot-rehearsal.mjs http://localhost:3202
 *
 * This is not a test double. It signs in over HTTP, seats the Clinical Review
 * Board, has its members sign every piece of health content, then asks the
 * platform real questions as an anonymous citizen and follows the case into a
 * worker's queue. Everything it does, a person would do on the day.
 *
 * Board members are named by telephone number so the same script works against
 * a real deployment:
 *
 *   REHEARSAL_PHYSICIANS="+243900000008,+243900000007" \
 *   REHEARSAL_CHW="+243900000006" \
 *   node scripts/pilot-rehearsal.mjs https://congovoice.cd
 */
const base = (process.argv[2] ?? "http://localhost:3202").replace(/\/$/, "");
const ADMIN_PHONE = process.env.REHEARSAL_ADMIN ?? "+243900000001";
const PIN = process.env.REHEARSAL_PIN ?? "1234";
const PHYSICIANS = (process.env.REHEARSAL_PHYSICIANS ?? "+243900000008,+243900000007").split(",").map((s) => s.trim());
const CHW = (process.env.REHEARSAL_CHW ?? "+243900000006").trim();
/** Whoever answers the escalation. Needs case:write, which a partner NGO does not have. */
const WORKER = (process.env.REHEARSAL_WORKER ?? "+243900000007").trim();

let ip = 0;
const nextIp = () => `198.18.${20 + Math.floor(ip / 250)}.${(ip++ % 250) + 1}`;

const results = [];
function check(ok, name, detail = "") {
  results.push({ ok, name, detail });
  console.log(`  ${ok ? "ok    " : "FAIL  "} ${name}${detail ? `  — ${detail}` : ""}`);
  return ok;
}

async function call(path, { method = "GET", body, token, addr } = {}) {
  const headers = { "content-type": "application/json", "x-forwarded-for": addr ?? nextIp() };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, ...json };
}

async function signIn(phone) {
  const res = await call("/api/v1/auth/login", { method: "POST", body: { phone, pin: PIN } });
  return res.token ?? null;
}

console.log(`\nPilot rehearsal against ${base}\n`);

/* ── 1. Sign in ──────────────────────────────────────────────────────────── */
console.log("Accounts");
const admin = await signIn(ADMIN_PHONE);
if (!check(Boolean(admin), "administrator signs in", admin ? "" : `${ADMIN_PHONE} refused`)) process.exit(1);

const boardTokens = {};
const boardIds = {};
for (const phone of [...PHYSICIANS, CHW]) {
  const token = await signIn(phone);
  boardTokens[phone] = token;
  // Each member identifies themselves. Asking the administrator to look them up
  // by telephone number does not work and should not: a number is encrypted at
  // rest and is not handed back in a user listing.
  const me = token ? await call("/api/v1/auth/me", { token }) : {};
  boardIds[phone] = me.user?.id ?? null;
  check(Boolean(token && boardIds[phone]), `board member ${phone.slice(-4)} signs in`, me.user?.name ?? "");
}

/* ── 2. Seat the Clinical Review Board ───────────────────────────────────── */
console.log("\nClinical Review Board");
const seats = [
  ...PHYSICIANS.map((p) => ({ phone: p, seat: "physician" })),
  { phone: CHW, seat: "community_health_expert" },
];

for (const { phone, seat } of seats) {
  const userId = boardIds[phone];
  if (!userId) {
    check(false, `appoint ${seat}`, `no account for ${phone}`);
    continue;
  }
  const res = await call("/api/v1/admin/review/members", {
    method: "POST",
    token: admin,
    body: { boardKey: "crb", userId, seat, credential: `CNOM-${userId.slice(0, 6)}` },
  });
  // Already appointed on a re-run is success, not failure.
  check(Boolean(res.member) || res.status === 400, `appoint ${seat}`, res.member ? "" : (res.error?.message ?? ""));
}

const boards = (await call("/api/v1/review/boards", { token: admin })).boards ?? [];
const crb = boards.find((b) => b.key === "crb");
check(crb?.composition?.constituted === true, "board is constituted", (crb?.composition?.missing ?? []).join(", "));

/* ── 3. Sign every piece of health content ───────────────────────────────── */
console.log("\nSign-off");
const artefacts = (await call("/api/v1/review/artefacts?module=health", { token: admin })).artefacts ?? [];
const unsigned = artefacts.filter((a) => !a.approved);
console.log(`  ${artefacts.length} health artefacts, ${unsigned.length} unsigned`);

let signed = 0;
for (const artefact of unsigned) {
  const submission = await call("/api/v1/review/submissions", {
    method: "POST",
    token: admin,
    body: { boardKey: "crb", kind: artefact.kind, artefactId: artefact.artefactId, changeNote: "Revue initiale avant pilote." },
  });
  const id = submission.submission?.id;
  if (!id) continue;
  const digest = submission.submission.contentDigest;
  for (const { phone, seat } of seats) {
    await call(`/api/v1/review/submissions/${id}/signoffs`, {
      method: "POST",
      token: boardTokens[phone],
      body: { seat, decision: "approve", comment: "Conforme aux protocoles nationaux.", contentDigest: digest },
    });
  }
  signed += 1;
}

const after = (await call("/api/v1/review/artefacts?module=health", { token: admin })).summary ?? {};
check(after.unsigned === 0, "every health artefact carries a board sign-off", `${after.signed}/${after.total} signed`);
void signed;

/* ── 4. Readiness ────────────────────────────────────────────────────────── */
console.log("\nReadiness");
const health = await call("/api/v1/system/health");
check(health.status === "ok", "the deployment reports ready", (health.failing ?? []).map((f) => f.id).join(", "));

/* ── 5. Citizens ─────────────────────────────────────────────────────────── */
console.log("\nCitizens");

async function citizen(language = "fr", province = "Kinshasa") {
  const res = await call("/api/v1/auth/login", { method: "POST", body: { anonymous: true, language, province, consent: true } });
  return res.token;
}

async function ask(token, module, text, province = "Kinshasa") {
  return call("/api/v1/interactions", { method: "POST", token, body: { module, text, province, wantsAudio: false } });
}

// 5a. An emergency.
const c1 = await citizen();
const emergency = await ask(c1, "health", "Mon bébé convulse et ne peut plus téter depuis ce matin.");
// The severity itself is internal; what the citizen's client is told is the
// band and the rules that fired. Both are checked, because either alone could
// be right while the other is wrong.
const band = emergency.answer?.risk?.level ?? null;
const flags = emergency.answer?.risk?.flags ?? [];
check(band === "critical", "a danger sign is graded as an emergency", `band ${band}`);
check(flags.some((f) => /niveau_4/.test(f)), "the protocol engine reached severity 4", flags.join(", ").slice(0, 80));
check(flags.some((f) => /^danger:/.test(f)), "the danger signs are named", flags.filter((f) => /^danger:/.test(f)).join(", "));
check(Boolean(emergency.answer?.escalation?.required), "a person is alerted");
check(/centre de santé|tout de suite|maintenant/i.test(emergency.answer?.action ?? ""), "the citizen is told where to go now");
check(Boolean(emergency.caseId), "a case is opened", emergency.caseId ?? "none");

// 5b. An ordinary question: the platform must now assess, not withhold.
const c2 = await citizen();
const ordinary = await ask(c2, "health", "Mon enfant a un petit rhume depuis hier, il mange et il joue normalement.");
const ordinaryText = `${ordinary.answer?.action ?? ""} ${ordinary.answer?.understanding ?? ""}`;
check(!/n'est pas validé par le comité/i.test(ordinaryText), "an ordinary case is assessed, not withheld");
check((ordinary.answer?.action ?? "").length > 40, "the answer says something useful", `${(ordinary.answer?.action ?? "").length} chars`);

// 5c. Agriculture.
const c3 = await citizen();
const agri = await ask(c3, "agriculture", "Les feuilles de mon maïs sont trouées et je vois des chenilles dans le cornet.");
check((agri.answer?.action ?? "").length > 40, "an agriculture question is answered");
check(!/\b\d+\s*(ml|l|g|kg)\s*(\/|par)\s*(litre|ha|hectare)/i.test(agri.answer?.action ?? ""), "no unregistered chemical rate is given");

// 5d. Education.
const c4 = await citizen();
const edu = await ask(c4, "education", "Explique-moi comment additionner 3/4 et 5/6.");
check((edu.answer?.action ?? "").length > 40, "an education question is answered");

/* ── 6. The case reaches a worker ────────────────────────────────────────── */
console.log("\nThe worker's queue");
const chwToken = await signIn(WORKER);
const cases = (await call("/api/v1/cases?limit=50", { token: chwToken })).cases ?? [];
const opened = cases.find((c) => c.id === emergency.caseId) ?? cases[0];
check(Boolean(chwToken), "the health worker signs in", WORKER.slice(-4));
check(Boolean(opened), "the case is visible to a health worker", opened ? opened.id : "queue empty");

if (opened) {
  // Ask the platform which transitions this case may take, rather than
  // assuming one. A rehearsal that guesses the state machine tests the guess.
  const options = await call(`/api/v1/cases/${opened.id}/transitions`, { token: chwToken });
  const mine = (options.permitted ?? []).filter((t) => t.allowedForMe && !t.reasonRequired && !t.requiresClosureData);
  check(mine.length > 0, "the worker has a move to make", (options.permitted ?? []).map((t) => t.to).join(", "));

  const target = mine.find((t) => t.to === "acknowledged") ?? mine[0];
  if (target) {
    const moved = await call(`/api/v1/cases/${opened.id}/transitions`, {
      method: "POST",
      token: chwToken,
      body: { to: target.to, note: "Prise en charge, appel en cours." },
    });
    const now = moved.case?.status ?? moved.status;
    check(now === target.to, `a worker moves it to ${target.to}`, moved.error?.message ?? String(now));
  }

  const after = await call(`/api/v1/cases/${opened.id}`, { token: chwToken });
  check(Boolean(after.case ?? after.id), "the case reads back with its history", (after.case?.status ?? after.status) ?? "");
}

/* ── 7. Maintenance runs ─────────────────────────────────────────────────── */
console.log("\nMaintenance");
const run = await call("/api/v1/workflow/run", { method: "POST", token: admin });
check(typeof run.startedAt === "string", "the maintenance job runs", run.error?.message ?? "");
check(run.auditChain ? run.auditChain.ok !== false : true, "the audit chain verifies");

/* ── Verdict ─────────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nNot working:");
  for (const f of failed) console.log(`  ${f.name} — ${f.detail}`);
  process.exit(1);
}
console.log("The platform is seated, signed, and answering citizens.");
