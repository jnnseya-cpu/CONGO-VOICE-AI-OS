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
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete ENV[k];
    else ENV[k] = v;
  }
}

describe("readiness", () => {
  it("passes outside production, where the log provider is the point", () => {
    ENV.NODE_ENV = "test";
    expect(readiness().ok).toBe(true);
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
    asProduction({ SMS_PROVIDER: "africastalking", WHATSAPP_PROVIDER: "log", VOICE_PROVIDER: "log", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://x" });
    expect(readiness().checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(true);
  });

  it("names a missing data key, because what is already recorded becomes unreadable without it", () => {
    asProduction({ SMS_PROVIDER: "twilio", DATA_ENCRYPTION_KEY: undefined, SESSION_SECRET: "x", NEXT_PUBLIC_SITE_URL: "https://x" });
    const r = readiness();
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "data_encryption_key")?.ok).toBe(false);
  });

  it("is ready when everything a promise depends on is present", () => {
    asProduction({ SMS_PROVIDER: "twilio", WHATSAPP_PROVIDER: "meta", VOICE_PROVIDER: "twilio", SESSION_SECRET: "x", DATA_ENCRYPTION_KEY: "y", NEXT_PUBLIC_SITE_URL: "https://congovoice.cd" });
    expect(readiness().ok).toBe(true);
  });
});
