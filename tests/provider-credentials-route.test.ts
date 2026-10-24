/**
 * The administration route for vendor keys, through its real handler: the RBAC
 * wrapper, the platform-administrator check, the step-up guard and the Zod body
 * are all in the path.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession } from "@server/core/auth";
import { generateSecret, totp } from "@server/core/mfa";
import { resetRateLimits } from "@server/core/rate-limit";
import type { Role } from "@server/db/schema";

const BASE = "http://localhost:3000";
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

function req(method: string, path: string, opts: { body?: unknown; as?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.as) headers.set("authorization", `Bearer ${tokens[opts.as]}`);
  return new NextRequest(`${BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const json = async (res: Response) => (await res.json()) as Record<string, never>;

async function makeUser(role: Role, phone: string) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ role, phone, languagePreference: "fr", province: "Kinshasa" }).returning();
  tokens[role] = encodeSession({ userId: u.id, role, language: "fr", province: "Kinshasa", anonymous: false });
  ids[role] = u.id;
  return u;
}

/**
 * Enrols a second factor and verifies it, so the step-up window is open.
 *
 * The verification route is rate-limited per address, and this suite shares one
 * in-process limiter, so the counters are cleared first: the limiter is tested
 * in its own file, not here.
 */
async function satisfyStepUp(role: Role) {
  resetRateLimits();
  const db = await getDb();
  const secret = generateSecret();
  await db.update(schema.users).set({ mfaSecret: secret, mfaEnabled: true }).where(eq(schema.users.id, ids[role]));
  const { POST: verify } = await import("@/app/api/v1/auth/mfa/verify/route");
  const res = await verify(req("POST", "/api/v1/auth/mfa/verify", { as: role, body: { code: totp(secret) } }));
  expect(res.status).toBe(200);
}

describe("GET /api/v1/admin/providers", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    await makeUser("platform_admin", "+243870000001");
    await makeUser("gov_admin", "+243870000002");
    await makeUser("chw", "+243870000003");
  });

  it("tells a platform administrator what is set, where it comes from, and nothing more", async () => {
    const { GET } = await import("@/app/api/v1/admin/providers/route");
    const res = await GET(req("GET", "/api/v1/admin/providers", { as: "platform_admin" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    const credentials = body.credentials as unknown as Array<{ name: string; hint: string | null; source: string }>;
    expect(credentials.length).toBeGreaterThan(8);
    expect(credentials.some((c) => c.name === "OPENAI_API_KEY")).toBe(true);
    // No field anywhere in the payload holds a value: a hint is at most four characters.
    for (const c of credentials) {
      if (c.hint && c.name.includes("KEY")) expect(c.hint.replace("…", "").length).toBeLessThanOrEqual(4);
    }
    expect(body.neverSettable as unknown as string[]).toContain("DATA_ENCRYPTION_KEY");
  });

  it("refuses a government administrator, who holds admin:config but not the keys", async () => {
    const { GET } = await import("@/app/api/v1/admin/providers/route");
    expect((await GET(req("GET", "/api/v1/admin/providers", { as: "gov_admin" }))).status).toBe(403);
  });

  it("refuses a health worker outright", async () => {
    const { GET } = await import("@/app/api/v1/admin/providers/route");
    expect((await GET(req("GET", "/api/v1/admin/providers", { as: "chw" }))).status).toBe(403);
  });

  it("refuses an unauthenticated caller", async () => {
    const { GET } = await import("@/app/api/v1/admin/providers/route");
    expect((await GET(req("GET", "/api/v1/admin/providers"))).status).toBe(401);
  });
});

describe("PUT /api/v1/admin/providers", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    await makeUser("platform_admin", "+243880000001");
    await makeUser("gov_admin", "+243880000002");
  });

  it("requires a recent second factor before a key can be set", async () => {
    const { PUT } = await import("@/app/api/v1/admin/providers/route");
    const res = await PUT(req("PUT", "/api/v1/admin/providers", { as: "platform_admin", body: { name: "OPENAI_API_KEY", value: "sk-test-aaaaaaaaaaaaaaaaaaaaaa" } }));
    expect(res.status).toBe(403);
    const db = await getDb();
    expect((await db.select().from(schema.providerCredentials)).length).toBe(0);
  });

  it("stores it once the second factor is satisfied, and answers without the key", async () => {
    await satisfyStepUp("platform_admin");
    const { PUT } = await import("@/app/api/v1/admin/providers/route");
    const res = await PUT(req("PUT", "/api/v1/admin/providers", { as: "platform_admin", body: { name: "OPENAI_API_KEY", value: "sk-test-bbbbbbbbbbbbbbbbbb9876" } }));
    expect(res.status).toBe(200);
    const text = JSON.stringify(await json(res));
    expect(text).toContain("…9876");
    expect(text).not.toContain("sk-test-bbbbbbbbbbbbbbbbbb");

    const db = await getDb();
    const [row] = await db.select().from(schema.providerCredentials);
    expect(row.name).toBe("OPENAI_API_KEY");
    expect(row.value).not.toContain("sk-test");
  });

  it("refuses a name that is not a vendor credential", async () => {
    await satisfyStepUp("platform_admin");
    const { PUT } = await import("@/app/api/v1/admin/providers/route");
    for (const name of ["DATA_ENCRYPTION_KEY", "SESSION_SECRET", "CRON_SECRET", "ADMIN_RECOVERY_TOKEN", "DATABASE_URL"]) {
      const res = await PUT(req("PUT", "/api/v1/admin/providers", { as: "platform_admin", body: { name, value: "x".repeat(64) } }));
      expect(res.status, `${name} must be refused`).toBe(400);
    }
  });

  it("refuses a government administrator even with a second factor", async () => {
    await satisfyStepUp("gov_admin");
    const { PUT } = await import("@/app/api/v1/admin/providers/route");
    const res = await PUT(req("PUT", "/api/v1/admin/providers", { as: "gov_admin", body: { name: "OPENAI_API_KEY", value: "sk-test-cccccccccccccccccccc" } }));
    expect(res.status).toBe(403);
  });

  it("withdraws a stored key when asked", async () => {
    await satisfyStepUp("platform_admin");
    const { PUT, DELETE } = await import("@/app/api/v1/admin/providers/route");
    await PUT(req("PUT", "/api/v1/admin/providers", { as: "platform_admin", body: { name: "GEMINI_API_KEY", value: "gemini-key-long-enough-xxxxx" } }));
    const res = await DELETE(req("DELETE", "/api/v1/admin/providers", { as: "platform_admin", body: { name: "GEMINI_API_KEY" } }));
    expect(res.status).toBe(200);
    const db = await getDb();
    expect((await db.select().from(schema.providerCredentials)).some((r) => r.name === "GEMINI_API_KEY")).toBe(false);
  });
});
