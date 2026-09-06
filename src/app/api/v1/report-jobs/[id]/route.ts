import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { REPORT_CATALOGUE, type ReportType } from "@server/reports";

/** Job status. When `status` is "ready", the file is at …/download until `expiresAt`. */
export const GET = handle<{ id: string }>({ permission: "report:export" }, async ({ db, params }) => {
  const [job] = await db.select().from(schema.reports).where(eq(schema.reports.id, params.id));
  if (!job) throw notFound();
  const meta = REPORT_CATALOGUE[job.type as ReportType];
  return {
    report: {
      id: job.id,
      type: job.type,
      name: meta?.name ?? job.type,
      format: job.format,
      status: job.status,
      scope: job.scope,
      period: job.period,
      sizeBytes: job.sizeBytes,
      error: job.error,
      purpose: job.purpose,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
      downloadUrl: job.status === "ready" ? `/api/v1/report-jobs/${job.id}/download` : null,
    },
  };
});
