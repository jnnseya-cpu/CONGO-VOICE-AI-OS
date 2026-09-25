import { describe, expect, it, afterEach } from "vitest";
import { aiGateway, resetGatewayForTests } from "@server/ai/gateway";

/**
 * Terraform creates the secret containers; a person fills them in. Between
 * those two moments the variable is mounted and blank, and a blank credential
 * must not be mistaken for a configured provider — a registered provider with
 * no usable key fails every call with a 401, which reads as an outage rather
 * than as a key nobody has supplied yet.
 */
const KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "OPENAI_API_KEY", "GOOGLE_TTS_API_KEY"] as const;

function clear() {
  for (const key of KEYS) delete process.env[key];
  resetGatewayForTests();
}

afterEach(clear);

async function providers(): Promise<string[]> {
  resetGatewayForTests();
  return aiGateway().activeProviders();
}

describe("a blank credential is not a configured provider", () => {
  it("registers only the offline provider when no key is set at all", async () => {
    clear();
    expect(await providers()).toEqual(["mock"]);
  });

  for (const blank of ["", " ", "\t", "\n  "]) {
    it(`ignores a key that is ${JSON.stringify(blank)}`, async () => {
      clear();
      for (const key of KEYS) process.env[key] = blank;
      expect(await providers()).toEqual(["mock"]);
    });
  }

  it("registers a vendor once its key carries an actual value", async () => {
    clear();
    process.env.OPENAI_API_KEY = "sk-not-a-real-key";
    expect(await providers()).toContain("openai");
  });

  it("trims a key rather than rejecting it for surrounding whitespace", async () => {
    clear();
    // `gcloud secrets versions add` from a heredoc is a common way to acquire a
    // trailing newline; the key itself is fine.
    process.env.GEMINI_API_KEY = "  AIza-not-a-real-key\n";
    expect(await providers()).toContain("gemini");
  });
});
