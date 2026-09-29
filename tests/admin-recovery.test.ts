/**
 * The way back in, and everything it must refuse.
 *
 * A platform administrator who cannot sign in has nobody to ask: the bootstrap
 * endpoint refuses permanently once an administrator exists, the database is on
 * a private address, and there is no reset. So a deployment with one
 * administrator is one forgotten code away from having none — which is what
 * happened here.
 *
 * The answer is a door, so most of this file is about the door being shut. It
 * does not exist without ADMIN_RECOVERY_TOKEN; it creates nobody; it tells an
 * attacker nothing about which part of their guess was wrong; and using it
 * signs out every session the account already had.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { hashPin, verifyPin } from "@server/core/auth";
import { phoneColumns, phoneLookup } from "@server/core/phone";
import { resetRateLimits } from "@server/core/rate-limit";

const TOKEN = "recovery-token-for-tests";
const PHONE = "+243810000001";

function post(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("x-recovery-token", token);
  return new NextRequest("http://127.0.0.1/api/v1/system/recover-admin", { method: "POST", headers, body: JSON.stringify(body) });
}

async function call(body: unknown, token?: string) {
  const { POST } = await import("@/app/api/v1/system/recover-admin/route");
  return POST(post(body, token));
}

async function makeAdmin() {
  const db = await getDb();
  const [u] = await db
    .insert(schema.users)
    .values({ ...phoneColumns(PHONE), pinHash: hashPin("oldcode9"), name: "Admin", role: "platform_admin", languagePreference: "fr", status: "active" })
    .returning();
  return u;
}

describe("listing the administrators", () => {
  /**
   * The gap that cost an afternoon. bootstrap answers "an administrator
   * exists" without saying which number it is under; this endpoint answered
   * "no administrator with that number" without saying what the numbers were.
   * Both were true simultaneously, and between them there was no way to find
   * out that the account had been created under a different number.
   */
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });
  beforeEach(async () => {
    process.env.ADMIN_RECOVERY_TOKEN = TOKEN;
    resetRateLimits();
    const db = await getDb();
    await db.delete(schema.rateLimitCounters);
  });
  afterEach(async () => {
    delete process.env.ADMIN_RECOVERY_TOKEN;
    const db = await getDb();
    await db.delete(schema.users).where(eq(schema.users.role, "platform_admin"));
  });

  it("names the administrators and the numbers they are under", async () => {
    await makeAdmin();
    const res = await call({ list: true }, TOKEN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { administrators: Array<{ phone: string; name: string | null; id: string }> };
    expect(body.administrators).toHaveLength(1);
    // Masked: enough to recognise your own number, not a directory dump.
    expect(body.administrators[0].phone).toContain("0001");
    expect(body.administrators[0].phone).not.toContain("+24381");
  });

  it("is not offered without the token", async () => {
    await makeAdmin();
    expect((await call({ list: true })).status).toBe(404);
    expect((await call({ list: true }, "wrong")).status).toBe(404);
  });

  it("resets by id, so the number never has to be guessed", async () => {
    const before = await makeAdmin();
    const listed = (await (await call({ list: true }, TOKEN)).json()) as { administrators: Array<{ id: string }> };
    const res = await call({ userId: listed.administrators[0].id, pin: "Kx7mq2p" }, TOKEN);
    expect(res.status).toBe(200);

    const db = await getDb();
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, before.id));
    expect(verifyPin("Kx7mq2p", after.pinHash)).toBe(true);
  });

  it("refuses an id that is not a platform administrator", async () => {
    const db = await getDb();
    const [citizen] = await db
      .insert(schema.users)
      .values({ ...phoneColumns("+243810000009"), pinHash: hashPin("oldcode9"), role: "citizen", languagePreference: "fr", status: "active" })
      .returning();
    expect((await call({ userId: citizen.id, pin: "Kx7mq2p" }, TOKEN)).status).toBe(404);
  });
});

