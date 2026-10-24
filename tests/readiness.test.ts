import { afterEach, describe, expect, it } from "vitest";

import { readiness } from "@server/core/status";

/**
 * The promise the platform makes to a citizen in an emergency is that a person
 * will be told. Everything else can degrade; that cannot degrade silently.
 */
const ENV = process.env as Record<string, string | undefined>;
const saved = { ...ENV };

afterEach(() => {
  for (const k of Object.keys(ENV)) if (!(k in saved)) delete ENV[k];
  Object.assign(ENV, saved);
});

function asProduction(patch: Record<string, string | undefined>) {
  ENV.NODE_ENV = "production";
  ENV.DEPLOYMENT_STAGE = "prod";
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete ENV[k];
    else ENV[k] = v;
  }
}

describe("readiness", () => {
  it("passes outside production, where the log provider is the point", () => {
    ENV.NODE_ENV = "test";
    delete ENV.DEPLOYMENT_STAGE;
    expect(readiness().ok).toBe(true);
  });

  it("does not demand telephony of a staging environment that serves nobody", () => {
    asProduction({ DEPLOYMENT_STAGE: "staging", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", VOICE_PROVIDER: "log", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://x" });
    const r = readiness();
    expect(r.stage).toBe("staging");
    expect(r.checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(true);
    // The other promises still have to hold: staging holds real-shaped data.
    expect(r.ok).toBe(true);
  });

  it("demands it of a pilot province, which does serve citizens", () => {
    asProduction({ DEPLOYMENT_STAGE: "pilot", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", VOICE_PROVIDER: "log", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://x" });
    expect(readiness().ok).toBe(false);
  });

  it("refuses to call itself ready when an escalation would reach nobody", () => {
    asProduction({ SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", VOICE_PROVIDER: "log", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://x" });
    const r = readiness();
    expect(r.ok).toBe(false);
    const escalation = r.checks.find((c) => c.id === "escalation_delivery");
    expect(escalation?.ok).toBe(false);
    expect(escalation?.detail).toContain("n'atteindrait personne");
  });

  it("is satisfied by any one real alert channel", () => {
    asProduction({ SMS_PROVIDER: "africastalking", AFRICASTALKING_USERNAME: "congovoice", AFRICASTALKING_API_KEY: "atsk_long_enough_key", WHATSAPP_PROVIDER: "log", VOICE_PROVIDER: "log", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://x" });
    expect(readiness().checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(true);
  });

  it("is not satisfied by the operator's name alone", () => {
    // An operator chosen with no key behind it writes every escalation to the
    // log. Reporting that as a working alert channel is the one lie this file
    // exists to prevent.
    asProduction({ SMS_PROVIDER: "africastalking", WHATSAPP_PROVIDER: "log", VOICE_PROVIDER: "log", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://x" });
    const escalation = readiness().checks.find((c) => c.id === "escalation_delivery");
    expect(escalation?.ok).toBe(false);
    expect(escalation?.detail).toContain("sans identifiants");
  });

  it("names a missing data key, because what is already recorded becomes unreadable without it", () => {
    asProduction({ SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "token", TWILIO_FROM: "+15550000000", DATA_ENCRYPTION_KEY: undefined, SESSION_SECRET: "x", NEXT_PUBLIC_SITE_URL: "https://x" });
    const r = readiness();
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "data_encryption_key")?.ok).toBe(false);
  });

  it("is ready when everything a promise depends on is present", () => {
    asProduction({
      SMS_PROVIDER: "twilio",
      WHATSAPP_PROVIDER: "meta",
      VOICE_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_FROM: "+15550000000",
      WHATSAPP_ACCESS_TOKEN: "EAAtest",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      SESSION_SECRET: "x",
      DATA_ENCRYPTION_KEY: "y",
      NEXT_PUBLIC_SITE_URL: "https://congovoicecd.com",
    });
    expect(readiness().ok).toBe(true);
  });
});
