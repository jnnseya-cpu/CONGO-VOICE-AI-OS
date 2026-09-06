import { beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession } from "@server/core/auth";

import { POST as createSessionRoute } from "@/app/api/v1/sessions/route";
import { GET as getSessionRoute } from "@/app/api/v1/sessions/[id]/route";
import { POST as resumeRoute } from "@/app/api/v1/sessions/[id]/resume/route";
import { POST as turnRoute } from "@/app/api/v1/sessions/[id]/turns/route";
import { GET as streamRoute } from "@/app/api/v1/sessions/[id]/stream/route";
import { GET as workflowRoute } from "@/app/api/v1/workflows/[id]/route";
import { POST as syncRoute } from "@/app/api/v1/sync/events/route";
import { POST as uploadsRoute, PUT as uploadChunkRoute } from "@/app/api/v1/media/uploads/route";

const ORIGIN = "http://localhost:3000";
let token = "";
let userId = "";

function authed(path: string, init: RequestInit = {}): NextRequest {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`${ORIGIN}${path}`, { ...init, headers } as ConstructorParameters<typeof NextRequest>[1]);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function newSession(body: Record<string, unknown> = {}): Promise<string> {
  const res = await createSessionRoute(
    authed("/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "pwa", language: "fr", ...body }),
    }),
  );
  const json = (await res.json()) as { session: { id: string } };
  return json.session.id;
}

