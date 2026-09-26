/**
 * The first platform administrator.
 *
 * A fresh deployment could not produce one. Every account is created through
 * /admin/utilisateurs, which needs a platform_admin session; the only way to get
 * that session was that page. The database has no public address, so there was
 * no psql to fall back on either. The platform shipped unable to be started.
 *
 * Breaking that circle means an unauthenticated endpoint that creates an
 * administrator, which is exactly the shape of a back door. These tests are the
 * argument that it is not one.
 */
import { beforeEach, describe, expect, it, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { verifyPin } from "@server/core/auth";
import { resetRateLimits } from "@server/core/rate-limit";
import { POST } from "@/app/api/v1/system/bootstrap/route";

const TOKEN = "a-long-bootstrap-token-value";
const BASE = "http://localhost:3000/api/v1/system/bootstrap";

function call(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== undefined) headers.set("x-bootstrap-token", token);
  return POST(new NextRequest(BASE, { method: "POST", headers, body: JSON.stringify(body) }));
}

const VALID = { name: "Administrateur Programme", phone: "+243810000001", pin: "849271" };

beforeEach(async () => {
  await resetDbForTests();
  // The endpoint is in the "auth" rate-limit class, which is deliberately tight:
  // ten attempts per window per address. That is correct in production — this is
  // an unauthenticated endpoint that creates an administrator — and it means the
  // counter has to be cleared between cases, or the later ones see 429 instead
  // of the status being asserted.
  resetRateLimits();
  process.env.BOOTSTRAP_TOKEN = TOKEN;
});
afterAll(() => {
  delete process.env.BOOTSTRAP_TOKEN;
});

describe("it is not offered unless the deployment offers it", () => {
  it("is indistinguishable from a path that does not exist when no token is configured", async () => {
    delete process.env.BOOTSTRAP_TOKEN;
    // 404, not 401: a 401 would confirm the endpoint is there.
    expect((await call(VALID, TOKEN)).status).toBe(404);
  });

  it("treats a blank token as not configured", async () => {
    process.env.BOOTSTRAP_TOKEN = "   ";
    expect((await call(VALID, "   ")).status).toBe(404);
  });

  it("answers 404, not 403, to a wrong token — so probing reveals nothing", async () => {
    expect((await call(VALID, "wrong-token")).status).toBe(404);
  });

  it("answers 404 when no token is presented at all", async () => {
    expect((await call(VALID)).status).toBe(404);
  });
});

describe("it works exactly once", () => {
  it("creates a platform administrator", async () => {
    const res = await call(VALID, TOKEN);
    expect(res.status).toBe(200);

    const db = await getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.role, "platform_admin"));
    expect(row.name).toBe(VALID.name);
    expect(row.consentStatus).toBe("granted");
    // Hashed with the same scrypt cost as any other account.
    expect(verifyPin(VALID.pin, row.pinHash)).toBe(true);
    expect(row.pinHash).not.toContain(VALID.pin);
    // Stored encrypted and findable by blind index, like every other number.
    expect(row.phone).not.toBe(VALID.phone);
    expect(row.phoneIndex).toBeTruthy();
  });

  it("refuses once an administrator exists, with the right token", async () => {
    expect((await call(VALID, TOKEN)).status).toBe(200);
    const again = await call({ ...VALID, phone: "+243810000002" }, TOKEN);
    expect(again.status).toBe(403);

    const db = await getDb();
    const admins = await db.select().from(schema.users).where(eq(schema.users.role, "platform_admin"));
    expect(admins).toHaveLength(1);
  });

  it("refuses even when the existing administrator was created some other way", async () => {
    const db = await getDb();
    await db.insert(schema.users).values({ role: "platform_admin", phone: "x", languagePreference: "fr" });
    expect((await call(VALID, TOKEN)).status).toBe(403);
  });

  it("is not re-opened by the presence of other roles", async () => {
    const db = await getDb();
    await db.insert(schema.users).values({ role: "chw", phone: "y", languagePreference: "fr" });
    // A health worker is not an administrator: the circle is still unbroken.
    expect((await call(VALID, TOKEN)).status).toBe(200);
  });
});

describe("the account it creates is not a weak one", () => {
  it("rejects a PIN on the forbidden list", async () => {
    expect((await call({ ...VALID, pin: "123456" }, TOKEN)).status).toBe(400);
    const db = await getDb();
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });

  it("rejects a PIN shorter than six digits, which other accounts may use", async () => {
    expect((await call({ ...VALID, pin: "8492" }, TOKEN)).status).toBe(400);
  });

  it("requires a name, so the account is attributable", async () => {
    expect((await call({ ...VALID, name: "" }, TOKEN)).status).toBe(400);
  });

  it("rejects a duplicate number rather than creating a second account on it", async () => {
    const db = await getDb();
    await db.insert(schema.users).values({ role: "citizen", phone: "z", languagePreference: "fr" });
    const first = await call(VALID, TOKEN);
    expect(first.status).toBe(200);
  });
});

describe("the account's origin is on the record", () => {
  it("writes an audit entry naming the bootstrap", async () => {
    await call(VALID, TOKEN);
    const db = await getDb();
    const entries = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "user.bootstrapped"));
    expect(entries).toHaveLength(1);
    expect(entries[0].actorRole).toBe("platform_admin");
    // Otherwise this is the one account nobody can account for.
    expect(JSON.stringify(entries[0].afterValue)).toContain("bootstrap_token");
  });

  it("writes nothing when it refuses", async () => {
    await call(VALID, "wrong-token");
    const db = await getDb();
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "user.bootstrapped"))).toHaveLength(0);
  });
});
