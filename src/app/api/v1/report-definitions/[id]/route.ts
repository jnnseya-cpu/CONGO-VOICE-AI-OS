import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { notFound } from "@/lib/core/errors";
import { schema } from "@/lib/db/client";
import { generateReport, type ReportFormat, type ReportType } from "@/lib/reports";

const Patch = z.object({
  name: z.string().min(2).max(160).optional(),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  format: z.enum(["pdf", "xlsx", "csv"]).optional(),
  scope: z.record(z.string(), z.unknown()).optional(),
  recipients: z.array(z.string().uuid()).max(50).optional(),
  enabled: z.boolean().optional(),
  /** Produce it now, without waiting for the cadence. */
  runNow: z.boolean().optional(),
});

export const PATCH = handle<{ id: string }>({ permission: "report:export" }, async ({ db, user, params, json, ip }) => {
  const body = await json(Patch);
  const [before] = await db.select().from(schema.reportDefinitions).where(eq(schema.reportDefinitions.id, params.id));
  if (!before) throw notFound();
  const { runNow, ...patch } = body;
  const [row] = Object.keys(patch).length
    ? await db.update(schema.reportDefinitions).set(patch).where(eq(schema.reportDefinitions.id, params.id)).returning()
    : [before];
  let job = null;
  if (runNow) {
    job = await generateReport({
      type: row.type as ReportType,
      format: row.format as ReportFormat,
      scope: { ...(row.scope ?? {}), ...(row.organisationId ? { organisationId: row.organisationId } : {}) },
      requestedBy: user.userId,
      requestedByRole: user.role,
      definitionId: row.id,
      purpose: `Rapport programmé : ${row.name}`,
      ip,
    });
    await db.update(schema.reportDefinitions).set({ lastRunAt: new Date() }).where(eq(schema.reportDefinitions.id, params.id));
  }
  await audit({ action: "report.definition_updated", actorUserId: user.userId, actorRole: user.role, entityType: "report_definition", entityId: params.id, before: { cadence: before.cadence, enabled: before.enabled }, after: { cadence: row.cadence, enabled: row.enabled, runNow: Boolean(runNow) }, ip });
  return { definition: row, report: job };
});

/** Disabled, not deleted: past reports must remain attributable to their definition. */
export const DELETE = handle<{ id: string }>({ permission: "report:export" }, async ({ db, user, params, ip }) => {
  const [row] = await db.update(schema.reportDefinitions).set({ enabled: false }).where(eq(schema.reportDefinitions.id, params.id)).returning();
  if (!row) throw notFound();
  await audit({ action: "report.definition_disabled", actorUserId: user.userId, actorRole: user.role, entityType: "report_definition", entityId: params.id, ip });
  return { definition: row };
});
