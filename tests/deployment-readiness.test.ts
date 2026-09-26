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
  for (const k of KEYS) setEnv(k, saved[k]);
});

/**
 * Written through an indexed setter rather than `process.env.NODE_ENV = ...`:
 * the typings mark that property read-only, and vitest does not typecheck, so a
 * direct assignment passes here and fails `npm run typecheck`.
 */
function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** A pilot deployment with its secrets in place and nothing operated yet. */
function freshPilot() {
  setEnv("NODE_ENV", "production");
  setEnv("DEPLOYMENT_STAGE", "pilot");
  setEnv("SESSION_SECRET", "a".repeat(64));
  setEnv("DATA_ENCRYPTION_KEY", "b".repeat(64));
  setEnv("NEXT_PUBLIC_SITE_URL", "https://congovoicecd.com");
  for (const p of ["SMS_PROVIDER", "WHATSAPP_PROVIDER", "VOICE_PROVIDER"]) setEnv(p, undefined);
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
      setEnv(variable, undefined);
      expect(deploymentFailures()).toContain(id);
    });
  }

  it("reports every missing secret at once rather than one at a time", () => {
    freshPilot();
    setEnv("SESSION_SECRET", undefined);
    setEnv("DATA_ENCRYPTION_KEY", undefined);
    expect(deploymentFailures()).toEqual(
      expect.arrayContaining(["session_secret", "data_encryption_key"]),
    );
  });
});

describe("configuring an escalation channel is what clears that check", () => {
  it("passes once any one of the three providers is real", () => {
    for (const provider of ["SMS_PROVIDER", "WHATSAPP_PROVIDER", "VOICE_PROVIDER"] as const) {
      freshPilot();
      setEnv(provider, "twilio");
      const check = readiness().checks.find((c) => c.id === "escalation_delivery");
      expect(check?.ok, provider).toBe(true);
    }
  });

  it("a log-only provider does not count as reaching anyone", () => {
    freshPilot();
    setEnv("SMS_PROVIDER", "log");
    expect(readiness().checks.find((c) => c.id === "escalation_delivery")?.ok).toBe(false);
  });
});

describe("no container probe may point at the programme's readiness report", () => {
  /**
   * The liveness probe was on /system/health, which returns 503 until the review
   * board has its quorum. Cloud Run killed the container every seventy seconds
   * for as long as that was true, and a citizen saw an internal error from a
   * platform that was working. A probe on health is never correct, wherever it
   * is configured, so both places that configure one are checked here.
   */
  const files = ["Dockerfile", "scripts/go-live.sh"] as const;

  for (const file of files) {
    it(`${file} probes /system/ready, not /system/health`, async () => {
      const { readFileSync } = await import("node:fs");
      const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const probeLines = text
        .split("\n")
        .filter((l) => /HEALTHCHECK|startup-probe|liveness-probe|readiness-probe/.test(l) || /httpGet\.path/.test(l));
      expect(probeLines.length, `${file} configures no probe`).toBeGreaterThan(0);
      for (const line of probeLines) {
        expect(line, `${file}: ${line.trim()}`).not.toContain("/api/v1/system/health");
      }
    });
  }

  it("go-live.sh states a liveness probe rather than letting one be inferred", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../scripts/go-live.sh", import.meta.url), "utf8");
    // Unset, Cloud Run derives one from the image's HEALTHCHECK.
    expect(text).toContain("--liveness-probe=");
    expect(text).toContain("--startup-probe=");
  });
});
