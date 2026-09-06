/**
 * Report jobs: queue → run → store → expire.
 *
 * Reports are asynchronous because a quarterly national report is not a request-response
 * operation. Every produced file is purpose-coded, audited and expires after seven days;
 * the download route streams it and refuses an expired link.
 */
import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { audit } from "@/lib/core/audit";
import { emitEvent } from "@/lib/core/events";
import { notifyTemplate } from "@/lib/core/notifications";
import { storage } from "@/lib/core/storage";
import { safeLog } from "@/lib/core/redact";
import { buildReport } from "./datasets";
import { renderCsv } from "./csv";
import { REPORT_CATALOGUE, periodFor, type Cadence, type ReportFormat, type ReportType } from "./types";

export * from "./types";
export { buildReport } from "./datasets";

/** Links expire after seven days; the stored object is deleted at the same time. */
export const REPORT_TTL_DAYS = 7;

export const MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};
const EXT: Record<ReportFormat, string> = { pdf: "pdf", xlsx: "xlsx", csv: "csv" };

export interface CreateReportJobInput {
  type: ReportType;
  format?: ReportFormat;
  scope?: Record<string, unknown>;
  period?: { from?: string | null; to?: string | null };
  requestedBy?: string | null;
  requestedByRole?: string | null;
  definitionId?: string | null;
  /** Purpose limitation: why this export exists. */
  purpose?: string;
  ip?: string | null;
}

export async function createReportJob(input: CreateReportJobInput) {
  const db = await getDb();
  const meta = REPORT_CATALOGUE[input.type];
  const format = input.format ?? meta.defaultFormat;
  const period = periodFor(input.type, input.period?.from ?? null, input.period?.to ?? null);
  const [row] = await db
    .insert(schema.reports)
    .values({
      type: input.type,
      format,
      scope: input.scope ?? {},
      period: { from: period.from, to: period.to },
      status: "queued",
      requestedBy: input.requestedBy ?? null,
      definitionId: input.definitionId ?? null,
      purpose: input.purpose ?? `${meta.audience} — ${meta.cadence}`,
      expiresAt: new Date(Date.now() + REPORT_TTL_DAYS * 24 * 3600 * 1000),
    })
    .returning();
  await audit({
    action: "report.requested",
    actorUserId: input.requestedBy ?? null,
    actorRole: input.requestedByRole ?? null,
    entityType: "report",
    entityId: row.id,
    after: { type: input.type, format, scope: input.scope ?? {}, period },
    purpose: row.purpose,
    ip: input.ip ?? null,
  });
  await emitEvent({ type: "report.requested", aggregateType: "report", aggregateId: row.id, payload: { type: input.type, format, period } });
  return row;
}

/** Build and store one queued report. Safe to call twice: a ready report is returned as is. */
export async function runReportJob(reportId: string) {
  const db = await getDb();
  const [job] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
  if (!job) return null;
  if (job.status === "ready") return job;
  await db.update(schema.reports).set({ status: "running" }).where(eq(schema.reports.id, reportId));

  try {
    const type = job.type as ReportType;
    const format = job.format as ReportFormat;
    const period = periodFor(type, job.period?.from ?? null, job.period?.to ?? null);
    const doc = await buildReport(type, { period, scope: job.scope ?? {} });

    let buffer: Buffer;
    if (format === "csv") buffer = Buffer.from("﻿" + renderCsv(doc), "utf8");
    else if (format === "xlsx") {
      const { renderXlsx } = await import("./xlsx");
      buffer = await renderXlsx(doc);
    } else {
      const { renderPdf } = await import("./pdf");
      buffer = await renderPdf(doc);
    }

    const key = `reports/${new Date().toISOString().slice(0, 10)}/${job.id}.${EXT[format]}`;
    await storage().put(key, buffer, MIME[format]);
    const [ready] = await db
      .update(schema.reports)
      .set({ status: "ready", storageKey: key, sizeBytes: buffer.length, completedAt: new Date(), error: null, expiresAt: new Date(Date.now() + REPORT_TTL_DAYS * 24 * 3600 * 1000) })
      .where(eq(schema.reports.id, reportId))
      .returning();
    await audit({ action: "report.generated", actorUserId: job.requestedBy, entityType: "report", entityId: job.id, after: { type: job.type, format, sizeBytes: buffer.length }, purpose: job.purpose, systemEvent: "report_engine" });
    await emitEvent({ type: "report.ready", aggregateType: "report", aggregateId: job.id, payload: { type: job.type, format, sizeBytes: buffer.length, expiresAt: ready.expiresAt?.toISOString() ?? null } });
    if (job.requestedBy) {
      await notifyTemplate({
        key: "report.ready",
        userId: job.requestedBy,
        type: "report",
        channel: "in_app",
        vars: { reportName: REPORT_CATALOGUE[type].name, period: period.label, expiresAt: ready.expiresAt?.toISOString().slice(0, 10) ?? "—" },
        payload: { reportId: job.id, format },
      });
    }
    return ready;
  } catch (err) {
    safeLog.error("reports", `job ${reportId} failed`, err);
    const [failed] = await db
      .update(schema.reports)
      .set({ status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
      .where(eq(schema.reports.id, reportId))
      .returning();
    await emitEvent({ type: "report.failed", aggregateType: "report", aggregateId: reportId, payload: { error: failed?.error ?? null } });
    return failed;
  }
}

/** Create and immediately run — used by the scheduler and by tests. */
export async function generateReport(input: CreateReportJobInput) {
  const job = await createReportJob(input);
  return runReportJob(job.id);
}

export async function processQueuedReports(limit = 10) {
  const db = await getDb();
  const queued = await db.select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.status, "queued")).orderBy(desc(schema.reports.createdAt)).limit(limit);
  const done = [];
  for (const q of queued) done.push(await runReportJob(q.id));
  return done;
}

