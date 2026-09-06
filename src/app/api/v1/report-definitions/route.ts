import { desc } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";
import { REPORT_TYPES } from "@server/reports";

/** Scheduled report definitions: what is produced, how often, for which scope and whom. */
export const GET = handle({ permission: "report:export" }, async ({ db }) => ({
  definitions: await db.select().from(schema.reportDefinitions).orderBy(desc(schema.reportDefinitions.createdAt)),
}));

const Body = z.object({
  name: z.string().min(2).max(160),
  type: z.enum(REPORT_TYPES),
  format: z.enum(["pdf", "xlsx", "csv"]).default("pdf"),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("weekly"),
  scope: z.record(z.string(), z.unknown()).default({}),
  organisationId: z.string().uuid().optional(),
  recipients: z.array(z.string().uuid()).max(50).default([]),
  enabled: z.boolean().default(true),
});

export const POST = handle({ permission: "report:export" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  const [row] = await db
    .insert(schema.reportDefinitions)
    .values({ ...body, organisationId: body.organisationId ?? null, createdBy: user.userId })
    .returning();
  await audit({ action: "report.definition_created", actorUserId: user.userId, actorRole: user.role, entityType: "report_definition", entityId: row.id, after: { name: row.name, type: row.type, cadence: row.cadence, recipients: row.recipients.length }, ip });
  return { definition: row };
});
