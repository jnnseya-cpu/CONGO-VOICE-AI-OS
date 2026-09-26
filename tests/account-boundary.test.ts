/**
 * Where the public ends and an account begins, and what deleting one does.
 *
 * Asking a question stays free: a citizen on a borrowed phone must be able to
 * describe a child's symptoms without registering, so the voice console creates
 * an anonymous session. That session is indistinguishable from a real account
 * to a route that only checks `auth: true` — which is how an anonymous visitor
 * could reach a conversation history.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession, hashPin } from "@server/core/auth";
import { resetRateLimits } from "@server/core/rate-limit";
import { seedReferenceData } from "@server/db/reference";
import { categoryOf, identify } from "@shared/accounts";
import type { Role } from "@shared/types";

const BASE = "http://localhost:3000";
const PIN = "849271";

async function makeUser(role: Role, opts: { anonymous?: boolean; phone?: string } = {}) {
  const db = await getDb();
  const [u] = await db
    .insert(schema.users)
    .values({
      role,
      phone: opts.phone ?? `p-${Math.random()}`,
      pinHash: hashPin(PIN),
      isAnonymous: opts.anonymous ?? false,
      languagePreference: "fr",
    })
    .returning();
  const token = encodeSession({ userId: u.id, role, language: "fr", province: null, anonymous: opts.anonymous ?? false });
  return { user: u, token };
}

const req = (method: string, path: string, token?: string, body?: unknown) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: new Headers({
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(async () => {
  await resetDbForTests();
  await seedReferenceData();
  resetRateLimits();
});

describe("an anonymous visitor may ask, and may not read a record", () => {
  it("is refused the conversation history", async () => {
    const { GET } = await import("@/app/api/v1/interactions/route");
    const { token } = await makeUser("citizen", { anonymous: true });
    const res = await GET(req("GET", "/api/v1/interactions", token), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("is told what to do about it, not just refused", async () => {
    const { GET } = await import("@/app/api/v1/interactions/route");
    const { token } = await makeUser("citizen", { anonymous: true });
    const body = (await (await GET(req("GET", "/api/v1/interactions", token), { params: Promise.resolve({}) })).json()) as {
      error: { message: string };
    };
    expect(body.error.message).toContain("compte");
    // Asking must not look like it has been taken away.
    expect(body.error.message).toContain("gratuit");
  });

  it("is refused reminders, which persist under a name", async () => {
    const { GET } = await import("@/app/api/v1/reminders/route");
    const { token } = await makeUser("citizen", { anonymous: true });
    expect((await GET(req("GET", "/api/v1/reminders", token), { params: Promise.resolve({}) })).status).toBe(403);
  });

  it("is refused a profile photograph, which would be collecting a face from somebody unidentified", async () => {
    const { DELETE } = await import("@/app/api/v1/me/photo/route");
    const { token } = await makeUser("citizen", { anonymous: true });
    expect((await DELETE(req("DELETE", "/api/v1/me/photo?slot=avatar", token), { params: Promise.resolve({}) })).status).toBe(403);
  });

  it("but a registered citizen reaches the same history", async () => {
    const { GET } = await import("@/app/api/v1/interactions/route");
    const { token } = await makeUser("citizen");
    expect((await GET(req("GET", "/api/v1/interactions", token), { params: Promise.resolve({}) })).status).toBe(200);
  });
});

describe("deleting your own account", () => {
  it("requires the PIN, so an unlocked phone is not enough", async () => {
    const { POST } = await import("@/app/api/v1/me/delete/route");
    const { token } = await makeUser("citizen");
    const res = await POST(req("POST", "/api/v1/me/delete", token, { pin: "000000", confirm: "SUPPRIMER" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("requires the typed confirmation, so the button alone cannot do it", async () => {
    const { POST } = await import("@/app/api/v1/me/delete/route");
    const { token } = await makeUser("citizen");
    const res = await POST(req("POST", "/api/v1/me/delete", token, { pin: PIN, confirm: "oui" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("erases the identity and keeps the audit chain", async () => {
    const { POST } = await import("@/app/api/v1/me/delete/route");
    const { user, token } = await makeUser("citizen");
    const res = await POST(req("POST", "/api/v1/me/delete", token, { pin: PIN, confirm: "SUPPRIMER" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const db = await getDb();
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(after.status).toBe("erased");
    expect(after.name).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.pinHash).toBeNull();
    // The record of what the programme did must outlive the person it did it to.
    expect((await db.select().from(schema.auditLogs)).length).toBeGreaterThan(0);
  });

  it("clears the session cookie, because a signed token outlives the row", async () => {
    const { POST } = await import("@/app/api/v1/me/delete/route");
    const { token } = await makeUser("citizen");
    const res = await POST(req("POST", "/api/v1/me/delete", token, { pin: PIN, confirm: "SUPPRIMER" }), { params: Promise.resolve({}) });
    expect(res.headers.get("set-cookie") ?? "").toMatch(/Max-Age=0|max-age=0/i);
  });

  it("refuses the last platform administrator, which would leave nobody able to appoint anybody", async () => {
    const { POST } = await import("@/app/api/v1/me/delete/route");
    const { token } = await makeUser("platform_admin");
    const res = await POST(req("POST", "/api/v1/me/delete", token, { pin: PIN, confirm: "SUPPRIMER" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("seul administrateur");
  });

  it("allows an administrator to leave once another exists", async () => {
    const { POST } = await import("@/app/api/v1/me/delete/route");
    await makeUser("platform_admin", { phone: "the-other-one" });
    const { token } = await makeUser("platform_admin", { phone: "the-leaver" });
    const res = await POST(req("POST", "/api/v1/me/delete", token, { pin: PIN, confirm: "SUPPRIMER" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });
});

describe("an administrator deleting somebody else", () => {
  it("must give a reason, because the log has to answer 'why' afterwards", async () => {
    const { DELETE } = await import("@/app/api/v1/users/[id]/route");
    const { token } = await makeUser("platform_admin", { phone: "admin" });
    const { user: target } = await makeUser("citizen", { phone: "target" });
    const res = await DELETE(req("DELETE", `/api/v1/users/${target.id}`, token, { reason: "court" }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(400);
  });

  it("records the reason before erasing anything", async () => {
    const { DELETE } = await import("@/app/api/v1/users/[id]/route");
    const { token } = await makeUser("platform_admin", { phone: "admin" });
    const { user: target } = await makeUser("citizen", { phone: "target" });
    const reason = "Demande écrite du citoyen reçue au bureau provincial le 12 mars.";
    const res = await DELETE(req("DELETE", `/api/v1/users/${target.id}`, token, { reason }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);

    const db = await getDb();
    const [entry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "user.deletion_ordered"));
    expect(JSON.stringify(entry.afterValue)).toContain("bureau provincial");
    const [erased] = await db.select().from(schema.users).where(eq(schema.users.id, target.id));
    expect(erased.status).toBe("erased");
  });

  it("sends an administrator deleting themselves through the route that asks for a PIN", async () => {
    const { DELETE } = await import("@/app/api/v1/users/[id]/route");
    const { user, token } = await makeUser("platform_admin", { phone: "admin" });
    const res = await DELETE(req("DELETE", `/api/v1/users/${user.id}`, token, { reason: "Je quitte le programme cette semaine." }), {
      params: Promise.resolve({ id: user.id }),
    });
    expect(res.status).toBe(400);
  });

  it("is refused to somebody without user:manage", async () => {
    const { DELETE } = await import("@/app/api/v1/users/[id]/route");
    const { token } = await makeUser("chw", { phone: "worker" });
    const { user: target } = await makeUser("citizen", { phone: "target" });
    const res = await DELETE(req("DELETE", `/api/v1/users/${target.id}`, token, { reason: "Une raison suffisamment longue." }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(403);
  });
});

describe("every account says what kind it is", () => {
  it("gives each role a category", () => {
    for (const role of ["citizen", "chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"] as Role[]) {
      expect(categoryOf(role).label.length).toBeGreaterThan(0);
      expect(categoryOf(role).description.length).toBeGreaterThan(0);
    }
  });

  it("separates the people who answer from the people who ask", () => {
    expect(categoryOf("citizen").id).toBe("public");
    expect(categoryOf("chw").id).toBe("field");
    expect(categoryOf("ngo").id).toBe("partner");
    expect(categoryOf("platform_admin").id).toBe("state");
  });

  it("does not call an unregistered visitor a citizen, which would claim an identity nobody gave", () => {
    const anon = identify({ role: "citizen", anonymous: true });
    expect(anon.registered).toBe(false);
    expect(anon.roleLabel).not.toBe("Citoyen");
    expect(anon.displayName).toBe("Visiteur");
  });

  it("prefers a person's own name when there is one", () => {
    expect(identify({ role: "chw", name: "Mwamba Kalala" }).displayName).toBe("Mwamba Kalala");
  });
});