export interface ReportFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

export async function getReportFile(reportId: string, now = new Date()): Promise<{ file: ReportFile | null; reason?: "not_found" | "not_ready" | "expired" }> {
  const db = await getDb();
  const [job] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
  if (!job) return { file: null, reason: "not_found" };
  if (job.status !== "ready" || !job.storageKey) return { file: null, reason: "not_ready" };
  if (job.expiresAt && job.expiresAt.getTime() < now.getTime()) return { file: null, reason: "expired" };
  const format = job.format as ReportFormat;
  const buffer = await storage().get(job.storageKey);
  return {
    file: {
      buffer,
      mimeType: MIME[format],
      sizeBytes: buffer.length,
      filename: `congo-voice-ai-os-${job.type}-${job.createdAt.toISOString().slice(0, 10)}.${EXT[format]}`,
    },
  };
}

/** Delete the stored object of every expired report and mark the row. */
export async function expireReports(now = new Date()) {
  const db = await getDb();
  const expired = await db
    .select()
    .from(schema.reports)
    .where(and(eq(schema.reports.status, "ready"), lt(schema.reports.expiresAt, now)));
  for (const r of expired) {
    if (r.storageKey) {
      try {
        await storage().delete(r.storageKey);
      } catch (err) {
        safeLog.warn("reports", `could not delete expired object for report ${r.id}`, err);
      }
    }
    await db.update(schema.reports).set({ status: "failed", storageKey: null, error: "expired" }).where(eq(schema.reports.id, r.id));
    await emitEvent({ type: "report.expired", aggregateType: "report", aggregateId: r.id, payload: { type: r.type } });
  }
  return expired.length;
}

/* ------------------------------------------------------------------------------------------
 * Scheduled report definitions
 * ---------------------------------------------------------------------------------------- */

const CADENCE_MS: Record<Cadence, number> = {
  daily: 24 * 3600 * 1000,
  weekly: 7 * 24 * 3600 * 1000,
  monthly: 30 * 24 * 3600 * 1000,
  quarterly: 91 * 24 * 3600 * 1000,
};

export function isDefinitionDue(cadence: Cadence, lastRunAt: Date | null, now = new Date()): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= CADENCE_MS[cadence];
}

/** Run every enabled definition whose cadence has elapsed, and notify its recipients. */
export async function runDueReportDefinitions(now = new Date()) {
  const db = await getDb();
  const definitions = await db.select().from(schema.reportDefinitions).where(eq(schema.reportDefinitions.enabled, true));
  const produced = [];
  for (const def of definitions) {
    if (!isDefinitionDue(def.cadence as Cadence, def.lastRunAt, now)) continue;
    const type = def.type as ReportType;
    if (!REPORT_CATALOGUE[type]) {
      safeLog.warn("reports", `definition ${def.id} references unknown report type`);
      continue;
    }
    const job = await generateReport({
      type,
      format: def.format as ReportFormat,
      scope: { ...(def.scope ?? {}), ...(def.organisationId ? { organisationId: def.organisationId } : {}) },
      requestedBy: def.createdBy,
      definitionId: def.id,
      purpose: `Rapport programmé : ${def.name}`,
    });
    await db.update(schema.reportDefinitions).set({ lastRunAt: now }).where(eq(schema.reportDefinitions.id, def.id));
    for (const recipient of def.recipients ?? []) {
      await notifyTemplate({
        key: "report.ready",
        userId: recipient,
        type: "report",
        channel: "in_app",
        vars: { reportName: def.name, period: REPORT_CATALOGUE[type].cadence, expiresAt: job?.expiresAt?.toISOString().slice(0, 10) ?? "—" },
        payload: { reportId: job?.id, definitionId: def.id },
      });
    }
    produced.push(job);
  }
  return produced;
}

/** Reports a user may see: their own, plus those produced by definitions they receive. */
export async function listReports(filter: { requestedBy?: string; type?: string; status?: string; limit?: number } = {}) {
  const db = await getDb();
  return db
    .select()
    .from(schema.reports)
    .where(
      and(
        filter.requestedBy ? eq(schema.reports.requestedBy, filter.requestedBy) : undefined,
        filter.type ? eq(schema.reports.type, filter.type) : undefined,
        filter.status ? eq(schema.reports.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(schema.reports.createdAt))
    .limit(filter.limit ?? 50);
}
