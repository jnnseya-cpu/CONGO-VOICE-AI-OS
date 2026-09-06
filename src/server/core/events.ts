/**
 * Append-only event store. Every state change of note is recorded here with the standard
 * envelope (event id, type, aggregate, actor, trace, classification, payload). Autosave,
 * audit replay and analytics projections derive from this log.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@server/db/client";
import type { ChannelType, LanguageCode, ModuleType } from "@server/db/schema";

export interface DomainEvent {
  type: string; // e.g. "cvos.session.turn.completed"
  aggregateType?: string;
  aggregateId?: string;
  aggregateVersion?: number;
  tenantId?: string | null;
  actor?: { type: "citizen" | "worker" | "system" | "ai"; id?: string | null };
  traceId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  channel?: ChannelType | null;
  language?: LanguageCode | null;
  module?: ModuleType | null;
  classification?: "public" | "internal" | "confidential" | "sensitive" | "restricted";
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/** Never throws: a reply must never be lost because logging failed. Returns the event id. */
export async function emitEvent(event: DomainEvent): Promise<string> {
  const eventId = randomUUID();
  try {
    const db = await getDb();
    await db.insert(schema.eventStore).values({
      eventId,
      eventType: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      tenantId: event.tenantId ?? null,
      actor: event.actor ?? { type: "system" },
      traceId: event.traceId ?? null,
      correlationId: event.correlationId ?? null,
      causationId: event.causationId ?? null,
      channel: event.channel ?? null,
      language: event.language ?? null,
      module: event.module ?? null,
      classification: event.classification ?? "internal",
      payload: event.payload ?? {},
      occurredAt: event.occurredAt ?? new Date(),
    });
  } catch (err) {
    console.error("[events] failed to record", event.type, err);
  }
  return eventId;
}
