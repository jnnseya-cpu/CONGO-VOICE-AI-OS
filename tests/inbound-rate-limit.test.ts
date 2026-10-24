import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@server/db/client";
import { inboundChannelAllowed } from "@server/channels/http";

/**
 * USSD and inbound SMS are unauthenticated by design — the operator posts form
 * fields and there is no signature to check — and each turn costs a session, a
 * model call and an outbound message. Without a ceiling, a public endpoint
 * spends the programme's budget and sends messages on request.
 *
 * The ceiling is far above human speed, so these tests check that an ordinary
 * conversation is never touched and a flood is.
 */
describe("inbound channel rate limit", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("lets an ordinary conversation through", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await inboundChannelAllowed("ussd", "+243900000111")).toBe(true);
    }
  });

  it("stops one number from flooding a channel", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 40; i++) results.push(await inboundChannelAllowed("sms", "+243900000222"));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(20);
    expect(results.at(-1)).toBe(false);
  });

  it("counts each channel separately, and each number separately", async () => {
    for (let i = 0; i < 25; i++) await inboundChannelAllowed("ussd", "+243900000333");
    expect(await inboundChannelAllowed("ussd", "+243900000333")).toBe(false);
    // Same person, other channel: still a person.
    expect(await inboundChannelAllowed("sms", "+243900000333")).toBe(true);
    // Another number is not affected by their neighbour's flood.
    expect(await inboundChannelAllowed("ussd", "+243900000444")).toBe(true);
  });

  it("refuses a request with no number at all", async () => {
    expect(await inboundChannelAllowed("ussd", "")).toBe(false);
  });
});
