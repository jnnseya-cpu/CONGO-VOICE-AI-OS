/**
 * Privacy operations: right of access, erasure and the tombstoning workflow.
 *
 * Erasure deletes the media and pseudonymises the rows that identify a person, while the
 * statutory audit trail is kept intact (it is evidence of what the programme did, and it
 * never contains free-text personal data). A legal hold blocks erasure until it is lifted.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { audit } from "./audit";
import { emitEvent } from "./events";
import { storage } from "./storage";
import { safeLog } from "./redact";

/** Legal answer time for a data request (30 days). */
export const DATA_REQUEST_SLA_DAYS = 30;

export function dueDateFor(at: Date = new Date()): Date {
  return new Date(at.getTime() + DATA_REQUEST_SLA_DAYS * 24 * 3600 * 1000);
}

export interface CreateDataRequestInput {
  userId: string;
  type: "access" | "erasure";
  method?: string;
  requestedBy: { userId: string; role: string };
  evidence?: Record<string, unknown>;
  ip?: string | null;
}

export async function createDataRequest(input: CreateDataRequestInput) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.dataRequests)
    .values({
      userId: input.userId,
      type: input.type,
      method: input.method ?? "voice",
      dueAt: dueDateFor(),
      evidence: input.evidence ?? {},
    })
    .returning();
  await audit({
    action: `privacy.${input.type}_requested`,
    actorUserId: input.requestedBy.userId,
    actorRole: input.requestedBy.role,
    entityType: "data_request",
    entityId: row.id,
    after: { type: input.type, dueAt: row.dueAt },
    purpose: "data_subject_request",
    ip: input.ip ?? null,
  });
  await emitEvent({ type: `privacy.request.${input.type}`, aggregateType: "data_request", aggregateId: row.id, classification: "confidential", payload: { dueAt: row.dueAt.toISOString() } });
  return row;
}

/** Everything the platform holds about one person, for the access request package. */
export async function buildAccessPackage(userId: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return null;
  const interactions = await db.select().from(schema.interactions).where(eq(schema.interactions.userId, userId));
  const interactionIds = interactions.map((i) => i.id);
  const cases = await db.select().from(schema.cases).where(eq(schema.cases.userId, userId));
  const consents = await db.select().from(schema.consents).where(eq(schema.consents.userId, userId));
  const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
  const files = await db.select().from(schema.files).where(eq(schema.files.userId, userId));
  const triage = interactionIds.length ? await db.select().from(schema.healthTriageRecords).where(inArray(schema.healthTriageRecords.interactionId, interactionIds)) : [];
  const agri = interactionIds.length ? await db.select().from(schema.agricultureReports).where(inArray(schema.agricultureReports.interactionId, interactionIds)) : [];
  const education = interactionIds.length ? await db.select().from(schema.educationSessions).where(inArray(schema.educationSessions.interactionId, interactionIds)) : [];
  return {
    generatedAt: new Date().toISOString(),
    person: { id: user.id, name: user.name, phone: user.phone, province: user.province, territory: user.territory, language: user.languagePreference, createdAt: user.createdAt },
    counts: { interactions: interactions.length, cases: cases.length, files: files.length, notifications: notifications.length },
    consents,
    interactions: interactions.map((i) => ({ id: i.id, at: i.createdAt, module: i.module, channel: i.channel, language: i.language, transcript: i.transcript, response: i.response, severity: i.severity })),
    cases: cases.map((c) => ({ id: c.id, at: c.createdAt, module: c.module, title: c.title, status: c.status, outcome: c.outcome })),
    healthRecords: triage,
    agricultureReports: agri,
    educationSessions: education,
    notifications: notifications.map((n) => ({ id: n.id, at: n.createdAt, type: n.type, channel: n.channel, status: n.status })),
    files: files.map((f) => ({ id: f.id, kind: f.kind, sizeBytes: f.sizeBytes, at: f.createdAt })),
  };
}

export interface TombstoneResult {
  userId: string;
  tombstoneId: string;
  filesDeleted: number;
  interactionsPseudonymised: number;
  casesPseudonymised: number;
  notificationsPurged: number;
  auditRowsKept: number;
}

/** Stable, non-reversible replacement identifier written where a person used to be named. */
export function tombstoneToken(userId: string): string {
  return "erased-" + createHash("sha256").update(`tombstone:${userId}`).digest("hex").slice(0, 16);
}

/**
 * Erasure: delete media, blank free-text personal content, pseudonymise the account, and
 * keep the audit trail and the de-identified statistics the programme is required to hold.
 */
