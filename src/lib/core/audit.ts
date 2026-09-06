import "server-only";
import { getDb, schema } from "@/lib/db/client";

export interface AuditInput {
  action: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  systemEvent?: string;
  aiSummary?: string;
  ip?: string | null;
}

/** Append-only audit trail. Never throws: auditing must not break the request path. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.auditLogs).values({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeValue: input.before ?? null,
      afterValue: input.after ?? null,
      systemEvent: input.systemEvent,
      aiSummary: input.aiSummary ?? summarise(input),
      ip: input.ip ?? null,
    });
  } catch (err) {
    console.error("[audit] failed", err);
  }
}

/** Deterministic, human-readable change summary (no model call needed for routine events). */
function summarise(i: AuditInput): string {
  const who = i.actorRole ? `${i.actorRole}` : "système";
  const what = i.entityType ? `${i.entityType}${i.entityId ? ` ${i.entityId.slice(0, 8)}` : ""}` : "";
  const change =
    i.before !== undefined && i.after !== undefined
      ? ` (${JSON.stringify(i.before).slice(0, 80)} → ${JSON.stringify(i.after).slice(0, 80)})`
      : "";
  return `${who}: ${i.action} ${what}${change}`.trim();
}
