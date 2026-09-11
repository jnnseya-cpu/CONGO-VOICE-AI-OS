import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";
import { NextRequest } from "next/server";

import { clientIp } from "@server/core/api";
import { decodeSession, encodeSession, hashPin, needsRehash, verifyPin } from "@server/core/auth";
import { blindIndex, decryptBytes, decryptIfEncrypted, decryptValue, encryptBytes, encryptValue, isEncrypted } from "@server/core/crypto";
import { checkLockout, clearFailures, isWeakPin, lockoutDuration, recordFailure } from "@server/core/lockout";
import { checkSharedRateLimit, resetRateLimits } from "@server/core/rate-limit";
import { storage } from "@server/core/storage";
import { getDb, resetDbForTests } from "@server/db/client";
import { DEMO_PIN, SeedRefused, seedPin } from "@server/db/seed";
import { env } from "@server/core/env";

describe("PIN hashing", () => {
  it("records the work factor it used, so raising the cost does not lock anyone out", () => {
    const cheap = hashPin("8391", 16384);
    expect(cheap.startsWith("scrypt$16384$")).toBe(true);
    expect(verifyPin("8391", cheap)).toBe(true);
    expect(verifyPin("8392", cheap)).toBe(false);
    expect(needsRehash(cheap)).toBe(true);
  });

  it("still reads a hash written in the original salt:hash form", () => {
    const salt = randomBytes(16).toString("hex");
    const legacy = `${salt}:${scryptSync("4417", salt, 32).toString("hex")}`;
    expect(verifyPin("4417", legacy)).toBe(true);
    expect(verifyPin("1111", legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("refuses the PINs an attacker tries first", () => {
    for (const weak of ["0000", "1111", "1234", "4321", "123456", "654321"]) expect(isWeakPin(weak)).toBe(true);
    for (const fine of ["8391", "4417", "290613"]) expect(isWeakPin(fine)).toBe(false);
  });
});

describe("session revocation", () => {
  it("stamps every token with the moment it was issued", () => {
    const before = Date.now();
    const token = encodeSession({ userId: "u1", role: "chw", language: "fr", anonymous: false });
    const session = decodeSession(token);
    expect(session?.iat).toBeGreaterThanOrEqual(before);
    expect(session?.iat).toBeLessThanOrEqual(Date.now());
  });

  it("refuses a token whose lifetime has run out", () => {
    const expired = encodeSession(
      { userId: "u1", role: "chw", language: "fr", anonymous: false },
      Date.now() - (env.sessionTtlHours * 3600 * 1000 + 1000),
    );
    expect(decodeSession(expired)).toBeNull();
  });

  it("keeps issued-at inside the signature, so it cannot be backdated", () => {
    const token = encodeSession({ userId: "u1", role: "chw", language: "fr", anonymous: false });
    const [payload, sig] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    claims.iat = 0;
    const forged = Buffer.from(JSON.stringify(claims)).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toBeNull();
  });
});

describe("forwarded address", () => {
  const req = (value: string) => new NextRequest("https://congovoice.cd/api/v1/auth/login", { headers: { "x-forwarded-for": value } });

  it("reads the hop our own proxy wrote, not the one the caller claims", () => {
    // One trusted proxy: the right-most entry is the address it observed.
    expect(env.trustedProxyHops).toBe(1);
    expect(clientIp(req("41.243.1.1"))).toBe("41.243.1.1");
    // A caller prefixing a forged address must not shift which entry is read.
    expect(clientIp(req("10.0.0.99, 41.243.1.1"))).toBe("41.243.1.1");
    expect(clientIp(req("1.1.1.1, 2.2.2.2, 41.243.1.1"))).toBe("41.243.1.1");
  });
});

describe("field and object encryption", () => {
  it("round-trips a value and refuses a tampered one", () => {
    const envelope = encryptValue("JBSWY3DPEHPK3PXP", "mfa");
    expect(isEncrypted(envelope)).toBe(true);
    expect(envelope).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptValue(envelope, "mfa")).toBe("JBSWY3DPEHPK3PXP");
    const parts = envelope.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 0x01;
    expect(() => decryptValue([parts[0], parts[1], parts[2], flipped.toString("base64url")].join("."), "mfa")).toThrow();
  });

  it("keeps purposes apart, so one key cannot read another's data", () => {
    const envelope = encryptValue("secret", "mfa");
    expect(() => decryptValue(envelope, "storage")).toThrow();
  });

  it("passes through a value written before encryption existed", () => {
    expect(decryptIfEncrypted("plain-old-seed", "mfa")).toBe("plain-old-seed");
    expect(decryptIfEncrypted(null, "mfa")).toBeNull();
  });

  it("round-trips binary and detects a flipped byte", () => {
    const audio = Buffer.from("RIFF....fake webm audio....", "utf8");
    const sealed = encryptBytes(audio, "storage");
    expect(sealed.subarray(0, 5).toString()).toBe("CVOS1");
    expect(sealed.includes(audio)).toBe(false);
    expect(decryptBytes(sealed, "storage").equals(audio)).toBe(true);
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decryptBytes(sealed, "storage")).toThrow();
  });

  it("gives a stable, non-reversible index for lookups", () => {
    expect(blindIndex("+243900000001", "phone")).toBe(blindIndex(" +243900000001 ", "phone"));
    expect(blindIndex("+243900000001", "phone")).not.toContain("243900000001");
    expect(blindIndex("+243900000001", "phone")).not.toBe(blindIndex("+243900000002", "phone"));
  });
});

describe("stored files", () => {
  it("writes ciphertext and reads back the original bytes", async () => {
    const plaintext = Buffer.from("un enregistrement de voix", "utf8");
    await storage().put("test/encryption-check.bin", plaintext, "application/octet-stream");
    const readBack = await storage().get("test/encryption-check.bin");
    expect(readBack.equals(plaintext)).toBe(true);
    await storage().delete("test/encryption-check.bin");
  });
});

describe("sign-in lockout", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("locks after the configured number of failures and lets the account back in when cleared", async () => {
    const db = await getDb();
    const phone = "+243900999001";
    for (let i = 1; i < env.auth.maxFailures; i++) {
      const state = await recordFailure(db, "phone", phone);
      expect(state.locked, `failure ${i} must not lock yet`).toBe(false);
    }
    const final = await recordFailure(db, "phone", phone);
    expect(final.locked).toBe(true);
    expect(final.retryAfterSeconds).toBe(env.auth.lockoutSeconds);
    expect((await checkLockout(db, "phone", phone)).locked).toBe(true);

    await clearFailures(db, "phone", phone);
    expect((await checkLockout(db, "phone", phone)).locked).toBe(false);
  });

  it("counts one address separately from another", async () => {
    const db = await getDb();
    for (let i = 0; i < env.auth.maxFailures; i++) await recordFailure(db, "ip", "41.0.0.1");
    expect((await checkLockout(db, "ip", "41.0.0.1")).locked).toBe(true);
    expect((await checkLockout(db, "ip", "41.0.0.2")).locked).toBe(false);
  });

  it("doubles the wait for each further burst", () => {
    const base = env.auth.lockoutSeconds;
    expect(lockoutDuration(env.auth.maxFailures)).toBe(base);
    expect(lockoutDuration(env.auth.maxFailures * 2)).toBe(base * 2);
    expect(lockoutDuration(env.auth.maxFailures * 3)).toBe(base * 4);
    expect(lockoutDuration(env.auth.maxFailures * 100)).toBe(86_400);
  });
});

describe("shared rate limit", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("counts in the database, so a second instance sees the same total", async () => {
    const db = await getDb();
    const key = `test:${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 3; i++) {
      const r = await checkSharedRateLimit(db, key, 3, 60);
      expect(r.allowed, `request ${i + 1} of 3`).toBe(true);
      expect(r.shared).toBe(true);
    }
    // A fresh process has an empty local window; the shared counter still refuses.
    resetRateLimits();
    const over = await checkSharedRateLimit(db, key, 3, 60);
    expect(over.allowed).toBe(false);
    expect(over.shared).toBe(true);
  });
});

describe("demonstration data", () => {
  const withNodeEnv = (value: string, fn: () => void) => {
    const previous = process.env.NODE_ENV;
    // NODE_ENV is read-only in the Node types but writable at runtime.
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
    try {
      fn();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }
  };

  it("uses the printed PIN outside production", () => {
    withNodeEnv("development", () => expect(seedPin()).toBe(DEMO_PIN));
  });

  it("refuses to write a known-PIN administrator into a production database", () => {
    withNodeEnv("production", () => {
      delete (process.env as Record<string, string | undefined>).SEED_ALLOW_PRODUCTION;
      expect(() => seedPin()).toThrow(SeedRefused);
    });
  });

  it("still refuses when the override is set but no PIN is supplied", () => {
    withNodeEnv("production", () => {
      (process.env as Record<string, string | undefined>).SEED_ALLOW_PRODUCTION = "true";
      delete (process.env as Record<string, string | undefined>).SEED_PIN;
      expect(() => seedPin()).toThrow(/SEED_PIN/);
      (process.env as Record<string, string | undefined>).SEED_PIN = "12";
      expect(() => seedPin()).toThrow(/six/);
      (process.env as Record<string, string | undefined>).SEED_PIN = "704913";
      expect(seedPin()).toBe("704913");
      delete (process.env as Record<string, string | undefined>).SEED_ALLOW_PRODUCTION;
      delete (process.env as Record<string, string | undefined>).SEED_PIN;
    });
  });
});
