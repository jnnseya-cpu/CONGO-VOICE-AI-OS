import { desc } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@/lib/core/api";
import { schema } from "@/lib/db/client";
import { safeLog } from "@/lib/core/redact";
import { REPORT_CATALOGUE, REPORT_TYPES, createReportJob, runReportJob } from "@/lib/reports";

/**
 * Asynchronous report jobs.
 *
 * (The synchronous CSV extract stays at GET /api/v1/reports/[type]; job status lives here
 * because Next.js requires one dynamic segment name per path position.)
 */
export const GET = handle({ permission: "report:export" }, async ({ req, db }) => {
  const { limit, offset } = paging(req);
  const rows = await db.select().from(schema.reports).orderBy(desc(schema.reports.createdAt)).limit(limit).offset(offset);
  return {
    reports: rows,
    catalogue: REPORT_TYPES.map((t) => ({ type: t, name: REPORT_CATALOGUE[t].name, cadence: REPORT_CATALOGUE[t].cadence, defaultFormat: REPORT_CATALOGUE[t].defaultFormat, audience: REPORT_CATALOGUE[t].audience })),
  };
});

const Body = z.object({
  type: z.enum(REPORT_TYPES),
  format: z.enum(["pdf", "xlsx", "csv"]).optional(),
  scope: z.record(z.string(), z.unknown()).default({}),
  period: z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() }).optional(),
  purpose: z.string().max(120).optional(),
  /** Wait for the file instead of polling (small reports, scripts). */
  wait: z.boolean().default(false),
});

/** Queue a report. Returns 202 with the job id; poll GET /report-jobs/[id]. */
export const POST = handle({ permission: "report:export" }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const job = await createReportJob({
    type: body.type,
    format: body.format,
    scope: body.scope,
    period: body.period,
    requestedBy: user.userId,
    requestedByRole: user.role,
    purpose: body.purpose,
    ip,
  });
  if (body.wait) {
    const done = await runReportJob(job.id);
    return Response.json({ reportId: job.id, status: done?.status ?? "failed", report: done }, { status: 202 });
  }
  // Fire and forget: the scheduler also picks up anything still queued.
  void runReportJob(job.id).catch((err) => safeLog.error("report-jobs", "background run failed", err));
  return Response.json({ reportId: job.id, status: "queued", statusUrl: `/api/v1/report-jobs/${job.id}` }, { status: 202 });
});
