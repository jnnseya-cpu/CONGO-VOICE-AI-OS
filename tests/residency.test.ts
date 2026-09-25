/**
 * The residency guard.
 *
 * The programme wants everything in the DRC, there is no cloud region there,
 * and the pilot therefore runs from the nearest available one. That is a
 * defensible decision. What would not be defensible is a platform that claims
 * one posture while an environment variable quietly implements another — so
 * these tests are about the gap between the claim and the configuration, and
 * about making a forbidden destination genuinely unreachable rather than merely
 * discouraged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  UNDECLARED,
  deploymentJurisdiction,
  destination,
  destinations,
  permits,
  permittedOf,
  residencyPolicy,
  residencyReadiness,
  residencyReport,
} from "@server/core/residency";

const ROOT = process.cwd();

afterEach(() => vi.unstubAllEnvs());

describe("the policy", () => {
  it("is unrestricted when nothing is declared, which is right on a laptop", () => {
    vi.stubEnv("DATA_RESIDENCY", "");
    const policy = residencyPolicy();
    expect(policy.restricted).toBe(false);
    expect(permits("anthropic", policy).permitted).toBe(true);
  });

  it("permits only what it names", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD,ZA");
    const policy = residencyPolicy();
    expect(policy.permitted).toEqual(["CD", "ZA"]);
    expect(permits("anthropic", policy)).toMatchObject({ permitted: false, reason: "outside_policy", offending: ["US"] });
  });

  it("reads a list written with spaces and mixed case", () => {
    vi.stubEnv("DATA_RESIDENCY", " cd , za ");
    expect(residencyPolicy().permitted).toEqual(["CD", "ZA"]);
  });

  it("treats an undeclared jurisdiction as forbidden, never as probably fine", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("OPENAI_BASE_URL", "https://speech.internal.gov.cd/v1");
    vi.stubEnv("AI_SELF_HOSTED_JURISDICTION", "");
    expect(destination("openai")?.jurisdictions).toEqual([UNDECLARED]);
    expect(permits("openai")).toMatchObject({ permitted: false, reason: "undeclared_jurisdiction" });
  });

  it("permits a self-hosted endpoint once its location is declared", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("OPENAI_BASE_URL", "https://speech.internal.gov.cd/v1");
    vi.stubEnv("AI_SELF_HOSTED_JURISDICTION", "CD");
    expect(permits("openai").permitted).toBe(true);
  });

  it("refuses a destination nobody declared at all", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    expect(permits("some-new-vendor")).toMatchObject({ permitted: false, reason: "unknown_destination" });
  });

  it("keeps the offline provider available under the strictest possible policy", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "CD");
    expect(permits("mock").permitted).toBe(true);
    expect(permits("self").permitted).toBe(true);
  });

  it("refuses the deployment itself when it is hosted outside the policy", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "ZA");
    // The honest answer to "may data be in South Africa" when the policy says
    // CD only: no — and the platform says so rather than quietly serving.
    expect(permits("self").permitted).toBe(false);
  });
});

describe("filtering a provider chain", () => {
  it("drops what is outside the policy and keeps the order of the rest", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "CD");
    expect(permittedOf(["anthropic", "gemini", "openai", "mock"])).toEqual(["mock"]);
  });

  it("keeps everything when the policy admits the jurisdictions in play", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD,US");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "CD");
    expect(permittedOf(["anthropic", "gemini", "mock"])).toEqual(["anthropic", "gemini", "mock"]);
  });
});

describe("the report a deployment would have to give", () => {
  it("states the jurisdictions data actually reaches, not the ones intended", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD,ZA,US");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "ZA");
    const report = residencyReport(["anthropic", "mock", "twilio"]);
    expect(report.compliant).toBe(true);
    expect(report.reach).toEqual(["US", "ZA"]);
    // Permitted is not the same as achieved. The intent is CD and this is not it.
    expect(report.meetsIntent).toBe(false);
  });

  it("recognises the one configuration that meets the intent", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "CD");
    const report = residencyReport(["mock"]);
    expect(report.reach).toEqual(["CD"]);
    expect(report.meetsIntent).toBe(true);
  });

  it("names what is configured but refused, and what that costs", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "CD");
    const report = residencyReport(["anthropic", "twilio", "mock"]);
    expect(report.compliant).toBe(false);
    expect(report.refused.map((r) => r.id).sort()).toEqual(["anthropic", "twilio"]);
    expect(report.refused.find((r) => r.id === "twilio")?.ifRefused).toMatch(/escalation/i);
  });
});

describe("readiness", () => {
  it("says nothing on a laptop", () => {
    vi.stubEnv("DATA_RESIDENCY", "");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "");
    expect(residencyReadiness(["mock"], "dev").every((c) => c.ok)).toBe(true);
  });

  it("reports an undeclared policy in a deployment that serves citizens", () => {
    vi.stubEnv("DATA_RESIDENCY", "");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "ZA");
    const checks = residencyReadiness(["mock"], "pilot");
    expect(checks.find((c) => c.id === "residency_policy_declared")?.ok).toBe(false);
  });

  it("reports a deployment that never said where it is running", () => {
    vi.stubEnv("DATA_RESIDENCY", "ZA");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "");
    expect(deploymentJurisdiction()).toBe(UNDECLARED);
    const checks = residencyReadiness(["mock"], "pilot");
    expect(checks.find((c) => c.id === "deployment_jurisdiction_declared")?.ok).toBe(false);
  });

  it("reports a configuration the policy forbids", () => {
    vi.stubEnv("DATA_RESIDENCY", "CD");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "CD");
    const checks = residencyReadiness(["anthropic"], "pilot");
    const consistency = checks.find((c) => c.id === "residency_configuration_consistent");
    expect(consistency?.ok).toBe(false);
    expect(consistency?.detail).toContain("anthropic");
  });

  it("passes when the declared policy and the configuration agree", () => {
    vi.stubEnv("DATA_RESIDENCY", "ZA,US");
    vi.stubEnv("DEPLOYMENT_JURISDICTION", "ZA");
    expect(residencyReadiness(["anthropic", "mock"], "pilot").every((c) => c.ok)).toBe(true);
  });
});

describe("the inventory cannot fall behind the code", () => {
  it("declares every provider the gateway can register", () => {
    const gateway = fs.readFileSync(path.join(ROOT, "src/server/ai/gateway.ts"), "utf8");
    const keys = new Set([...gateway.matchAll(/this\.registry\.(?:llm|stt|tts)\.set\("([^"]+)"/g)].map((m) => m[1]));
    expect(keys.size).toBeGreaterThan(3);
    for (const key of keys) {
      expect(destination(key), `${key} is registrable but not declared in DESTINATIONS`).toBeTruthy();
    }
  });

  it("declares every message and voice provider the code can dispatch through", () => {
    const notifications = fs.readFileSync(path.join(ROOT, "src/server/core/notifications.ts"), "utf8");
    const providers = new Set([...notifications.matchAll(/provider === "([a-z_]+)"/g)].map((m) => m[1]));
    for (const provider of providers) {
      expect(destination(provider), `${provider} is dispatched to but not declared`).toBeTruthy();
    }
  });

  it("gives every destination a jurisdiction, an operator and a consequence", () => {
    for (const d of destinations()) {
      expect(d.jurisdictions.length, `${d.id} has no jurisdiction`).toBeGreaterThan(0);
      expect(d.operator.length, `${d.id} has no operator`).toBeGreaterThan(3);
      expect(d.ifRefused.length, `${d.id} does not say what refusing it costs`).toBeGreaterThan(15);
      expect(d.sends.length, `${d.id} does not say what it receives`).toBeGreaterThan(20);
    }
  });

  it("keeps docs/DATA_RESIDENCY.md identical to what the declarations generate", () => {
    const before = fs.readFileSync(path.join(ROOT, "docs/DATA_RESIDENCY.md"), "utf8");
    execFileSync("node", ["scripts/build-residency-doc.mjs"], { cwd: ROOT, encoding: "utf8" });
    const after = fs.readFileSync(path.join(ROOT, "docs/DATA_RESIDENCY.md"), "utf8");
    expect(after, "docs/DATA_RESIDENCY.md is stale — run `npm run residency:doc`").toBe(before);
  });
});
