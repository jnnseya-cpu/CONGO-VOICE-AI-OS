import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encryptValue, isEncrypted } from "@server/core/crypto";
import {
  CREDENTIALS,
  CredentialRefused,
  NEVER_SETTABLE,
  clearCredential,
  credentialStatus,
  resetCredentialSyncForTests,
  setCredential,
  specFor,
  syncCredentials,
} from "@server/core/credentials";

/**
 * Vendor keys an administrator sets from the console.
 *
 * Two properties carry this feature: the value never comes back out, and the
 * secrets that protect the console cannot be written through it.
 */
const ACTOR = { userId: "00000000-0000-0000-0000-00000000000a", role: "platform_admin" as const };

describe("the allow-list is the mechanism", () => {
  it("accepts only the vendor credentials it names", () => {
    expect(specFor("OPENAI_API_KEY")?.group).toBe("ai");
    expect(specFor("TWILIO_AUTH_TOKEN")?.group).toBe("voice");
    expect(specFor("WHATSAPP_APP_SECRET")?.group).toBe("whatsapp");
    expect(specFor("SOMETHING_ELSE")).toBeNull();
  });

  it("refuses every secret that protects the console itself", () => {
    for (const name of NEVER_SETTABLE) {
      expect(specFor(name), `${name} must never be settable`).toBeNull();
    }
    // And the two that would be most tempting are definitely in that list.
    expect(NEVER_SETTABLE).toContain("DATA_ENCRYPTION_KEY");
    expect(NEVER_SETTABLE).toContain("SESSION_SECRET");
  });

  it("passes the driver list through to what the console reads", async () => {
    resetDbForTests();
    await getDb();
    const status = await credentialStatus();
    const sms = status.find((c) => c.name === "SMS_PROVIDER");
    expect(sms?.options).toEqual(["log", "africastalking", "twilio"]);
    // And a key is still a key: nothing to choose from, so nothing offered.
    expect(status.find((c) => c.name === "OPENAI_API_KEY")?.options).toBeUndefined();
  });

  it("offers each channel driver as a closed list, not a text box", () => {
    for (const name of ["SMS_PROVIDER", "VOICE_PROVIDER", "WHATSAPP_PROVIDER"]) {
      const spec = specFor(name);
      expect(spec?.options, `${name} must publish the drivers it accepts`).toBeDefined();
      expect(spec?.options).toContain("log");
      // Every offered choice is accepted, and nothing else is: the list the
      // console shows and the list the route enforces are the same list.
      for (const option of spec!.options!) expect(spec!.looksValid!(option)).toBe(true);
      expect(spec!.looksValid!("orange-money")).toBe(false);
    }
  });

  it("never lists one of those as a settable credential", () => {
    const settable = new Set(CREDENTIALS.map((c) => c.name));
    for (const name of NEVER_SETTABLE) expect(settable.has(name)).toBe(false);
  });
});

