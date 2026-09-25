import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { maskStoredPhone, normalisePhone, phoneColumns, phoneLookup, readPhone } from "@server/core/phone";
import { MAX_CLAIM_ATTEMPTS, confirmIdentifierClaim, openClaims, pruneIdentifierClaims, requestIdentifierClaim } from "@server/core/identifiers";
import { hashIdentifier } from "@server/channels/session";
import { getDb, resetDbForTests, schema } from "@server/db/client";

describe("phone numbers at rest (SEC-05)", () => {
  it("stores ciphertext, never the digits", () => {
    const cols = phoneColumns("+243 900 000 111");
    expect(cols.phone).not.toBeNull();
    expect(cols.phone).not.toContain("243900000111");
    expect(readPhone(cols.phone)).toBe("+243900000111");
  });

  it("finds an account however the number was typed", () => {
    const stored = phoneColumns("+243900000111");
    for (const typed of ["+243900000111", "243900000111", "00243900000111", "+243 900 000 111", "+243-900-000-111"]) {
      expect(phoneLookup(typed), typed).toBe(stored.phoneIndex);
    }
  });

  it("gives different numbers different digests, and leaks nothing about them", () => {
    const a = phoneLookup("+243900000111");
    const b = phoneLookup("+243900000112");
    expect(a).not.toBe(b);
    expect(a).not.toContain("243900000111");
  });

  it("shows only the last four digits in a directory", () => {
    expect(maskStoredPhone(phoneColumns("+243900000111").phone)).toBe("…0111");
    expect(maskStoredPhone(null)).toBeNull();
  });

  it("reads a row written before encryption existed", () => {
    expect(readPhone("+243900000111")).toBe("+243900000111");
  });

  it("normalises the shapes people actually type", () => {
    expect(normalisePhone("00243900000111")).toBe("+243900000111");
    expect(normalisePhone(" +243 900 000 111 ")).toBe("+243900000111");
  });
});

describe("linking another way to reach the same citizen (FR-CH-40, SEC-04)", () => {
  let userId: string;

  beforeEach(async () => {
    resetDbForTests();
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ ...phoneColumns("+243900000111"), role: "citizen", languagePreference: "fr" }).returning();
    userId = u.id;
  });

  async function claim(value = "+243900000222") {
    return requestIdentifierClaim({
      userId,
      kind: "whatsapp",
      value,
      valueHash: hashIdentifier("whatsapp", value),
      destination: value,
      language: "fr",
    });
  }

  it("links the identifier only once the code is read back", async () => {
    const issued = await claim();
    expect(issued.code).toMatch(/^\d{6}$/);

    const db = await getDb();
    expect(await db.select().from(schema.citizenIdentifiers).where(eq(schema.citizenIdentifiers.userId, userId))).toHaveLength(0);

    const result = await confirmIdentifierClaim({ claimId: issued.claimId, code: issued.code! });
    expect(result.outcome).toBe("linked");
    const linked = await db.select().from(schema.citizenIdentifiers).where(eq(schema.citizenIdentifiers.userId, userId));
    expect(linked).toHaveLength(1);
    expect(linked[0].verifiedAt).toBeTruthy();
    expect(linked[0].valueLast4).toBe("0222");
  });

  it("never stores the code itself", async () => {
    const issued = await claim();
    const db = await getDb();
    const [row] = await db.select().from(schema.identifierClaims).where(eq(schema.identifierClaims.id, issued.claimId));
    expect(row.codeHash).not.toContain(issued.code!);
    expect(row.codeHash.startsWith("scrypt$")).toBe(true);
  });

  it("gives up after a few wrong codes", async () => {
    const issued = await claim();
    for (let i = 1; i < MAX_CLAIM_ATTEMPTS; i++) {
      const r = await confirmIdentifierClaim({ claimId: issued.claimId, code: "000000" });
      expect(r.outcome).toBe("wrong_code");
    }
    expect((await confirmIdentifierClaim({ claimId: issued.claimId, code: "000000" })).outcome).toBe("too_many_attempts");
    // Even the right code is refused once the claim is spent.
    expect((await confirmIdentifierClaim({ claimId: issued.claimId, code: issued.code! })).outcome).toBe("too_many_attempts");
  });

  it("refuses a code that has expired", async () => {
    const issued = await claim();
    const db = await getDb();
    await db.update(schema.identifierClaims).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.identifierClaims.id, issued.claimId));
    expect((await confirmIdentifierClaim({ claimId: issued.claimId, code: issued.code! })).outcome).toBe("expired");
  });

  it("cannot be replayed once used", async () => {
    const issued = await claim();
    expect((await confirmIdentifierClaim({ claimId: issued.claimId, code: issued.code! })).outcome).toBe("linked");
    expect((await confirmIdentifierClaim({ claimId: issued.claimId, code: issued.code! })).outcome).toBe("unknown_claim");
  });

  it("refuses to hand a number that belongs to another account", async () => {
    const db = await getDb();
    const [other] = await db.insert(schema.users).values({ role: "citizen", isAnonymous: true }).returning();
    const value = "+243900000333";
    await db.insert(schema.citizenIdentifiers).values({ userId: other.id, kind: "whatsapp", valueHash: hashIdentifier("whatsapp", value), valueLast4: "0333" });
    await expect(claim(value)).rejects.toThrow(/another_account/);
  });

  it("drops codes that expired without being used", async () => {
    const issued = await claim();
    const db = await getDb();
    await db.update(schema.identifierClaims).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.identifierClaims.id, issued.claimId));
    expect(await pruneIdentifierClaims()).toBe(1);
    expect(await openClaims(userId)).toEqual([]);
  });
});
