/**
 * Whose notification is it.
 *
 * A brand-new anonymous session, having done nothing at all, opened the app and
 * its bell showed twelve unread alerts carrying other people's clinical
 * complaints verbatim and their case identifiers. The list endpoint asked for
 * `userId = me OR userId IS NULL`, and notifyRole() writes an unowned row
 * whenever nobody holds the role an alert is addressed to — which is the pilot's
 * normal state, because no community health worker has been appointed yet.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession } from "@server/core/auth";
import type { Role } from "@server/db/schema";

const BASE = "http://localhost:3000";
const token: Record<string, string> = {};
const ids: Record<string, string> = {};

function as(who: string) {
  return new NextRequest(`${BASE}/api/v1/notifications`, { headers: new Headers({ authorization: `Bearer ${token[who]}` }) });
}
async function listAs(who: string) {
  const { GET } = await import("@/app/api/v1/notifications/route");
  const res = await GET(as(who));
  return (await res.json()) as { notifications: Array<{ id: string; title: string }>; unread: number };
}
async function mk(label: string, role: Role, anonymous: boolean, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ role, isAnonymous: anonymous, languagePreference: "fr", ...extra }).returning();
  token[label] = encodeSession({ userId: u.id, role, language: "fr", province: (extra.province as string) ?? null, anonymous });
  ids[label] = u.id;
  return u.id;
}

describe("the bell", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await mk("anon", "citizen", true);
    await mk("citizen", "citizen", false, { phone: "+243970000001" });
    await mk("otherCitizen", "citizen", false, { phone: "+243970000002" });
    await mk("chwKin", "chw", false, { phone: "+243970000003", province: "Kinshasa" });
    await mk("chwKat", "chw", false, { phone: "+243970000004", province: "Haut-Katanga" });
    await mk("teacher", "teacher", false, { phone: "+243970000005", province: "Kinshasa" });
    await mk("admin", "platform_admin", false, { phone: "+243970000006" });

    // An unassigned health escalation for Kinshasa: what notifyRole() writes
    // when no community health worker exists yet.
    await db.insert(schema.notifications).values({
      userId: null, type: "escalation", title: "Alerte urgente — santé",
      body: "La personne signale : mon enfant convulse et ne peut plus boire",
      payload: { intendedRole: "chw", module: "health", province: "Kinshasa", caseId: "c-1" },
    });
    // One addressed to this citizen personally.
    await db.insert(schema.notifications).values({
      userId: ids.citizen, type: "follow_up", title: "Suivi de votre demande", body: "Un agent vous rappellera.", payload: {},
    });
  });

  it("shows a visitor without an account nothing at all", async () => {
    const out = await listAs("anon");
    expect(out.notifications).toHaveLength(0);
    expect(out.unread, "an unread badge on an account that does not exist").toBe(0);
  });

  it("shows a citizen only their own", async () => {
    const out = await listAs("citizen");
    expect(out.notifications).toHaveLength(1);
    expect(out.notifications[0].title).toBe("Suivi de votre demande");
    expect(JSON.stringify(out.notifications)).not.toContain("convulse");
  });

  it("shows another citizen nothing of theirs", async () => {
    const out = await listAs("otherCitizen");
    expect(out.notifications).toHaveLength(0);
  });

  it("shows the health worker the health alert for their province", async () => {
    const out = await listAs("chwKin");
    expect(out.notifications.map((n) => n.title)).toContain("Alerte urgente — santé");
  });

  it("does not show it to a health worker in another province", async () => {
    const out = await listAs("chwKat");
    expect(out.notifications).toHaveLength(0);
  });

  it("does not show a health alert to a teacher", async () => {
    const out = await listAs("teacher");
    expect(out.notifications).toHaveLength(0);
  });

  it("shows an administrator the unassigned queue, because somebody must", async () => {
    const out = await listAs("admin");
    expect(out.notifications.map((n) => n.title)).toContain("Alerte urgente — santé");
  });
});

describe("clearing somebody else's emergency", () => {
  it("a citizen cannot mark an unassigned alert as read", async () => {
    const db = await getDb();
    const unassigned = (await db.select().from(schema.notifications)).find((r) => r.userId === null)!;
    const { PATCH } = await import("@/app/api/v1/notifications/[id]/route");
    const res = await PATCH(
      new NextRequest(`${BASE}/api/v1/notifications/${unassigned.id}`, { method: "PATCH", headers: new Headers({ authorization: `Bearer ${token.citizen}` }) }),
      { params: Promise.resolve({ id: unassigned.id }) },
    );
    expect(res.status, "marking it read hides it from the worker who must act").toBe(404);
  });

  it("a citizen cannot acknowledge one either", async () => {
    const db = await getDb();
    const unassigned = (await db.select().from(schema.notifications)).find((r) => r.userId === null)!;
    const { POST } = await import("@/app/api/v1/notifications/[id]/ack/route");
    const res = await POST(
      new NextRequest(`${BASE}/api/v1/notifications/${unassigned.id}/ack`, { method: "POST", headers: new Headers({ authorization: `Bearer ${token.citizen}` }) }),
      { params: Promise.resolve({ id: unassigned.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("the health worker it was addressed to can", async () => {
    const db = await getDb();
    const unassigned = (await db.select().from(schema.notifications)).find((r) => r.userId === null)!;
    const { POST } = await import("@/app/api/v1/notifications/[id]/ack/route");
    const res = await POST(
      new NextRequest(`${BASE}/api/v1/notifications/${unassigned.id}/ack`, { method: "POST", headers: new Headers({ authorization: `Bearer ${token.chwKin}` }) }),
      { params: Promise.resolve({ id: unassigned.id }) },
    );
    expect(res.status).toBe(200);
  });
});
