import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getDb, resetDbForTests } from "@server/db/client";
import { POST as createInteraction } from "@/app/api/v1/interactions/route";
import { encodeSession } from "@server/core/auth";
import { NextRequest } from "next/server";

/**
 * A photograph that never arrives must not produce a confident diagnosis.
 *
 * The route read `form.getAll("images")` while the API documentation published
 * `images[]`. An integrator following the documentation uploaded a leaf, the
 * field was ignored, and the answer came back from the text alone — naming a
 * crop disease and a percentage. Nothing told them their photograph had been
 * discarded. Both spellings are accepted now, and a file under any other name
 * is refused rather than dropped.
 */
async function anonymousToken(): Promise<string> {
  const db = await getDb();
  const { schema } = await import("@server/db/client");
  const [user] = await db.insert(schema.users).values({ role: "citizen", isAnonymous: true, languagePreference: "fr", status: "active" }).returning();
  return encodeSession({ userId: user.id, role: "citizen", language: "fr", anonymous: true });
}

function request(form: FormData, token: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/interactions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

const PHOTO = readFileSync(new URL("./fixtures/camera-photo.heic", import.meta.url));

describe("interaction attachments", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("accepts a photograph under the documented field name", async () => {
    const token = await anonymousToken();
    const form = new FormData();
    form.set("text", "Ma plante de manioc a des taches jaunes");
    form.set("module", "agriculture");
    form.append("images[]", new Blob([PHOTO], { type: "image/heic" }), "photo.heic");

    const res = await createInteraction(request(form, token), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { interactionId: string };
    expect(body.interactionId).toBeTruthy();
  });

  it("accepts the same photograph under the field the client sends", async () => {
    const token = await anonymousToken();
    const form = new FormData();
    form.set("text", "Ma plante de manioc a des taches jaunes");
    form.set("module", "agriculture");
    form.append("images", new Blob([PHOTO], { type: "image/heic" }), "photo.heic");

    const res = await createInteraction(request(form, token), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("refuses a file sent under a field name it does not read, instead of ignoring it", async () => {
    const token = await anonymousToken();
    const form = new FormData();
    form.set("text", "Ma plante de manioc a des taches jaunes");
    form.set("module", "agriculture");
    form.append("photo", new Blob([PHOTO], { type: "image/heic" }), "photo.heic");

    const res = await createInteraction(request(form, token), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("photo");
  });

  it("refuses a file that is not really an image", async () => {
    const token = await anonymousToken();
    const form = new FormData();
    form.set("text", "Ma plante de manioc a des taches jaunes");
    form.set("module", "agriculture");
    form.append("images", new Blob([Buffer.from("MZ\u0090\u0000not a photograph")], { type: "image/jpeg" }), "payload.jpg");

    const res = await createInteraction(request(form, token), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});

/**
 * A double tap must not become two cases.
 *
 * Mind 2 taps twice when a slow connection makes nothing happen, and a client
 * retries after a timeout. The queued-offline route honoured `Idempotency-Key`;
 * this one did not, so one question produced two interactions — and for a danger
 * sign, two critical cases and two people alerted to one child.
 */
describe("duplicate submission", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  function jsonRequest(token: string, body: unknown, key?: string): NextRequest {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    if (key) headers["Idempotency-Key"] = key;
    return new NextRequest("http://localhost/api/v1/interactions", { method: "POST", headers, body: JSON.stringify(body) });
  }

  it("returns the first answer again instead of running the turn twice", async () => {
    const token = await anonymousToken();
    const body = { text: "Mon enfant a de la fièvre depuis deux jours", module: "health" };

    const first = await createInteraction(jsonRequest(token, body, "tap-1"), { params: Promise.resolve({}) });
    const second = await createInteraction(jsonRequest(token, body, "tap-1"), { params: Promise.resolve({}) });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { interactionId: string };
    const b = (await second.json()) as { interactionId: string };
    expect(b.interactionId).toBe(a.interactionId);

    const { schema } = await import("@server/db/client");
    const db = await getDb();
    const rows = await db.select().from(schema.interactions);
    expect(rows.length).toBe(1);
  });

  it("refuses the same key used for a different question", async () => {
    const token = await anonymousToken();
    await createInteraction(jsonRequest(token, { text: "Première question sur la fièvre", module: "health" }, "tap-2"), { params: Promise.resolve({}) });
    const other = await createInteraction(jsonRequest(token, { text: "Une tout autre question sur le maïs", module: "agriculture" }, "tap-2"), { params: Promise.resolve({}) });
    expect(other.status).toBe(409);
  });

  it("still answers a request that carries no key at all", async () => {
    const token = await anonymousToken();
    const res = await createInteraction(jsonRequest(token, { text: "Question sans clé", module: "general" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });
});