describe("storing a credential", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    for (const c of CREDENTIALS) {
      saved[c.name] = process.env[c.name];
      delete process.env[c.name];
    }
    await syncCredentials(true);
  });

  it("writes ciphertext, not the key", async () => {
    await setCredential("OPENAI_API_KEY", "sk-test-abcdefghijklmnopqrstuvwxyz", ACTOR);
    const db = await getDb();
    const [row] = await db.select().from(schema.providerCredentials);
    expect(row.name).toBe("OPENAI_API_KEY");
    expect(isEncrypted(row.value)).toBe(true);
    expect(row.value).not.toContain("sk-test");
  });

  it("reports it as set, with only the last four characters", async () => {
    await setCredential("OPENAI_API_KEY", "sk-test-abcdefghijklmnopqrstuvWXYZ", ACTOR);
    const status = (await credentialStatus()).find((s) => s.name === "OPENAI_API_KEY")!;
    expect(status.source).toBe("console");
    expect(status.hint).toBe("…WXYZ");
    const serialised = JSON.stringify(await credentialStatus());
    expect(serialised).not.toContain("sk-test-abcdefghijklmnopqrstuv");
  });

  it("shows an identifier in full, because it is not a secret", async () => {
    await setCredential("AFRICASTALKING_SENDER", "CONGOVOICE", ACTOR);
    const status = (await credentialStatus()).find((s) => s.name === "AFRICASTALKING_SENDER")!;
    expect(status.secret).toBe(false);
    expect(status.hint).toBe("CONGOVOICE");
  });

  it("makes the value available to the readers that expect an environment variable", async () => {
    await setCredential("GEMINI_API_KEY", "a-gemini-key-long-enough-to-pass", ACTOR);
    expect(process.env.GEMINI_API_KEY).toBe("a-gemini-key-long-enough-to-pass");
  });

  it("refuses a value that does not look like the credential it claims to be", async () => {
    await expect(setCredential("OPENAI_API_KEY", "hello", ACTOR)).rejects.toThrow(CredentialRefused);
    await expect(setCredential("ANTHROPIC_API_KEY", "sk-not-anthropic-but-long-enough-xxxxx", ACTOR)).rejects.toThrow(CredentialRefused);
    await expect(setCredential("TWILIO_ACCOUNT_SID", "not-a-sid", ACTOR)).rejects.toThrow(CredentialRefused);
  });

  it("refuses an empty value and a name that is not on the list", async () => {
    await expect(setCredential("OPENAI_API_KEY", "   ", ACTOR)).rejects.toThrow(CredentialRefused);
    await expect(setCredential("DATA_ENCRYPTION_KEY", "x".repeat(64), ACTOR)).rejects.toThrow(CredentialRefused);
    await expect(setCredential("SESSION_SECRET", "x".repeat(64), ACTOR)).rejects.toThrow(CredentialRefused);
  });

  it("records that it changed, and the last four characters, but never the key", async () => {
    await setCredential("OPENAI_API_KEY", "sk-test-abcdefghijklmnopqrst1234", ACTOR);
    const db = await getDb();
    const rows = await db.select().from(schema.auditLogs);
    const entry = rows.find((r) => r.action === "credential.set");
    expect(entry).toBeTruthy();
    expect(entry!.entityId).toBe("OPENAI_API_KEY");
    expect(JSON.stringify(entry!.afterValue)).toContain("…1234");
    expect(JSON.stringify(rows)).not.toContain("sk-test-abcdefghijklmnopqrst");
  });

  it("marks a second write as a rotation rather than a first set", async () => {
    await setCredential("OPENAI_API_KEY", "sk-test-firstkeyabcdefghijklmn", ACTOR);
    await setCredential("OPENAI_API_KEY", "sk-test-secondkeyabcdefghijklm", ACTOR);
    const db = await getDb();
    const rows = await db.select().from(schema.auditLogs);
    expect(rows.some((r) => r.action === "credential.set")).toBe(true);
    expect(rows.some((r) => r.action === "credential.rotated")).toBe(true);
    expect((await db.select().from(schema.providerCredentials)).length).toBe(1);
  });
});

describe("the deployment's own variables", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    for (const c of CREDENTIALS) {
      saved[c.name] = process.env[c.name];
      delete process.env[c.name];
    }
    await syncCredentials(true);
  });

  it("are reported when nothing is stored", async () => {
    process.env.GOOGLE_TTS_API_KEY = "a-key-set-by-the-deployment-xxxx";
    const status = (await credentialStatus()).find((s) => s.name === "GOOGLE_TTS_API_KEY")!;
    expect(status.source).toBe("deployment");
    expect(status.hint).toBe("…xxxx");
  });

  it("are overridden by a value set in the console", async () => {
    process.env.GOOGLE_TTS_API_KEY = "deployment-value-aaaaaaaaaaaaaaaa";
    await setCredential("GOOGLE_TTS_API_KEY", "console-value-bbbbbbbbbbbbbbbbbb", ACTOR);
    expect(process.env.GOOGLE_TTS_API_KEY).toBe("console-value-bbbbbbbbbbbbbbbbbb");
    const status = (await credentialStatus()).find((s) => s.name === "GOOGLE_TTS_API_KEY")!;
    expect(status.source).toBe("console");
  });

  it("apply again when the stored value is withdrawn", async () => {
    await setCredential("GOOGLE_TTS_API_KEY", "console-value-cccccccccccccccccc", ACTOR);
    const after = await clearCredential("GOOGLE_TTS_API_KEY", ACTOR);
    expect(after.source).toBe("none");
    const db = await getDb();
    expect((await db.select().from(schema.providerCredentials)).length).toBe(0);
    const rows = await db.select().from(schema.auditLogs);
    expect(rows.some((r) => r.action === "credential.cleared")).toBe(true);
  });

  it("stops being used the moment an administrator withdraws the stored one", async () => {
    await setCredential("GEMINI_API_KEY", "console-gemini-key-dddddddddddd", ACTOR);
    expect(process.env.GEMINI_API_KEY).toBe("console-gemini-key-dddddddddddd");
    await clearCredential("GEMINI_API_KEY", ACTOR);
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
  });
});

/**
 * A key without a driver sends nothing.
 *
 * Every channel asks two questions before it dispatches: which operator, and
 * are its credentials present. Setting only the credential leaves the channel
 * writing messages to the log — the half-configured state in which an escalation
 * reaches nobody while the console looks correct.
 */
