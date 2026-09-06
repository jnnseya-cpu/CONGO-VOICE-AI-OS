import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { awaitBackground } from "@/lib/channels/background";
import { resetSmsOutbox, smsOutbox } from "@/lib/channels/sms";
import { resetWhatsappOutbox, whatsappOutbox } from "@/lib/channels/whatsapp";
import { sendFollowUp } from "@/lib/channels/follow-up";
import { patchState } from "@/lib/channels/session";

import { GET as whatsappVerify, POST as whatsappHook } from "@/app/api/hooks/whatsapp/route";
import { POST as ussdHook } from "@/app/api/hooks/ussd/route";
import { POST as smsHook } from "@/app/api/hooks/sms/route";
import { POST as smsDlrHook } from "@/app/api/hooks/sms/dlr/route";
import { POST as ivrIncoming } from "@/app/api/hooks/ivr/twilio/route";
import { POST as ivrGather } from "@/app/api/hooks/ivr/twilio/gather/route";
import { POST as ivrRecording } from "@/app/api/hooks/ivr/twilio/recording/route";

const ORIGIN = "http://localhost:3000";

function whatsappRequest(payload: unknown): Request {
  return new Request(`${ORIGIN}/api/hooks/whatsapp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function whatsappMessage(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ profile: { name: "Marie" }, wa_id: message.from }],
              messages: [{ timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
            },
          },
        ],
      },
    ],
  };
}

function formRequest(path: string, fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("channel webhooks (offline providers)", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  beforeEach(() => {
    resetWhatsappOutbox();
    resetSmsOutbox();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  /* ─────────────────────────────── WhatsApp ─────────────────────────────── */

  it("verifies the webhook subscription with the configured token", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
    const ok = await whatsappVerify(
      new Request(`${ORIGIN}/api/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42`),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");

    const bad = await whatsappVerify(
      new Request(`${ORIGIN}/api/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42`),
    );
    expect(bad.status).toBe(403);
  });

  it("rejects a payload whose signature does not match the app secret", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const payload = whatsappMessage({ id: "wamid.sig", from: "243810000201", type: "text", text: { body: "bonjour" } });
    const res = await whatsappHook(
      new Request(`${ORIGIN}/api/hooks/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("answers an inbound WhatsApp text and stores the turn on the session", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const db = await getDb();
    const payload = whatsappMessage({
      id: "wamid.text.1",
      from: "243810000202",
      type: "text",
      text: { body: "Les feuilles de mon manioc jaunissent, que faire ?" },
    });
    const raw = JSON.stringify(payload);
    const signature = "sha256=" + createHmac("sha256", "app-secret").update(raw, "utf8").digest("hex");
    const res = await whatsappHook(
      new Request(`${ORIGIN}/api/hooks/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": signature },
        body: raw,
      }),
    );
    expect(res.status).toBe(200);

    const outbox = whatsappOutbox();
    expect(outbox.length).toBeGreaterThan(0);
    expect(outbox[0].to).toBe("243810000202");
    expect(outbox[0].body?.length).toBeGreaterThan(10);

    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.channel, "whatsapp"));
    const session = sessions.find((s) => s.turnCount === 1);
    expect(session).toBeTruthy();
    const interactions = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.sessionId, session!.id));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].module).toBe("agriculture");
  });

  it("processes the same WhatsApp message id only once", async () => {
    const payload = whatsappMessage({
      id: "wamid.text.dup",
      from: "243810000203",
      type: "text",
      text: { body: "Bonjour, quand vacciner mon bébé ?" },
    });
    await whatsappHook(whatsappRequest(payload));
    const after = whatsappOutbox().length;
    await whatsappHook(whatsappRequest(payload));
    expect(whatsappOutbox().length).toBe(after);
  });

  it("downloads an inbound voice note through the Graph API and replies safely", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "graph-token"; // outbound stays in log mode (no phone id)
    const audio = Buffer.from("fake-ogg-bytes");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/media-id-1")) {
        return new Response(JSON.stringify({ url: "https://lookaside.example/file", mime_type: "audio/ogg", file_size: audio.length }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("lookaside.example")) return new Response(new Uint8Array(audio), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await whatsappHook(
      whatsappRequest(
        whatsappMessage({ id: "wamid.audio.1", from: "243810000204", type: "audio", audio: { id: "media-id-1", mime_type: "audio/ogg" } }),
      ),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const db = await getDb();
    const files = await db.select().from(schema.files).where(eq(schema.files.kind, "audio"));
    expect(files.length).toBeGreaterThan(0);
    // Offline speech-to-text cannot decode: the citizen gets a safe, localised message.
    expect(whatsappOutbox().some((m) => m.kind === "text" && (m.body ?? "").length > 10)).toBe(true);
  });

  it("offers a list of common questions after a module button and answers the chosen one", async () => {
    const from = "243810000206";
    await whatsappHook(whatsappRequest(whatsappMessage({ id: "wamid.sticker", from, type: "sticker" })));
    const buttons = whatsappOutbox().at(-1);
    expect(buttons?.kind).toBe("buttons");
    expect(buttons?.buttons).toHaveLength(3);

    await whatsappHook(
      whatsappRequest(
        whatsappMessage({
          id: "wamid.mod",
          from,
          type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: "mod:health", title: "Santé" } },
        }),
      ),
    );
    const list = whatsappOutbox().at(-1);
    expect(list?.kind).toBe("list");
    expect(list?.rows).toHaveLength(5);
    expect(list?.rows?.[0].id).toBe("q:health:0");

    await whatsappHook(
      whatsappRequest(
        whatsappMessage({
          id: "wamid.q",
          from,
          type: "interactive",
          interactive: { type: "list_reply", list_reply: { id: "q:health:0", title: "Fievre enfant" } },
        }),
      ),
    );
    const answer = whatsappOutbox().at(-1);
    expect(answer?.body?.length).toBeGreaterThan(20);

    const db = await getDb();
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.module, "health"));
    expect(sessions.some((s) => s.channel === "whatsapp" && s.turnCount === 1)).toBe(true);
  });

  it("sends a proactive follow-up as free text inside the window and as a template outside it", async () => {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, "+243810000202"));
    expect(user).toBeTruthy();
    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id));

    const inside = await sendFollowUp({ userId: user.id, text: "Rappel : vaccination demain au centre de santé." });
    expect(inside.channel).toBe("whatsapp");
    expect(inside.usedTemplate).toBe(false);
    expect(whatsappOutbox().at(-1)?.kind).toBe("text");

    await patchState(session.id, { lastInboundAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() });
    const outside = await sendFollowUp({ userId: user.id, text: "Rappel : vaccination demain.", templateName: "cvos_rappel" });
    expect(outside.channel).toBe("whatsapp");
    expect(outside.usedTemplate).toBe(true);
    const templateMessage = whatsappOutbox().at(-1);
    expect(templateMessage?.kind).toBe("template");
    expect(templateMessage?.templateName).toBe("cvos_rappel");

    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.channel, "whatsapp"));
    expect(notifications).toHaveLength(2);
    expect(notifications.some((n) => n.templateKey === "cvos_rappel")).toBe(true);
  });

  it("revokes consent when a WhatsApp user sends STOP", async () => {
    const db = await getDb();
    await whatsappHook(
      whatsappRequest(whatsappMessage({ id: "wamid.stop.1", from: "243810000205", type: "text", text: { body: "STOP" } })),
    );
    const ack = whatsappOutbox().at(-1);
    expect(ack?.body).toContain("START");

    const consents = await db.select().from(schema.consents).where(eq(schema.consents.status, "revoked"));
    expect(consents.length).toBeGreaterThan(0);
  });

  /* ─────────────────────────────── USSD ─────────────────────────────── */

  it("walks the two-level USSD menu and answers by SMS", async () => {
    const phone = "+243810000210";
    const sessionId = "ATUid_1";
    const step = (text: string) =>
      ussdHook(formRequest("/api/hooks/ussd", { sessionId, serviceCode: "*384*7#", phoneNumber: phone, text }));

    const languageMenu = await step("");
    const languageBody = await languageMenu.text();
    expect(languageBody.startsWith("CON ")).toBe(true);
    expect(languageBody).toContain("Français");
    expect(languageBody).toContain("Kiswahili");

    const moduleMenu = await (await step("1")).text();
    expect(moduleMenu.startsWith("CON ")).toBe(true);
    expect(moduleMenu).toContain("Santé");
    expect(moduleMenu).toContain("Agriculture");

    const questionMenu = await (await step("1*1")).text();
    expect(questionMenu.startsWith("CON ")).toBe(true);
    expect(questionMenu).toContain("Fievre enfant");
    expect(questionMenu.split("\n").length).toBeGreaterThanOrEqual(6); // title + 5 questions + other

    const answer = await (await step("1*1*1")).text();
    expect(answer.startsWith("END ")).toBe(true);
    expect(answer).toContain("SMS");

    await awaitBackground();
    expect(smsOutbox().some((m) => m.to === phone)).toBe(true);

    const db = await getDb();
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.channel, "ussd"));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].module).toBe("health");
    expect(sessions[0].turnCount).toBe(1);

    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.to, phone));
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((n) => n.channel === "sms")).toBe(true);
  });

  it("rejects an invalid USSD choice without ending the session", async () => {
    const res = await ussdHook(
      formRequest("/api/hooks/ussd", { sessionId: "ATUid_2", serviceCode: "*384*7#", phoneNumber: "+243810000211", text: "9" }),
    );
    const body = await res.text();
    expect(body.startsWith("CON ")).toBe(true);
    expect(body).toContain("Choix invalide");
  });

  /* ─────────────────────────────── SMS ─────────────────────────────── */

  it("answers an inbound SMS and records the delivery report", async () => {
    const db = await getDb();
    const phone = "+243810000220";
    const res = await smsHook(
      formRequest("/api/hooks/sms", { from: phone, to: "7000", id: "at-msg-1", text: "Comment aider mon fils à lire ?" }),
    );
    expect(res.status).toBe(200);
    expect(smsOutbox().some((m) => m.to === phone)).toBe(true);

    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.to, phone));
    expect(notifications.length).toBeGreaterThan(0);
    const providerId = notifications[0].providerMessageId as string;
    expect(providerId).toBeTruthy();

    const dlr = await smsDlrHook(formRequest("/api/hooks/sms/dlr", { id: providerId, status: "Success", phoneNumber: phone }));
    expect(await dlr.json()).toEqual({ matched: true });
    const [updated] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, notifications[0].id));
    expect(updated.deliveredAt).toBeTruthy();
  });

  it("stops sending after an SMS opt-out and records the revocation", async () => {
    const db = await getDb();
    const phone = "+243810000221";
    await smsHook(formRequest("/api/hooks/sms", { from: phone, to: "7000", id: "at-msg-2", text: "ARRÊT" }));
    expect(smsOutbox().at(-1)?.text).toContain("START");

    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.channel, "sms"));
    const session = sessions.find((s) => s.channelRef && s.status === "ended");
    expect(session).toBeTruthy();
    const consents = await db
      .select()
      .from(schema.consents)
      .where(eq(schema.consents.userId, session!.userId as string));
    expect(consents.some((c) => c.purpose === "service" && c.status === "revoked")).toBe(true);
  });

  /* ─────────────────────────────── IVR ─────────────────────────────── */

  it("greets, offers the language menu and routes a spoken question to TwiML", async () => {
    const caller = "+243810000230";
    const greeting = await ivrIncoming(formRequest("/api/hooks/ivr/twilio", { From: caller, CallSid: "CA1" }));
    expect(greeting.headers.get("content-type")).toContain("text/xml");
    const greetingXml = await greeting.text();
    expect(greetingXml).toContain("<Response>");
    expect(greetingXml).toContain("<Say");
    expect(greetingXml).toContain("Congo Voice");
    expect(greetingXml).toMatch(/<Gather[^>]+action="\/api\/hooks\/ivr\/twilio\/gather\?step=language"/);
    expect(greetingXml).toMatch(/language="(fr-FR|sw-KE)"/);

    const chooseLanguage = await ivrGather(
      formRequest("/api/hooks/ivr/twilio/gather?step=language", { From: caller, CallSid: "CA1", Digits: "4" }),
    );
    const chooseXml = await chooseLanguage.text();
    expect(chooseXml).toContain('language="sw-KE"');
    expect(chooseXml).toMatch(/step=intent/);

    const db = await getDb();
    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.channel, "ivr"));
    expect(session.language).toBe("sw");

    // DTMF fallback: 1 = santé → record the question.
    const moduleChoice = await ivrGather(
      formRequest("/api/hooks/ivr/twilio/gather?step=intent", { From: caller, CallSid: "CA1", Digits: "1" }),
    );
    const moduleXml = await moduleChoice.text();
    expect(moduleXml).toContain("<Record");
    expect(moduleXml).toContain('action="/api/hooks/ivr/twilio/recording"');
    expect(moduleXml).toContain('trim="trim-silence"');

    const answer = await ivrRecording(
      formRequest("/api/hooks/ivr/twilio/recording", {
        From: caller,
        CallSid: "CA1",
        RecordingUrl: "https://api.twilio.com/recordings/RE1",
        TranscriptionText: "Mon enfant a de la fièvre depuis deux jours",
      }),
    );
    const answerXml = await answer.text();
    expect(answerXml).toContain("<Say");
    expect(answerXml).toContain("<Hangup/>");
    expect(answerXml).not.toContain("undefined");

    const [after] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, session.id));
    expect(after.turnCount).toBe(1);
    expect(after.module).toBe("health");
  });

  it("resumes a known caller with the 'where we left off' summary", async () => {
    const caller = "+243810000230";
    const res = await ivrIncoming(formRequest("/api/hooks/ivr/twilio", { From: caller, CallSid: "CA2" }));
    const xml = await res.text();
    expect(xml).toContain("step=resume");
    expect(xml).toContain("fièvre");
  });

  it("refuses an IVR request with a bad Twilio signature", async () => {
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret";
    const res = await ivrIncoming(
      formRequest("/api/hooks/ivr/twilio", { From: "+243810000240", CallSid: "CA9" }, { "x-twilio-signature": "nope" }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts an IVR request signed with the account auth token", async () => {
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret";
    const params = { From: "+243810000241", CallSid: "CA10" };
    const url = `${ORIGIN}/api/hooks/ivr/twilio`;
    const payload = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
    const signature = createHmac("sha1", "twilio-secret").update(Buffer.from(payload, "utf8")).digest("base64");
    const res = await ivrIncoming(formRequest("/api/hooks/ivr/twilio", params, { "x-twilio-signature": signature }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<Response>");
  });
});
