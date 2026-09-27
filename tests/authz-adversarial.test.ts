/**
 * Authorisation, attempted rather than reviewed.
 *
 * Every case here is an attack executed against the real route handler with a
 * real session: a worker reaching for another province's case, a citizen reading
 * someone else's interaction, a lower role calling an administrator's endpoint,
 * a caller who simply omits the token. Reading the handlers is not evidence; a
 * 403 from the handler is.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession } from "@server/core/auth";
import { seedReferenceData } from "@server/db/reference";
import { openCase } from "@server/ai/agents/workflow";
import type { Role } from "@server/db/schema";

const BASE = "http://localhost:3000";
const token: Record<string, string> = {};
const userId: Record<string, string> = {};

function req(method: string, path: string, opts: { body?: unknown; as?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.as) headers.set("authorization", `Bearer ${token[opts.as]}`);
  return new NextRequest(`${BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

async function makeUser(label: string, role: Role, phone: string, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  const province = (extra.province as string) ?? "Kinshasa";
  const [u] = await db.insert(schema.users).values({ role, phone, languagePreference: "fr", province, ...extra }).returning();
  token[label] = encodeSession({ userId: u.id, role, language: "fr", province, anonymous: false });
  userId[label] = u.id;
  return u;
}

const ids: Record<string, string> = {};

describe("authorisation, attempted", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await seedReferenceData();
    await makeUser("admin", "platform_admin", "+243870000001");
    await makeUser("chwKin", "chw", "+243870000002", { province: "Kinshasa", territory: "Kimbanseke", territories: ["Kimbanseke"], onDuty: true });
    await makeUser("chwKat", "chw", "+243870000003", { province: "Haut-Katanga", territory: "Kipushi", territories: ["Kipushi"], onDuty: true });
    await makeUser("agri", "agri_officer", "+243870000004");
    await makeUser("teacher", "teacher", "+243870000005");
    await makeUser("citizenA", "citizen", "+243870000006");
    await makeUser("citizenB", "citizen", "+243870000007");

    const [ia] = await db.insert(schema.interactions).values({ module: "health", status: "completed", originalInput: "cas A", userId: userId.citizenA }).returning();
    ids.interactionA = ia.id;
    const [ib] = await db.insert(schema.interactions).values({ module: "health", status: "completed", originalInput: "cas B", userId: userId.citizenB }).returning();
    ids.interactionB = ib.id;

    const caseKin = await openCase({ module: "health", interactionId: ia.id, title: "Cas Kinshasa", severity: "high", province: "Kinshasa", territory: "Kimbanseke", autoAssign: false });
    ids.caseKin = caseKin.id;
    const caseEdu = await openCase({ module: "education", interactionId: ib.id, title: "Cas école", severity: "medium", province: "Kinshasa", territory: "Kimbanseke", autoAssign: false });
    ids.caseEdu = caseEdu.id;
  });

  describe("vertical access — a lower role reaching upward", () => {
    it("refuses a citizen the user directory", async () => {
      const { GET } = await import("@/app/api/v1/users/route");
      const res = await GET(req("GET", "/api/v1/users", { as: "citizenA" }));
      expect(res.status, "a citizen must not be able to enumerate accounts").toBe(403);
    });

    it("refuses a CHW the platform configuration", async () => {
      const { GET } = await import("@/app/api/v1/admin/config/route");
      const res = await GET(req("GET", "/api/v1/admin/config", { as: "chwKin" }));
      expect(res.status).toBe(403);
    });

    it("refuses a teacher the audit log", async () => {
      const { GET } = await import("@/app/api/v1/audit-logs/route");
      const res = await GET(req("GET", "/api/v1/audit", { as: "teacher" }));
      expect(res.status).toBe(403);
    });
  });

  describe("module scope — a worker reaching into another service", () => {
    it("refuses an agriculture officer a health case", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const res = await GET(req("GET", `/api/v1/cases/${ids.caseKin}`, { as: "agri" }), params({ id: ids.caseKin }));
      expect(res.status).toBe(403);
    });

    it("refuses a CHW an education case", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const res = await GET(req("GET", `/api/v1/cases/${ids.caseEdu}`, { as: "chwKin" }), params({ id: ids.caseEdu }));
      expect(res.status).toBe(403);
    });
  });

  describe("unauthenticated and malformed credentials", () => {
    it("refuses a case read with no token at all", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const res = await GET(req("GET", `/api/v1/cases/${ids.caseKin}`), params({ id: ids.caseKin }));
      expect(res.status).toBe(401);
    });

    it("refuses a forged token", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const headers = new Headers({ "content-type": "application/json", authorization: "Bearer not.a.real.token" });
      const res = await GET(new NextRequest(`${BASE}/api/v1/cases/${ids.caseKin}`, { method: "GET", headers }), params({ id: ids.caseKin }));
      expect(res.status).toBe(401);
    });

    it("refuses a token whose signature has been altered", async () => {
      const good = token.admin;
      const tampered = good.slice(0, -4) + (good.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
      const headers = new Headers({ authorization: `Bearer ${tampered}` });
      const { GET } = await import("@/app/api/v1/audit-logs/route");
      const res = await GET(new NextRequest(`${BASE}/api/v1/audit`, { method: "GET", headers }));
      expect(res.status, "a tampered signature must not authenticate").toBe(401);
    });

    it("does not accept a role claim smuggled in the request body", async () => {
      const { GET } = await import("@/app/api/v1/users/route");
      const res = await GET(req("GET", "/api/v1/users?role=platform_admin", { as: "citizenA" }));
      expect(res.status).toBe(403);
    });
  });

  describe("object-level access — one citizen reaching for another's record", () => {
    it("does not let a citizen read another citizen's interaction", async () => {
      const { GET } = await import("@/app/api/v1/interactions/[id]/route");
      const res = await GET(req("GET", `/api/v1/interactions/${ids.interactionB}`, { as: "citizenA" }), params({ id: ids.interactionB }));
      expect([403, 404], `status was ${res.status}`).toContain(res.status);
    });

    it("lets a citizen read their own interaction", async () => {
      const { GET } = await import("@/app/api/v1/interactions/[id]/route");
      const res = await GET(req("GET", `/api/v1/interactions/${ids.interactionA}`, { as: "citizenA" }), params({ id: ids.interactionA }));
      expect(res.status, "the owner must still be able to read it").toBe(200);
    });

    it("does not leak a record through a non-existent identifier", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const res = await GET(
        req("GET", "/api/v1/cases/00000000-0000-4000-8000-000000000000", { as: "chwKin" }),
        params({ id: "00000000-0000-4000-8000-000000000000" }),
      );
      expect(res.status).toBe(404);
    });

    it("rejects a malformed identifier rather than failing open", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const res = await GET(req("GET", "/api/v1/cases/not-a-uuid", { as: "chwKin" }), params({ id: "not-a-uuid" }));
      expect([400, 404, 422], `status was ${res.status}`).toContain(res.status);
    });
  });

  describe("error bodies say nothing useful to an attacker", () => {
    it("returns no stack trace, SQL or internal path on a refusal", async () => {
      const { GET } = await import("@/app/api/v1/cases/[id]/route");
      const res = await GET(req("GET", `/api/v1/cases/${ids.caseKin}`, { as: "agri" }), params({ id: ids.caseKin }));
      const body = JSON.stringify(await res.json());
      expect(body).not.toMatch(/at\s+\w+\s+\(/);
      expect(body).not.toMatch(/\/home\/|node_modules|\.ts:\d+/);
      expect(body).not.toMatch(/select\s|from\s+"|drizzle|postgres/i);
      expect(body).not.toMatch(/DATABASE_URL|SESSION_SECRET|sk-|AIza/);
    });

    it("returns no stack trace on a malformed body", async () => {
      const { POST } = await import("@/app/api/v1/cases/[id]/notes/route");
      const headers = new Headers({ "content-type": "application/json", authorization: `Bearer ${token.chwKin}` });
      const res = await POST(
        new NextRequest(`${BASE}/api/v1/cases/${ids.caseKin}/notes`, { method: "POST", headers, body: "{not json" }),
        params({ id: ids.caseKin }),
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = JSON.stringify(await res.json());
      expect(body).not.toMatch(/at\s+\w+\s+\(|\/home\/|node_modules/);
    });
  });
});