export async function tombstoneUser(userId: string, actor: { userId: string; role: string }, opts: { requestId?: string; ip?: string | null } = {}): Promise<TombstoneResult> {
  const db = await getDb();
  const token = tombstoneToken(userId);

  // 1. Media: removed from storage and from the catalogue.
  const files = await db.select().from(schema.files).where(eq(schema.files.userId, userId));
  let filesDeleted = 0;
  for (const f of files) {
    try {
      await storage().delete(f.storageKey);
      filesDeleted++;
    } catch (err) {
      safeLog.warn("privacy", `could not delete stored object for file ${f.id}`, err);
    }
  }
  if (files.length) await db.delete(schema.files).where(eq(schema.files.userId, userId));

  // 2. Interactions: keep the analytical skeleton, drop the words and the audio.
  const interactions = await db.select({ id: schema.interactions.id }).from(schema.interactions).where(eq(schema.interactions.userId, userId));
  if (interactions.length) {
    await db
      .update(schema.interactions)
      .set({ originalInput: null, transcript: null, translationFr: null, response: null, understanding: null, summary: null, structured: {}, audioFileId: null, attachmentIds: [], auditStatus: "erased" })
      .where(eq(schema.interactions.userId, userId));
  }

  // 3. Cases: title and notes pseudonymised, outcome statistics preserved.
  const cases = await db.select({ id: schema.cases.id }).from(schema.cases).where(eq(schema.cases.userId, userId));
  if (cases.length) {
    await db.update(schema.cases).set({ title: `Cas anonymisé ${token}`, notes: null, resolution: null }).where(eq(schema.cases.userId, userId));
  }

  // 4. Message content and identifiers.
  const notifications = await db.select({ id: schema.notifications.id }).from(schema.notifications).where(eq(schema.notifications.userId, userId));
  if (notifications.length) {
    await db.update(schema.notifications).set({ body: "[effacé]", title: "[effacé]", to: null, payload: {} }).where(eq(schema.notifications.userId, userId));
  }
  await db.delete(schema.citizenIdentifiers).where(eq(schema.citizenIdentifiers.userId, userId));
  await db.update(schema.languageCorpus).set({ sourceText: "[effacé]", translationFr: null, correctedSourceText: null, correctedTranslationFr: null }).where(
    inArray(schema.languageCorpus.interactionId, interactions.length ? interactions.map((i) => i.id) : [randomUUID()]),
  );

  // 5. The account itself becomes a tombstone.
  await db
    .update(schema.users)
    .set({ name: null, phone: null, pinHash: null, isAnonymous: true, status: "erased", preferences: { tombstone: token }, mfaSecret: null, mfaEnabled: false, pseudoId: token })
    .where(eq(schema.users.id, userId));

  const auditRows = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs).where(eq(schema.auditLogs.actorUserId, userId));

  await audit({
    action: "privacy.erasure_executed",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "user",
    entityId: userId,
    after: { tombstone: token, filesDeleted, interactions: interactions.length, cases: cases.length, requestId: opts.requestId ?? null },
    purpose: "data_subject_request",
    ip: opts.ip ?? null,
  });
  await emitEvent({ type: "privacy.erasure.executed", aggregateType: "user", aggregateId: userId, classification: "confidential", payload: { tombstone: token, filesDeleted } });

  return {
    userId,
    tombstoneId: token,
    filesDeleted,
    interactionsPseudonymised: interactions.length,
    casesPseudonymised: cases.length,
    notificationsPurged: notifications.length,
    auditRowsKept: auditRows.length,
  };
}

/** Execute an open data request. Access produces a package; erasure tombstones the person. */
export async function processDataRequest(requestId: string, actor: { userId: string; role: string }, ip?: string | null) {
  const db = await getDb();
  const [req] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, requestId));
  if (!req) return null;
  if (req.legalHold) {
    await db.update(schema.dataRequests).set({ status: "on_hold" }).where(eq(schema.dataRequests.id, requestId));
    await audit({ action: "privacy.request_on_hold", actorUserId: actor.userId, actorRole: actor.role, entityType: "data_request", entityId: requestId, purpose: "legal_hold" });
    return { request: { ...req, status: "on_hold" as const }, result: null };
  }
  if (req.type === "access") {
    const pkg = await buildAccessPackage(req.userId);
    const [updated] = await db
      .update(schema.dataRequests)
      .set({ status: "completed", completedAt: new Date(), evidence: { ...(req.evidence ?? {}), counts: pkg?.counts ?? null } })
      .where(eq(schema.dataRequests.id, requestId))
      .returning();
    await audit({ action: "privacy.access_fulfilled", actorUserId: actor.userId, actorRole: actor.role, entityType: "data_request", entityId: requestId, after: pkg?.counts ?? null, purpose: "data_subject_request", ip });
    return { request: updated, result: pkg };
  }
  const result = await tombstoneUser(req.userId, actor, { requestId, ip });
  const [updated] = await db
    .update(schema.dataRequests)
    .set({ status: "completed", completedAt: new Date(), evidence: { ...(req.evidence ?? {}), tombstone: result.tombstoneId } })
    .where(eq(schema.dataRequests.id, requestId))
    .returning();
  return { request: updated, result };
}

/** Requests approaching or past the 30-day deadline (scheduler + compliance dashboard). */
export async function overdueDataRequests(now = new Date()) {
  const db = await getDb();
  const rows = await db.select().from(schema.dataRequests).where(inArray(schema.dataRequests.status, ["open", "in_progress"]));
  return rows.filter((r) => r.dueAt.getTime() <= now.getTime());
}

/** Break-glass grants currently in force for a user. */
export async function activeBreakGlass(userId: string, now = new Date()) {
  const db = await getDb();
  const rows = await db.select().from(schema.breakGlassAccess).where(and(eq(schema.breakGlassAccess.userId, userId)));
  return rows.filter((r) => !r.revokedAt && r.expiresAt.getTime() > now.getTime());
}
