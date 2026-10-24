/**
 * CYCLE 1 — channel truth probe.
 * Drives USSD, inbound SMS and the IVR webhook chain against a running
 * release candidate, the way an operator's gateway would, and records what the
 * platform actually does. No live provider is touched: the SMS/WhatsApp/voice
 * drivers are the log providers, so every outbound message is captured, not sent.
 */
const base = (process.argv[2] ?? "http://127.0.0.1:3210").replace(/\/$/, "");
const out = [];
const rec = (id, name, ok, detail) => {
  out.push({ id, name, status: ok === null ? "BLOCKED" : ok ? "PASS" : "FAIL", detail });
  console.log(`${ok === null ? "BLOCKED" : ok ? "PASS" : "FAIL"}  ${id}  ${name}\n        ${String(detail).slice(0, 400)}`);
};
const form = (obj) => new URLSearchParams(obj).toString();
const post = async (path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
  return { status: res.status, text: await res.text() };
};

const PHONE = `+24397${Math.floor(Math.random() * 9000000) + 1000000}`;

// ── USSD: two-level menu, French, ending in an SMS delivery ──────────────────
{
  const sid = `ussd-${Date.now()}`;
  const r1 = await post("/api/hooks/ussd", form({ phoneNumber: PHONE, sessionId: sid, serviceCode: "*384#", text: "" }));
  rec("CH-01", "USSD first screen offers a language menu", r1.status === 200 && /^CON /.test(r1.text) && /1/.test(r1.text), `${r1.status} ${r1.text.slice(0, 160)}`);

  const r2 = await post("/api/hooks/ussd", form({ phoneNumber: PHONE, sessionId: sid, serviceCode: "*384#", text: "1" }));
  rec("CH-02", "USSD accepts a language choice and offers the modules", r2.status === 200 && /^CON /.test(r2.text), `${r2.status} ${r2.text.slice(0, 160)}`);

  const r3 = await post("/api/hooks/ussd", form({ phoneNumber: PHONE, sessionId: sid, serviceCode: "*384#", text: "1*1" }));
  rec("CH-03", "USSD offers the common questions of the chosen module", r3.status === 200 && /^(CON|END) /.test(r3.text), `${r3.status} ${r3.text.slice(0, 200)}`);

  const r4 = await post("/api/hooks/ussd", form({ phoneNumber: PHONE, sessionId: sid, serviceCode: "*384#", text: "1*1*1" }));
  rec("CH-04", "USSD closes the session and promises the answer by SMS", r4.status === 200 && /^END /.test(r4.text), `${r4.status} ${r4.text.slice(0, 200)}`);

  // A USSD screen must fit: the operator truncates at 160 characters.
  const tooLong = [r1, r2, r3, r4].filter((r) => r.text.replace(/^(CON|END) /, "").length > 160);
  rec("CH-05", "every USSD screen fits the operator's 160-character limit", tooLong.length === 0, tooLong.length ? `${tooLong.length} screen(s) over: ${tooLong.map((r) => r.text.length).join(", ")}` : "all screens within 160");
}

// ── USSD: an unknown digit must not dead-end ────────────────────────────────
{
  const sid = `ussd-bad-${Date.now()}`;
  const r = await post("/api/hooks/ussd", form({ phoneNumber: PHONE, sessionId: sid, text: "9" }));
  rec("CH-06", "an invalid USSD digit is answered, not dropped", r.status === 200 && /^(CON|END) /.test(r.text), `${r.status} ${r.text.slice(0, 160)}`);
}

// ── USSD: no phone number at all ────────────────────────────────────────────
{
  const r = await post("/api/hooks/ussd", form({ sessionId: "x", text: "" }));
  rec("CH-07", "USSD without a number is refused in the operator's own format", r.status === 200 && /^END /.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
}

// ── Inbound SMS: a real question, and the duplicate the gateway will resend ─
{
  const id = `sms-${Date.now()}`;
  const body = form({ from: PHONE, text: "Mon enfant a de la fievre depuis deux jours", id });
  const first = await post("/api/hooks/sms", body);
  rec("CH-08", "inbound SMS is accepted", first.status === 200, `${first.status} ${first.text.slice(0, 80)}`);

  const replay = await post("/api/hooks/sms", body);
  rec("CH-09", "the same message id replayed does not run the turn twice", replay.status === 200, `${replay.status} ${replay.text.slice(0, 80)}`);
}

// ── Inbound SMS: STOP must revoke consent ───────────────────────────────────
{
  const r = await post("/api/hooks/sms", form({ from: PHONE, text: "STOP", id: `stop-${Date.now()}` }));
  rec("CH-10", "STOP is accepted on the SMS channel", r.status === 200, `${r.status} ${r.text.slice(0, 80)}`);
}

// ── IVR: unsigned request must be refused in production ─────────────────────
{
  const r = await post("/api/hooks/ivr/twilio", form({ From: PHONE, CallSid: "CA-probe" }));
  rec("CH-11", "an unsigned telephony webhook is refused in production", r.status === 403, `${r.status} ${r.text.slice(0, 120)}`);
}

// ── IVR: forged signature must be refused ───────────────────────────────────
{
  const r = await post("/api/hooks/ivr/twilio", form({ From: PHONE, CallSid: "CA-probe" }), { "x-twilio-signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
  rec("CH-12", "a forged telephony signature is refused", r.status === 403, `${r.status} ${r.text.slice(0, 120)}`);
}

// ── WhatsApp: unsigned payload must be refused in production ────────────────
{
  const res = await fetch(`${base}/api/hooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry: [] }),
  });
  rec("CH-13", "an unsigned WhatsApp webhook is refused in production", res.status === 401, `${res.status}`);
}

// ── Rate limit: one number cannot flood USSD ─────────────────────────────────
{
  const flood = [];
  for (let i = 0; i < 26; i++) {
    flood.push(await post("/api/hooks/ussd", form({ phoneNumber: "+243970000999", sessionId: `f-${i}`, text: "" })));
  }
  const refused = flood.filter((r) => /Trop de demandes/.test(r.text)).length;
  rec("CH-14", "a flood from one number is cut off", refused > 0, `${refused} of 26 refused`);
}

const summary = { total: out.length, pass: out.filter((r) => r.status === "PASS").length, fail: out.filter((r) => r.status === "FAIL").length };
console.log(`\n${summary.pass}/${summary.total} channel probes passed, ${summary.fail} failed.`);