describe("the recovery endpoint", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });
  beforeEach(async () => {
    process.env.ADMIN_RECOVERY_TOKEN = TOKEN;
    // The endpoint sits on the authentication bucket, which is the point — but
    // it means each test has to start from a clean counter or the later ones
    // measure the limiter rather than the endpoint.
    resetRateLimits();
    // The shared limiter counts in the database, not only in memory, so the
    // in-process reset is half the job: without clearing the rows, the later
    // tests in this file measure the limiter rather than the endpoint.
    const db = await getDb();
    await db.delete(schema.rateLimitCounters);
  });
  afterEach(async () => {
    delete process.env.ADMIN_RECOVERY_TOKEN;
    const db = await getDb();
    await db.delete(schema.users).where(eq(schema.users.role, "platform_admin"));
  });

  it("does not exist when no token is configured", async () => {
    delete process.env.ADMIN_RECOVERY_TOKEN;
    await makeAdmin();
    expect((await call({ phone: PHONE, pin: "newcode7" })).status).toBe(404);
  });

  it("does not exist to a caller with the wrong token", async () => {
    await makeAdmin();
    const res = await call({ phone: PHONE, pin: "newcode7" }, "not-the-token");
    // 404, not 403: a wrong token must not confirm that a right one exists.
    expect(res.status).toBe(404);
  });

  it("answers an unknown number exactly as it answers a wrong token", async () => {
    await makeAdmin();
    const res = await call({ phone: "+243899999999", pin: "newcode7" }, TOKEN);
    expect(res.status).toBe(404);
  });

  it("refuses to reset an account that is not a platform administrator", async () => {
    const db = await getDb();
    await db.insert(schema.users).values({ ...phoneColumns("+243810000002"), pinHash: hashPin("oldcode9"), role: "citizen", languagePreference: "fr", status: "active" });
    expect((await call({ phone: "+243810000002", pin: "newcode7" }, TOKEN)).status).toBe(404);
  });

  it("refuses a code that is a run or a repeat, letters included", async () => {
    await makeAdmin();
    for (const pin of ["111111", "123456", "aaaaaa", "abcdef"]) {
      expect((await call({ phone: PHONE, pin }, TOKEN)).status, pin).toBe(400);
    }
  });

  it("sets the new code, and the old one stops working", async () => {
    const before = await makeAdmin();
    const res = await call({ phone: PHONE, pin: "Kx7mq2p" }, TOKEN);
    expect(res.status).toBe(200);

    const db = await getDb();
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, before.id));
    expect(verifyPin("Kx7mq2p", after.pinHash)).toBe(true);
    expect(verifyPin("oldcode9", after.pinHash)).toBe(false);
  });

  it("accepts a code containing letters, because bootstrap did", async () => {
    await makeAdmin();
    expect((await call({ phone: PHONE, pin: "bonjour7" }, TOKEN)).status).toBe(200);
  });

  it("signs out every session the account already had", async () => {
    const before = await makeAdmin();
    await new Promise((r) => setTimeout(r, 5));
    expect((await call({ phone: PHONE, pin: "Kx7mq2p" }, TOKEN)).status).toBe(200);

    const db = await getDb();
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, before.id));
    /**
     * If the code was reset because somebody else had it, that somebody is
     * signed out by the same action. A reset that left their session alive
     * would be worse than no reset at all.
     */
    expect(after.sessionEpoch.getTime()).toBeGreaterThan(before.sessionEpoch.getTime());
  });

  it("puts the recovery on the audit record", async () => {
    const before = await makeAdmin();
    expect((await call({ phone: PHONE, pin: "Kx7mq2p" }, TOKEN)).status).toBe(200);
    const db = await getDb();
    const rows = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, before.id));
    expect(rows.some((r) => r.action === "user.admin_recovered"), "a recovery is never merely something that happened").toBe(true);
  });
});

describe("an account whose number was written under a different key", () => {
  /**
   * The failure this whole endpoint eventually turned out to be for.
   *
   * users.phone is encrypted and users.phone_index is a blind index keyed by
   * the same secret. Change DATA_ENCRYPTION_KEY and the row keeps both columns
   * but neither is usable: the phone reads back as "(illisible)", and
   * phoneLookup() of the correct number computes an index that cannot match
   * what is stored. That account is unreachable with ANY number and ANY code,
   * and resetting the code — which is all this endpoint did at first — changes
   * nothing at all. It was reset twice, successfully, and sign-in still failed.
   */
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });
  beforeEach(async () => {
    process.env.ADMIN_RECOVERY_TOKEN = TOKEN;
    resetRateLimits();
    const db = await getDb();
    await db.delete(schema.rateLimitCounters);
  });
  afterEach(async () => {
    delete process.env.ADMIN_RECOVERY_TOKEN;
    const db = await getDb();
    await db.delete(schema.users).where(eq(schema.users.role, "platform_admin"));
  });

  /** An admin row whose phone columns came from a key nobody now holds. */
  async function adminWithForeignKeyPhone() {
    const db = await getDb();
    const [u] = await db
      .insert(schema.users)
      .values({
        // A well-formed envelope this key cannot open: the right shape, the
        // wrong secret. That is exactly what a rotated key leaves behind.
        phone: "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB.CCCCCCCCCCCCCCCC",
        phoneIndex: "an-index-from-a-key-nobody-has",
        pinHash: hashPin("oldcode9"),
        name: "Justin Nseya",
        role: "platform_admin",
        languagePreference: "fr",
        status: "active",
      })
      .returning();
    return u;
  }

  it("shows the number as unreadable rather than pretending", async () => {
    await adminWithForeignKeyPhone();
    const body = (await (await call({ list: true }, TOKEN)).json()) as { administrators: Array<{ phone: string }> };
    expect(body.administrators[0].phone).toBe("(illisible)");
  });

  it("makes the account reachable again by rewriting the number", async () => {
    const before = await adminWithForeignKeyPhone();
    const res = await call({ userId: before.id, pin: "Kx7mq2p", phone: "+447952030184" }, TOKEN);
    expect(res.status).toBe(200);

    // The point of the whole exercise: sign-in looks the account up by the
    // index it computes now, and that has to find this row.
    const db = await getDb();
    const [found] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.phoneIndex, phoneLookup("+447952030184")));
    expect(found, "the account must now be findable by its number").toBeTruthy();
    expect(found.id).toBe(before.id);
    expect(verifyPin("Kx7mq2p", found.pinHash)).toBe(true);
  });

  it("will not take a number that belongs to somebody else", async () => {
    const admin = await adminWithForeignKeyPhone();
    const db = await getDb();
    await db
      .insert(schema.users)
      .values({ ...phoneColumns("+447900000123"), role: "citizen", languagePreference: "fr", status: "active" });
    const res = await call({ userId: admin.id, pin: "Kx7mq2p", phone: "+447900000123" }, TOKEN);
    expect(res.status).toBe(400);
  });
});
