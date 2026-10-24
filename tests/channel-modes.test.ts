import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anyAlertChannelLive, conversationalWhatsappMode, halfWiredChannels, smsMode, voiceMode, whatsappAlertMode } from "@server/channels/modes";
import { readiness } from "@server/core/status";

/**
 * A driver is not a channel.
 *
 * The dangerous state is not "nothing configured" — the platform says so and
 * the readiness probe fails. It is "half configured": an operator chosen with
 * no credentials behind it, which looks wired in the console and writes every
 * escalation to the log. These tests pin the rule that the senders and the
 * readiness probe both answer from.
 */
const CHANNEL_VARS = [
  "SMS_PROVIDER",
  "WHATSAPP_PROVIDER",
  "VOICE_PROVIDER",
  "AFRICASTALKING_USERNAME",
  "AFRICASTALKING_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of CHANNEL_VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllEnvs();
});

describe("the driver alone is never enough", () => {
  it("stays in log mode when an SMS operator is chosen with no key", () => {
    process.env.SMS_PROVIDER = "africastalking";
    expect(smsMode()).toBe("log");
    process.env.AFRICASTALKING_USERNAME = "congovoice";
    expect(smsMode()).toBe("log"); // username without the key is still half-wired
    process.env.AFRICASTALKING_API_KEY = "atsk_long_enough_key";
    expect(smsMode()).toBe("africastalking");
  });

  it("needs all three Twilio values, not one or two", () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    expect(smsMode()).toBe("log");
    process.env.TWILIO_AUTH_TOKEN = "token";
    expect(smsMode()).toBe("log");
    process.env.TWILIO_FROM = "+15550000000";
    expect(smsMode()).toBe("twilio");
  });

  it("stays in log mode when WhatsApp names Meta with no token", () => {
    process.env.WHATSAPP_PROVIDER = "meta";
    expect(whatsappAlertMode()).toBe("log");
    process.env.WHATSAPP_ACCESS_TOKEN = "EAAtest";
    expect(whatsappAlertMode()).toBe("log");
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    expect(whatsappAlertMode()).toBe("meta");
  });

  it("stays in log mode when voice names Twilio with no account", () => {
    process.env.VOICE_PROVIDER = "twilio";
    expect(voiceMode()).toBe("log");
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM = "+15550000000";
    expect(voiceMode()).toBe("twilio");
  });

  it("treats an operator the platform does not implement as no operator", () => {
    process.env.SMS_PROVIDER = "orange-money";
    process.env.AFRICASTALKING_API_KEY = "atsk_long_enough_key";
    process.env.AFRICASTALKING_USERNAME = "congovoice";
    expect(smsMode()).toBe("log");
  });
});

describe("the readiness probe answers from the same rule", () => {
  const escalation = () => readiness().checks.find((c) => c.id === "escalation_delivery");

  beforeEach(() => {
    // A stage that serves citizens, where an undeliverable escalation matters.
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
  });

  it("does not report an alert channel for a driver with no credentials", () => {
    process.env.SMS_PROVIDER = "africastalking";
    expect(escalation()?.ok).toBe(false);
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.VOICE_PROVIDER = "twilio";
    expect(escalation()?.ok).toBe(false);
    expect(anyAlertChannelLive()).toBe(false);
  });

  it("says which half is missing rather than claiming nothing is configured", () => {
    process.env.SMS_PROVIDER = "africastalking";
    process.env.VOICE_PROVIDER = "twilio";
    expect(halfWiredChannels()).toEqual(["SMS", "appel"]);
    expect(escalation()?.detail).toContain("Opérateur nommé sans identifiants");
    expect(escalation()?.detail).toContain("SMS");
  });

  it("calls it nothing configured when no operator was named at all", () => {
    expect(halfWiredChannels()).toEqual([]);
    expect(escalation()?.detail).toContain("Aucun fournisseur d'alerte configuré");
  });

  it("reports it once one channel could actually carry the message", () => {
    process.env.SMS_PROVIDER = "africastalking";
    process.env.AFRICASTALKING_USERNAME = "congovoice";
    process.env.AFRICASTALKING_API_KEY = "atsk_long_enough_key";
    expect(escalation()?.ok).toBe(true);
    expect(escalation()?.detail).toContain("SMS");
  });

  it("fails again when the credentials are withdrawn", () => {
    process.env.SMS_PROVIDER = "africastalking";
    process.env.AFRICASTALKING_USERNAME = "congovoice";
    process.env.AFRICASTALKING_API_KEY = "atsk_long_enough_key";
    expect(escalation()?.ok).toBe(true);
    delete process.env.AFRICASTALKING_API_KEY;
    expect(escalation()?.ok).toBe(false);
  });
});

describe("the conversational WhatsApp channel", () => {
  it("answers through Meta whichever operator carries the alerts", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "EAAtest";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    process.env.WHATSAPP_PROVIDER = "twilio";
    expect(conversationalWhatsappMode()).toBe("graph");
  });

  it("stops sending when an administrator chooses log", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "EAAtest";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    process.env.WHATSAPP_PROVIDER = "log";
    expect(conversationalWhatsappMode()).toBe("log");
  });

  it("keeps working for a deployment that never named an operator", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "EAAtest";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    expect(conversationalWhatsappMode()).toBe("graph");
  });
});
