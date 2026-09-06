/**
 * Append-only, tamper-evident audit trail.
 *
 * Every row carries `hash = sha256(prevHash + canonicalJson(row))`, chained per calendar
 * day (UTC). The first row of a day chains from the GENESIS constant, so a day can be
 * verified on its own and an operator can archive one day at a time.
 *
 * `verifyAuditChain(date)` recomputes the whole day and reports the first row whose stored
 * hash no longer matches its content — an UPDATE or DELETE anywhere in the day is detected.
 * The scheduler runs it once a day (see ./scheduler.ts).
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { safeLog } from "./redact";

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
  /** Tenancy and purpose limitation (exports, break-glass, data requests). */
  tenantId?: string | null;
  traceId?: string | null;
  purpose?: string | null;
}

export const AUDIT_GENESIS = "GENESIS";

/**
 * Strictly increasing timestamps within a process so the chain order is unambiguous:
 * the chain is verified by ordering on (created_at, id), which requires distinct instants.
 */
let lastIssued = 0;
function nextInstant(): Date {
  const now = Date.now();
  lastIssued = now > lastIssued ? now : lastIssued + 1;
  return new Date(lastIssued);
}

/** Fields that take part in the hash, in a fixed order (canonical JSON). */
export interface AuditChainRow {
  id: string;
  action: string;
  actorUserId: string | null;
  actorRole: string | null;
  entityType: string | null;
  entityId: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  systemEvent: string | null;
  aiSummary: string | null;
  ip: string | null;
  tenantId: string | null;
  traceId: string | null;
  purpose: string | null;
  createdAt: Date;
}

/** Deterministic JSON: object keys sorted at every depth, dates as ISO strings. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === "undefined") return null;
  return value;
}

export function auditRowHash(prevHash: string | null, row: AuditChainRow): string {
  const payload = canonicalJson({
    id: row.id,
    action: row.action,
    actorUserId: row.actorUserId ?? null,
    actorRole: row.actorRole ?? null,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    beforeValue: row.beforeValue ?? null,
    afterValue: row.afterValue ?? null,
    systemEvent: row.systemEvent ?? null,
    aiSummary: row.aiSummary ?? null,
    ip: row.ip ?? null,
    tenantId: row.tenantId ?? null,
    traceId: row.traceId ?? null,
    purpose: row.purpose ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  });
  return createHash("sha256").update((prevHash ?? AUDIT_GENESIS) + payload).digest("hex");
}

function dayBounds(date: Date) {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  return { from, to };
}

/**
 * Append-only audit trail. Never throws: auditing must not break the request path.
 * Writes are serialised per process so the hash chain cannot fork under concurrency.
 */
let chainLock: Promise<unknown> = Promise.resolve();

export async function audit(input: AuditInput): Promise<void> {
  const run = chainLock.then(() => appendChained(input)).catch((err) => {
    safeLog.error("audit", "failed", err);
  });
  chainLock = run;
  await run;
}

async function appendChained(input: AuditInput): Promise<void> {
  const db = await getDb();
  const createdAt = nextInstant();
  const { from, to } = dayBounds(createdAt);
  const [prev] = await db
    .select({ hash: schema.auditLogs.hash })
    .from(schema.auditLogs)
    .where(and(gte(schema.auditLogs.createdAt, from), lt(schema.auditLogs.createdAt, to)))
    .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
    .limit(1);
  const prevHash = prev?.hash ?? null;

  const [inserted] = await db
    .insert(schema.auditLogs)
    .values({
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
      tenantId: input.tenantId ?? null,
      traceId: input.traceId ?? null,
      purpose: input.purpose ?? null,
      prevHash,
      createdAt,
    })
    .returning();

  const hash = auditRowHash(prevHash, inserted as unknown as AuditChainRow);
  await db.update(schema.auditLogs).set({ hash }).where(eq(schema.auditLogs.id, inserted.id));
}

export interface AuditChainVerification {
  date: string;
  ok: boolean;
  checked: number;
  brokenAt: { id: string; index: number; action: string; reason: string } | null;
}

/**
 * Recompute a day's chain. Detects modified rows (hash mismatch), removed rows
 * (broken prevHash link) and rows inserted after the fact.
 */
export async function verifyAuditChain(date: Date = new Date()): Promise<AuditChainVerification> {
  const db = await getDb();
  const { from, to } = dayBounds(date);
  const rows = await db
    .select()
    .from(schema.auditLogs)
    .where(and(gte(schema.auditLogs.createdAt, from), lt(schema.auditLogs.createdAt, to)))
    .orderBy(asc(schema.auditLogs.createdAt), asc(schema.auditLogs.id));

  let prevHash: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown as AuditChainRow & { hash: string | null; prevHash: string | null };
    if (row.hash === null) continue; // row still being written
    if ((row.prevHash ?? null) !== prevHash) {
      return { date: from.toISOString().slice(0, 10), ok: false, checked: i, brokenAt: { id: row.id, index: i, action: row.action, reason: "prev_hash_mismatch" } };
    }
    const expected = auditRowHash(prevHash, row);
    if (expected !== row.hash) {
      return { date: from.toISOString().slice(0, 10), ok: false, checked: i, brokenAt: { id: row.id, index: i, action: row.action, reason: "hash_mismatch" } };
    }
    prevHash = row.hash;
  }
  return { date: from.toISOString().slice(0, 10), ok: true, checked: rows.length, brokenAt: null };
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
