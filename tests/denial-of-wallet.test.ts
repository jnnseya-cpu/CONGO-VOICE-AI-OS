/**
 * Provider spend, attacked rather than reasoned about.
 *
 * Nothing on this platform asks a citizen to pay, and nothing asks them to
 * register: anonymous sign-in is the intended front door for a voice-first
 * service. That combination is also the whole attack. The AI rate limit was
 * keyed on the account, and a new account costs one request, so the ceiling was
 * defeated by asking for another one — repeatedly, from a single address, against
 * a bill paid by a government programme.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests } from "@server/db/client";
import { checkSharedRateLimit } from "@server/core/rate-limit";
import { env } from "@server/core/env";

const BASE = "http://localhost:3000";

function loginReq(ip: string) {
  return new NextRequest(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", "x-forwarded-for": ip }),
    body: JSON.stringify({ anonymous: true, language: "fr", consent: true }),
  });
}

describe("minting accounts to defeat the AI ceiling", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("caps provider spend per address, not only per account", async () => {
    const db = await getDb();
    const ip = "41.243.10.7";
    const perAccount = env.rateLimit.maxAiRequests;
    const perIp = env.rateLimit.maxAiRequestsPerIp;
    expect(perIp, "the per-address ceiling must exist").toBeGreaterThan(0);

    // Spend up to the per-address ceiling across as many distinct accounts as
    // the attacker likes. Each account is fresh, so the per-account bucket never
    // refuses; only the address bucket can.
    let allowed = 0;
    for (let i = 0; i < perIp + 10; i += 1) {
      const freshAccount = `ai:user-${i}`; // a new account for every request
      const account = await checkSharedRateLimit(db, freshAccount, perAccount, env.rateLimit.windowSeconds);
      expect(account.allowed, "a brand-new account is never the thing that refuses").toBe(true);
      const address = await checkSharedRateLimit(db, `ai-ip:${ip}`, perIp, env.rateLimit.windowSeconds);
      if (address.allowed) allowed += 1;
    }
    expect(allowed, `spend from one address must stop at ${perIp}`).toBe(perIp);
  });

  it("keeps one address's spend separate from another's", async () => {
    const db = await getDb();
    const perIp = env.rateLimit.maxAiRequestsPerIp;
    for (let i = 0; i < perIp; i += 1) await checkSharedRateLimit(db, "ai-ip:41.243.10.8", perIp, 60);
    const exhausted = await checkSharedRateLimit(db, "ai-ip:41.243.10.8", perIp, 60);
    expect(exhausted.allowed).toBe(false);
    const other = await checkSharedRateLimit(db, "ai-ip:41.243.10.9", perIp, 60);
    expect(other.allowed, "a clinic next door must not be blocked by its neighbour").toBe(true);
  });

  it("leaves room for a shared address to be genuinely busy", () => {
    // A health centre, a school or a cybercafé arrives on one NAT address. The
    // ceiling has to be above what a building legitimately does, or the fix is
    // an outage for the people the platform exists for.
    expect(env.rateLimit.maxAiRequestsPerIp).toBeGreaterThan(env.rateLimit.maxAiRequests);
  });

  it("still rate-limits anonymous account creation itself", async () => {
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const ip = "41.243.10.11";
    let refused = 0;
    for (let i = 0; i < env.rateLimit.maxAuthRequests + 5; i += 1) {
      const res = await POST(loginReq(ip));
      if (res.status === 429) refused += 1;
    }
    expect(refused, "minting accounts must itself be bounded per address").toBeGreaterThan(0);
  });
});
