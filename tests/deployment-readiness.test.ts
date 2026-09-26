import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { DEPLOYMENT_CHECKS, readiness } from "@server/core/status";

/**
 * The first deploy that reached its database still would not start: the probe
 * asked /system/health, which reports whether the PROGRAMME is ready — an
 * escalation provider, a review board with quorum, a signed clinical corpus —
 * and every one of those is arranged through the running platform. The board is
 * appointed in the admin console, which needs the service that was waiting for
 * the board.
 *
 * These tests pin the line between the two questions, because getting it wrong
 * in either direction is serious: too wide and the platform cannot deploy at
 * all, too narrow and a genuinely broken container is reported healthy.
 */

const KEYS = [
  "DEPLOYMENT_STAGE", "NODE_ENV", "SESSION_SECRET", "DATA_ENCRYPTION_KEY",
  "NEXT_PUBLIC_SITE_URL", "SMS_PROVIDER", "WHATSAPP_PROVIDER", "VOICE_PROVIDER",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** A pilot deployment with its secrets in place and nothing operated yet. */
function freshPilot() {
  process.env.NODE_ENV = "production";
  process.env.DEPLOYMENT_STAGE = "pilot";
  process.env.SESSION_SECRET = "a".repeat(64);
  process.env.DATA_ENCRYPTION_KEY = "b".repeat(64);
  process.env.NEXT_PUBLIC_SITE_URL = "https://congovoicecd.com";
  delete process.env.SMS_PROVIDER;
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.VOICE_PROVIDER;
}

const deploymentFailures = () =>
  readiness().checks.filter((c) => DEPLOYMENT_CHECKS.includes(c.id) && !c.ok).map((c) => c.id);

describe("a deployment can start before the programme is ready", () => {
  it("has nothing a deployment can be blamed for, on a fresh pilot", () => {
    freshPilot();
    expect(deploymentFailures()).toEqual([]);
  });

  it("but still reports the programme as not ready, so it stays visible", () => {
    freshPilot();
    const failing = readiness().checks.filter((c) => !c.ok).map((c) => c.id);
    // The very check that deadlocked the deploy: no provider, so an escalation
    // would reach nobody. It must be reported and must not block starting.
    expect(failing).toContain("escalation_delivery");
    expect(DEPLOYMENT_CHECKS).not.toContain("escalation_delivery");
  });

  it("names only things no amount of operating the platform could fix", () => {
    expect([...DEPLOYMENT_CHECKS].sort()).toEqual(["data_encryption_key", "public_origin", "session_secret"]);
  });
});

describe("a genuinely broken deployment is still refused", () => {
  for (const [variable, id] of [
    ["SESSION_SECRET", "session_secret"],
    ["DATA_ENCRYPTION_KEY", "data_encryption_key"],
    ["NEXT_PUBLIC_SITE_URL", "public_origin"],
  ] as const) {
    it(`fails when ${variable} is missing in production`, () => {
      freshPilot();
      delete process.env[variable];
      expect(deploymentFailures()).toContain(id);
    });
  }

  it("reports every missing secret at once rather than one at a time", () => {
    freshPilot();
    delete process.env.SESSION_SECRET;
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(deploymentFailures()).toEqual(
      expect.arrayContaining(["session_secret", "data_encryption_key"]),
    );
  });
});

describe("configuring an escalation channel is what clears that check", () => {
  it("passes once any one of the three providers is real", () => {
    for (const provider of ["SMS_PROVIDER", "WHATSAPP_PROVIDER", "VOICE_PROVIDER"] as const) {
      freshPilot();
      process.env[provider] = "twilio";
      const check = readiness().checks.find((c) => c.id === "escalation_delivery");
      expect(check?.ok, provider).toBe(true);
    }
  });

  it("a log-only provider does not count as reaching anyone", () => {
    freshPilot();
    process.env.SMS_PROVIDER = "log";
    expect(readiness().checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(false);
  });
});