describe("wiring a channel end to end", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    for (const c of CREDENTIALS) {
      saved[c.name] = process.env[c.name];
      delete process.env[c.name];
    }
    await syncCredentials(true);
  });

  it("stays in log mode with only the credentials set", async () => {
    await setCredential("AFRICASTALKING_USERNAME", "congovoice", ACTOR);
    await setCredential("AFRICASTALKING_API_KEY", "atsk_a_long_enough_key_value", ACTOR);
    const { smsMode } = await import("@server/channels/sms");
    expect(smsMode()).toBe("log");
  });

  it("switches to the operator once the driver is chosen as well", async () => {
    await setCredential("AFRICASTALKING_USERNAME", "congovoice", ACTOR);
    await setCredential("AFRICASTALKING_API_KEY", "atsk_a_long_enough_key_value", ACTOR);
    await setCredential("SMS_PROVIDER", "africastalking", ACTOR);
    const { smsMode } = await import("@server/channels/sms");
    expect(smsMode()).toBe("africastalking");
  });

  it("falls back to log when the driver is chosen without its credentials", async () => {
    await setCredential("SMS_PROVIDER", "africastalking", ACTOR);
    const { smsMode } = await import("@server/channels/sms");
    expect(smsMode()).toBe("log");
  });

  it("refuses an operator name the platform does not implement", async () => {
    await expect(setCredential("SMS_PROVIDER", "orange-money", ACTOR)).rejects.toThrow(CredentialRefused);
    await expect(setCredential("VOICE_PROVIDER", "meta", ACTOR)).rejects.toThrow(CredentialRefused);
  });
});

/**
 * A key reaching the platform is not the same as a key reaching the sender.
 *
 * The console writes to the database; the SMS client, the WhatsApp client, the
 * outbound call and the readiness probe all read `process.env`. Every one of
 * those edges reconciles the two before it decides, which is the difference
 * between a wired channel and a message quietly written to the log. These tests
 * stand where a real instance stands — one that has never served an AI call and
 * whose last read is more than a minute old.
 */
describe("an instance that has not heard about the key yet", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    for (const c of CREDENTIALS) {
      saved[c.name] = process.env[c.name];
      delete process.env[c.name];
    }
    await syncCredentials(true);
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.unstubAllGlobals();
  });

  /** Writes a credential the way another instance would have: straight to the table. */
  async function storeElsewhere(name: string, value: string) {
    const db = await getDb();
    await db
      .insert(schema.providerCredentials)
      .values({ name, value: encryptValue(value, "provider_key"), secret: specFor(name)!.secret })
      .onConflictDoUpdate({ target: schema.providerCredentials.name, set: { value: encryptValue(value, "provider_key") } });
  }

  it("sends through the operator a console on another instance wired", async () => {
    await storeElsewhere("AFRICASTALKING_USERNAME", "congovoice");
    await storeElsewhere("AFRICASTALKING_API_KEY", "atsk_a_long_enough_key_value");
    await storeElsewhere("SMS_PROVIDER", "africastalking");
    // Nothing has told this process; its environment is still empty.
    expect(process.env.SMS_PROVIDER).toBeUndefined();
    resetCredentialSyncForTests();

    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ messageId: "at-1", status: "Success" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { sendSms, smsOutbox, resetSmsOutbox } = await import("@server/channels/sms");
    resetSmsOutbox();
    const result = await sendSms({ to: "+243810000001", text: "Alerte : cas critique à Kinshasa." });

    expect(result.mode).toBe("africastalking");
    expect(calls[0]).toContain("api.africastalking.com");
    expect(smsOutbox()).toHaveLength(0);
  });

  it("reports the alert channel on the readiness probe once it has read the table", async () => {
    await storeElsewhere("AFRICASTALKING_USERNAME", "congovoice");
    await storeElsewhere("AFRICASTALKING_API_KEY", "atsk_a_long_enough_key_value");
    await storeElsewhere("SMS_PROVIDER", "africastalking");
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");

    const { readiness } = await import("@server/core/status");
    expect(readiness().checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(false);

    resetCredentialSyncForTests();
    await syncCredentials();
    expect(readiness().checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(true);
  });

  it("holds its last read for a minute rather than querying on every send", async () => {
    await syncCredentials(true);
    await storeElsewhere("SMS_PROVIDER", "africastalking");
    await storeElsewhere("AFRICASTALKING_USERNAME", "congovoice");
    await storeElsewhere("AFRICASTALKING_API_KEY", "atsk_a_long_enough_key_value");

    // Not forced, and the last read was a moment ago: the row is not seen yet.
    await syncCredentials();
    const { smsMode } = await import("@server/channels/sms");
    expect(smsMode()).toBe("log");

    // Which is the documented window, not a permanent miss.
    resetCredentialSyncForTests();
    await syncCredentials();
    expect(smsMode()).toBe("africastalking");
  });
});
