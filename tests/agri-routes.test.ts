/**
 * Agriculture route smoke tests: every endpoint through its real handler, with a real
 * session, so RBAC, the Zod bodies and the status codes are covered end to end.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession } from "@server/core/auth";
import { ensureAgricultureReference } from "@server/db/reference/agriculture";
import type { Role } from "@server/db/schema";

const BASE = "http://localhost:3000";
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

function req(method: string, path: string, opts: { body?: unknown; as?: string; contentType?: string } = {}) {
  const headers = new Headers({ "content-type": opts.contentType ?? "application/json" });
  if (opts.as) headers.set("authorization", `Bearer ${tokens[opts.as]}`);
  const body = opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  return new NextRequest(`${BASE}${path}`, { method, headers, body });
}

const json = async (res: Response) => (await res.json()) as Record<string, never>;

async function makeUser(role: Role, phone: string) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ role, phone, languagePreference: "fr", province: "Kwilu" }).returning();
  tokens[role] = encodeSession({ userId: u.id, role, language: "fr", province: "Kwilu", anonymous: false });
  ids[role] = u.id;
  return u;
}

describe("agriculture routes", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    await ensureAgricultureReference();
    await makeUser("platform_admin", "+243870000001");
    await makeUser("agri_officer", "+243870000002");
    await makeUser("citizen", "+243870000003");
    await makeUser("ngo", "+243870000004");
  });

  it("serves market prices publicly with source, unit and staleness", async () => {
    const { GET } = await import("@/app/api/v1/agriculture/prices/route");
    const res = await GET(req("GET", "/api/v1/agriculture/prices?commodity=maïs&facets=1"));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { prices: Array<Record<string, unknown>>; disclaimer: string; spoken: string; facets: { commodities: string[] } };
    expect(body.prices.length).toBeGreaterThan(0);
    expect(body.prices[0]).toHaveProperty("staleness");
    expect(body.prices[0]).toHaveProperty("observedAt");
    expect(body.prices[0]).toHaveProperty("unit");
    expect(body.prices[0]).toHaveProperty("grade");
    expect(body.prices[0]).toHaveProperty("source");
    expect(body.disclaimer).toMatch(/n'est pas une offre/i);
    expect(body.facets.commodities.length).toBeGreaterThan(0);
  });

  it("accepts an administrative CSV upload and refuses it without the permission", async () => {
    const { POST } = await import("@/app/api/v1/agriculture/prices/upload/route");
    const csv = "marche;produit;unite;prix;qualite;date\nBoma — Marché central;manioc (cossettes);sac de 50 kg;91000;courant;02/03/2026";
    expect((await POST(req("POST", "/api/v1/agriculture/prices/upload", { body: { csv } }))).status).toBe(401);
    expect((await POST(req("POST", "/api/v1/agriculture/prices/upload", { body: { csv }, as: "citizen" }))).status).toBe(403);
    const res = await POST(req("POST", "/api/v1/agriculture/prices/upload", { body: { csv }, as: "platform_admin" }));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { inserted: number };
    expect(body.inserted).toBe(1);
    const db = await getDb();
    const audits = await db.select().from(schema.auditLogs);
    expect(audits.some((a) => a.action === "agriculture.prices_uploaded")).toBe(true);
  });

  it("serves the planting calendar for a province and a crop", async () => {
    const { GET } = await import("@/app/api/v1/agriculture/calendar/route");
    const res = await GET(req("GET", "/api/v1/agriculture/calendar?province=Kwilu&crop=maïs&date=2026-10-10"));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { calendar: { openNow: boolean; sowWindows: unknown[]; source: string } };
    expect(body.calendar.openNow).toBe(true);
    expect(body.calendar.sowWindows.length).toBeGreaterThan(0);
    expect(body.calendar.source).toBeTruthy();
    expect((await GET(req("GET", "/api/v1/agriculture/calendar?province=Atlantide"))).status).toBe(400);
  });

  it("serves the weather with its seasonal fallback", async () => {
    const { GET } = await import("@/app/api/v1/agriculture/weather/route");
    const res = await GET(req("GET", "/api/v1/agriculture/weather?province=Kwilu"));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { weather: { province: string; season: { label: string }; live: boolean }; centroid: { lat: number } };
    expect(body.weather.province).toBe("Kwilu");
    expect(body.weather.season.label).toContain("saison");
    expect(body.centroid.lat).toBeLessThan(0);
    expect((await GET(req("GET", "/api/v1/agriculture/weather?days=99"))).status).toBe(400);
  });

  it("serves the input registry, authorised entries only by default", async () => {
    const { GET } = await import("@/app/api/v1/agriculture/registry/route");
    const res = await GET(req("GET", "/api/v1/agriculture/registry?crop=maïs"));
    const body = (await json(res)) as unknown as { inputs: Array<{ authorisationStatus: string; ppe: string | null }> };
    expect(body.inputs.length).toBeGreaterThan(0);
    expect(body.inputs.every((i) => i.authorisationStatus === "authorised")).toBe(true);
    const all = (await json(await GET(req("GET", "/api/v1/agriculture/registry?all=1")))) as unknown as { inputs: Array<{ authorisationStatus: string }> };
    expect(all.inputs.some((i) => i.authorisationStatus === "banned")).toBe(true);
  });

  it("lists, runs and validates clusters with the right permissions", async () => {
    const db = await getDb();
    const [interaction] = await db.insert(schema.interactions).values({ module: "agriculture", channel: "text", status: "completed" }).returning();
    for (let i = 0; i < 5; i++) {
      await db.insert(schema.agricultureReports).values({
        interactionId: interaction.id,
        cropType: "manioc",
        issueType: "crop_disease",
        province: "Kwilu",
        territory: "Bulungu",
        candidates: [{ label: "Mosaïque africaine du manioc", prob: 0.58 }],
      });
    }

    const { GET, POST, PATCH } = await import("@/app/api/v1/agriculture/clusters/route");
    expect((await GET(req("GET", "/api/v1/agriculture/clusters"))).status).toBe(401);
    expect((await GET(req("GET", "/api/v1/agriculture/clusters", { as: "citizen" }))).status).toBe(403);

    const run = await POST(req("POST", "/api/v1/agriculture/clusters", { body: {}, as: "agri_officer" }));
    expect(run.status).toBe(200);
    const created = (await json(run)) as unknown as { created: Array<{ id: string; status: string }> };
    expect(created.created).toHaveLength(1);
    const clusterId = created.created[0].id;
    expect(created.created[0].status).toBe("unverified");

    const list = (await json(await GET(req("GET", "/api/v1/agriculture/clusters?status=unverified", { as: "agri_officer" })))) as unknown as { clusters: unknown[]; notice: string };
    expect(list.clusters).toHaveLength(1);
    expect(list.notice).toMatch(/jamais une épidémie confirmée/i);
    expect((await GET(req("GET", "/api/v1/agriculture/clusters?status=inconnu", { as: "agri_officer" }))).status).toBe(400);

    expect((await PATCH(req("PATCH", "/api/v1/agriculture/clusters", { body: { id: clusterId, status: "confirmed" }, as: "agri_officer" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", "/api/v1/agriculture/clusters", { body: { id: clusterId, status: "under_review" }, as: "ngo" }))).status).toBe(403);
    const ok = await PATCH(req("PATCH", "/api/v1/agriculture/clusters", { body: { id: clusterId, status: "under_review", note: "visite prévue" }, as: "agri_officer" }));
    expect(ok.status).toBe(200);
    expect((await PATCH(req("PATCH", "/api/v1/agriculture/clusters", { body: { id: "00000000-0000-0000-0000-000000000000", status: "under_review" }, as: "agri_officer" }))).status).toBe(404);
  });
});
