/**
 * POST /api/v1/sync/events — append-only, accept-once offline synchronisation.
 *
 * Conflict policy (PRD §11.2):
 *  · accept-once      — an event id is accepted exactly once; a replay reports "duplicate";
 *  · append-only      — observations and turns are never overwritten, only appended;
 *  · server authority — risk, severity, case state and consent are recomputed server-side;
 *                       a client event that contradicts them is stored as "conflict" and
 *                       kept for audit rather than applied;
 *  · last-write-wins  — citizen-authored drafts and preferences, compared on the client
 *                       timestamp; a stale write is stored as "conflict" and not applied.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { schema } from "@server/db/client";
import { emitEvent } from "@server/core/events";
import { channelGuard, parseJson, requestId } from "@server/channels/http";

const Event = z.object({
  id: z.string().min(8).max(64),
  localSeq: z.number().int().nonnegative(),
  clientTimestamp: z.string().min(4),
  schemaVersion: z.number().int().positive().default(1),
  type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const Body = z.object({
  deviceId: z.string().min(1).max(96),
  events: z.array(Event).min(1).max(200),
});

type SyncStatus = "accepted" | "applied" | "duplicate" | "conflict" | "rejected";

/** Types whose truth is computed on the server; a client may report but never set them. */
const SERVER_AUTHORITATIVE = ["risk.", "severity.", "case.", "escalation.", "consent."];
/** Types that are pure history: they are appended, never merged. */
const APPEND_ONLY = ["observation.", "turn.", "interaction.", "telemetry."];

function policyFor(type: string): "append_only" | "server_authoritative" | "last_write_wins" {
  if (APPEND_ONLY.some((p) => type.startsWith(p))) return "append_only";
  if (SERVER_AUTHORITATIVE.some((p) => type.startsWith(p))) return "server_authoritative";
  return "last_write_wins";
}

export const POST = handle({ permission: "interaction:create" }, async ({ req, db, user }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const body = await parseJson(req, Body, language, id);
    const results: Array<{ id: string; status: SyncStatus; reason?: string }> = [];

    for (const event of body.events) {
      const clientTimestamp = new Date(event.clientTimestamp);
      const timestamp = Number.isFinite(clientTimestamp.getTime()) ? clientTimestamp : new Date();
      const policy = policyFor(event.type);
      let status: SyncStatus = policy === "append_only" ? "accepted" : "applied";
      let reason: string | undefined;

      if (policy === "server_authoritative") {
        status = "conflict";
        reason = "server_authoritative_field";
      }

      // Accept-once: the client id is the primary key.
      const inserted = await db
        .insert(schema.syncEvents)
        .values({
          id: event.id,
          deviceId: body.deviceId,
          userId: user.userId,
          localSeq: event.localSeq,
          clientTimestamp: timestamp,
          schemaVersion: event.schemaVersion,
          type: event.type,
          payload: event.payload,
          status,
          conflictReason: reason ?? null,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        results.push({ id: event.id, status: "duplicate" });
        continue;
      }

      if (policy === "last_write_wins" && event.type === "draft.upsert") {
        const applied = await applyDraft(db, user.userId, timestamp, event.payload);
        if (!applied) {
          status = "conflict";
          reason = "stale_client_timestamp";
          await db
            .update(schema.syncEvents)
            .set({ status, conflictReason: reason })
            .where(eq(schema.syncEvents.id, event.id));
        }
      }

      results.push({ id: event.id, status, reason });
    }

    await emitEvent({
      type: "cvos.sync.batch_accepted",
      aggregateType: "device",
      aggregateId: body.deviceId,
      actor: { type: "citizen", id: user.userId },
      payload: {
        count: body.events.length,
        accepted: results.filter((r) => r.status !== "duplicate" && r.status !== "conflict").length,
        conflicts: results.filter((r) => r.status === "conflict").length,
      },
    });

    return { results, request_id: id };
  });
});

type Db = Awaited<ReturnType<typeof import("@server/db/client").getDb>>;

/** Last-write-wins on the client timestamp; a stale write is kept but not applied. */
async function applyDraft(db: Db, userId: string, clientTimestamp: Date, payload: Record<string, unknown>): Promise<boolean> {
  const clientKey = typeof payload.clientKey === "string" ? payload.clientKey : null;
  if (!clientKey) return false;
  const draftPayload = (payload.payload && typeof payload.payload === "object" ? payload.payload : {}) as Record<string, unknown>;
  const [existing] = await db
    .select()
    .from(schema.autosaveDrafts)
    .where(and(eq(schema.autosaveDrafts.userId, userId), eq(schema.autosaveDrafts.clientKey, clientKey)));
  if (existing) {
    if (new Date(existing.updatedAt).getTime() > clientTimestamp.getTime()) return false;
    await db
      .update(schema.autosaveDrafts)
      .set({ payload: draftPayload, version: existing.version + 1, updatedAt: new Date() })
      .where(eq(schema.autosaveDrafts.id, existing.id));
    return true;
  }
  await db.insert(schema.autosaveDrafts).values({ userId, clientKey, payload: draftPayload });
  return true;
}