describe("channel session API", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ isAnonymous: true, role: "citizen", languagePreference: "fr", province: "Kinshasa", consentStatus: "granted" })
      .returning();
    userId = user.id;
    token = encodeSession({ userId: user.id, role: "citizen", language: "fr", province: "Kinshasa", anonymous: true });
  });

  it("creates a session with negotiated capabilities and consent requirements", async () => {
    const res = await createSessionRoute(
      authed("/api/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: "pwa", language: "fr", province: "Kinshasa", capabilities: { video: false }, deviceId: "device-1" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { id: string; channel: string; language: string };
      capabilities: Record<string, unknown>;
      consent: { required: string[]; satisfied: boolean };
      request_id: string;
    };
    expect(body.session.channel).toBe("pwa");
    expect(body.capabilities.backgroundSync).toBe(true);
    expect(body.capabilities.video).toBe(false);
    expect(body.consent.required).toEqual(["service"]);
    expect(body.consent.satisfied).toBe(false);
    expect(body.request_id).toBeTruthy();

    const get = await getSessionRoute(authed(`/api/v1/sessions/${body.session.id}`), params(body.session.id));
    const detail = (await get.json()) as { session: { id: string }; capabilities: Record<string, unknown> };
    expect(detail.session.id).toBe(body.session.id);
    expect(detail.capabilities.longText).toBe(true);
  });

  it("runs a text turn and exposes the workflow status", async () => {
    const sessionId = await newSession();
    const res = await turnRoute(
      authed(`/api/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input_kind: "text", text: "Je ne comprends pas les fractions", lang_hint: "fr" }),
      }),
      params(sessionId),
    );
    expect(res.status).toBe(200);
    const turn = (await res.json()) as {
      interaction_id: string;
      module: string;
      text: string;
      seq: number;
      replayed: boolean;
    };
    expect(turn.module).toBe("education");
    expect(turn.seq).toBe(1);
    expect(turn.replayed).toBe(false);
    expect(turn.text.length).toBeGreaterThan(10);

    const workflow = await workflowRoute(authed(`/api/v1/workflows/${turn.interaction_id}`), params(turn.interaction_id));
    const status = (await workflow.json()) as { workflow: { stage: string; progress: number; partial: { response: string } } };
    expect(status.workflow.stage).toBe("completed");
    expect(status.workflow.progress).toBe(1);
    expect(status.workflow.partial.response.length).toBeGreaterThan(10);

    const stream = await streamRoute(
      authed(`/api/v1/sessions/${sessionId}/stream?interaction_id=${turn.interaction_id}`),
      params(sessionId),
    );
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const events = await stream.text();
    expect(events).toContain("event: open");
    expect(events).toContain("event: stage");
    expect(events).toContain("event: done");
  });

  it("replays an identical turn instead of running it twice", async () => {
    const db = await getDb();
    const sessionId = await newSession();
    const key = randomUUID();
    const body = () =>
      authed(`/api/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ input_kind: "text", text: "Quand dois-je vacciner mon bébé ?" }),
      });

    const first = (await (await turnRoute(body(), params(sessionId))).json()) as { interaction_id: string; replayed: boolean };
    const second = (await (await turnRoute(body(), params(sessionId))).json()) as { interaction_id: string; replayed: boolean };

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.interaction_id).toBe(first.interaction_id);

    const rows = await db.select().from(schema.interactions).where(eq(schema.interactions.sessionId, sessionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].idempotencyKey).toBe(key);
  });

  it("short-circuits an emergency turn and reports the safety notice", async () => {
    const sessionId = await newSession();
    const res = await turnRoute(
      authed(`/api/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Mon enfant a des convulsions et ne respire plus normalement" }),
      }),
      params(sessionId),
    );
    const body = (await res.json()) as {
      status: string;
      emergency: boolean;
      text: string;
      case_id: string | null;
      interaction_id: string | null;
      notice: { code: string; safe_localised_message: string };
    };
    expect(body.status).toBe("emergency");
    expect(body.emergency).toBe(true);
    expect(body.text).toContain("centre de santé");
    expect(body.notice.code).toBe("SAFETY_ESCALATION_CREATED");
    expect(body.interaction_id).toBeTruthy();
    expect(body.case_id).toBeTruthy();
  });

  it("resumes a session with the 'where we left off' summary", async () => {
    const sessionId = await newSession();
    await turnRoute(
      authed(`/api/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Mes poules meurent une par une" }),
      }),
      params(sessionId),
    );
    const res = await resumeRoute(authed(`/api/v1/sessions/${sessionId}/resume`, { method: "POST" }), params(sessionId));
    const body = (await res.json()) as { resumeSummary: string; lastAnswer: string; session: { turnCount: number } };
    expect(body.session.turnCount).toBe(1);
    expect(body.resumeSummary).toContain("poules");
    expect(body.lastAnswer.length).toBeGreaterThan(10);
  });

  it("answers with the channel error contract", async () => {
    const sessionId = await newSession();
    const empty = await turnRoute(
      authed(`/api/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input_kind: "text" }),
      }),
      params(sessionId),
    );
    expect(empty.status).toBe(400);
    const body = (await empty.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "VALIDATION_FAILED",
      message_key: "channel.error.validation_failed",
      retryable: false,
    });
    expect(body.fields).toEqual(["text", "audio", "media[]"]);
    expect(typeof body.safe_localised_message).toBe("string");
    expect(typeof body.request_id).toBe("string");

    const unsupported = await turnRoute(
      authed(`/api/v1/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "bonjour", lang_hint: "es" }),
      }),
      params(sessionId),
    );
    expect(unsupported.status).toBe(400);
    expect((await unsupported.json()).code).toBe("LANGUAGE_UNSUPPORTED");

    const missing = await getSessionRoute(
      authed(`/api/v1/sessions/${randomUUID()}`),
      params("00000000-0000-4000-8000-000000000999"),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("NOT_FOUND");
  });

  it("accepts offline sync events exactly once and applies the conflict policy", async () => {
    const eventId = randomUUID();
    const send = (events: unknown[]) =>
      syncRoute(
        authed("/api/v1/sync/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: "device-1", events }),
        }),
      );

    const first = (await (
      await send([
        {
          id: eventId,
          localSeq: 1,
          clientTimestamp: new Date().toISOString(),
          type: "draft.upsert",
          payload: { clientKey: "draft-1", payload: { text: "brouillon hors ligne" } },
        },
        {
          id: randomUUID(),
          localSeq: 2,
          clientTimestamp: new Date().toISOString(),
          type: "observation.voice_note",
          payload: { seconds: 12 },
        },
        {
          id: randomUUID(),
          localSeq: 3,
          clientTimestamp: new Date().toISOString(),
          type: "case.status",
          payload: { status: "resolved" },
        },
      ])
    ).json()) as { results: Array<{ id: string; status: string; reason?: string }> };

    expect(first.results[0].status).toBe("applied");
    expect(first.results[1].status).toBe("accepted");
    expect(first.results[2].status).toBe("conflict");
    expect(first.results[2].reason).toBe("server_authoritative_field");

    const replay = (await (
      await send([
        { id: eventId, localSeq: 1, clientTimestamp: new Date().toISOString(), type: "draft.upsert", payload: { clientKey: "draft-1" } },
      ])
    ).json()) as { results: Array<{ status: string }> };
    expect(replay.results[0].status).toBe("duplicate");

    const db = await getDb();
    const drafts = await db.select().from(schema.autosaveDrafts).where(eq(schema.autosaveDrafts.userId, userId));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].payload).toEqual({ text: "brouillon hors ligne" });

    // A stale write (older client timestamp) is recorded but not applied.
    const stale = (await (
      await send([
        {
          id: randomUUID(),
          localSeq: 4,
          clientTimestamp: new Date(Date.now() - 86_400_000).toISOString(),
          type: "draft.upsert",
          payload: { clientKey: "draft-1", payload: { text: "ancienne version" } },
        },
      ])
    ).json()) as { results: Array<{ status: string; reason?: string }> };
    expect(stale.results[0].status).toBe("conflict");
    expect(stale.results[0].reason).toBe("stale_client_timestamp");
    const [unchanged] = await db.select().from(schema.autosaveDrafts).where(eq(schema.autosaveDrafts.userId, userId));
    expect(unchanged.payload).toEqual({ text: "brouillon hors ligne" });
  });

  it("uploads a photo in resumable chunks and verifies the checksum", async () => {
    const data = Buffer.from(Array.from({ length: 2048 }, (_, i) => i % 251));
    const sha256 = createHash("sha256").update(data).digest("hex");

    const init = (await (
      await uploadsRoute(
        authed("/api/v1/media/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "init", mimeType: "image/jpeg", sizeBytes: data.length, sha256 }),
        }),
      )
    ).json()) as { upload_id: string; chunk_size: number };
    expect(init.upload_id).toBeTruthy();

    const half = data.length / 2;
    for (const [start, end] of [
      [0, half - 1],
      [half, data.length - 1],
    ]) {
      const res = await uploadChunkRoute(
        authed("/api/v1/media/uploads", {
          method: "PUT",
          headers: {
            "upload-id": init.upload_id,
            "content-range": `bytes ${start}-${end}/${data.length}`,
            "content-type": "application/octet-stream",
          },
          body: new Uint8Array(data.subarray(start, end + 1)),
        }),
      );
      expect(res.status).toBe(200);
    }

    const complete = (await (
      await uploadsRoute(
        authed("/api/v1/media/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "complete", upload_id: init.upload_id, sha256 }),
        }),
      )
    ).json()) as { file_id: string; sha256: string; size_bytes: number };
    expect(complete.sha256).toBe(sha256);
    expect(complete.size_bytes).toBe(data.length);

    const db = await getDb();
    const [file] = await db.select().from(schema.files).where(eq(schema.files.id, complete.file_id));
    expect(file.mimeType).toBe("image/jpeg");
    expect(file.sizeBytes).toBe(data.length);
  });

  it("accepts a multipart turn with a photo attachment", async () => {
    const db = await getDb();
    const sessionId = await newSession();
    const form = new FormData();
    form.set("input_kind", "image");
    form.set("text", "Les feuilles de mon manioc jaunissent");
    form.set("lang_hint", "fr");
    form.append("media[]", new File([new Uint8Array([255, 216, 255, 224, 0, 16])], "champ.jpg", { type: "image/jpeg" }));

    const res = await turnRoute(
      authed(`/api/v1/sessions/${sessionId}/turns`, { method: "POST", body: form }),
      params(sessionId),
    );
    expect(res.status).toBe(200);
    const turn = (await res.json()) as { module: string; interaction_id: string };
    expect(turn.module).toBe("agriculture");

    const [interaction] = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.id, turn.interaction_id));
    expect(interaction.attachmentIds).toHaveLength(1);
    const [file] = await db.select().from(schema.files).where(eq(schema.files.id, interaction.attachmentIds[0]));
    expect(file.kind).toBe("image");
  });

  it("refuses a completion when a chunk is missing", async () => {
    const init = (await (
      await uploadsRoute(
        authed("/api/v1/media/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "init", mimeType: "image/png", sizeBytes: 100 }),
        }),
      )
    ).json()) as { upload_id: string };

    await uploadChunkRoute(
      authed("/api/v1/media/uploads", {
        method: "PUT",
        headers: { "upload-id": init.upload_id, "content-range": "bytes 0-49/100" },
        body: new Uint8Array(50),
      }),
    );

    const res = await uploadsRoute(
      authed("/api/v1/media/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", upload_id: init.upload_id }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; received_bytes: number; expected_bytes: number };
    expect(body.code).toBe("STATE_CONFLICT");
    expect(body.received_bytes).toBe(50);
    expect(body.expected_bytes).toBe(100);
  });
});
