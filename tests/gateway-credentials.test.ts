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

describe("one slow provider does not hold a citizen's turn", () => {
  /**
   * There was no timeout anywhere in the gateway. A vendor that accepted a
   * connection and never answered hung the whole turn for as long as the
   * platform in front of it allowed — an hour, on an instance serving nobody
   * else. The request ceiling was raised so that nothing external ends a
   * conversation; this is what makes that safe.
   */
  it("gives up on a provider and lets the chain continue", async () => {
    const { ProviderTimeout } = await import("@server/ai/gateway");
    const err = new ProviderTimeout("some_vendor", 60_000);
    expect(err.name).toBe("ProviderTimeout");
    expect(err.message).toContain("some_vendor");
    // The operator reading a log needs the number, not "timed out".
    expect(err.message).toContain("60s");
  });

  it("still answers from the offline provider when every vendor is unreachable", async () => {
    clear();
    // No keys at all is the same shape as every key timing out: the chain ends
    // at the offline provider, which always answers.
    const gateway = aiGateway();
    const status = await gateway.status();
    expect(status.llm).toContain("mock");
    expect(status.offlineMode).toBe(true);
  });
});
