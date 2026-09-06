import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { schema } from "@/lib/db/client";
import { monthlyConsumption } from "@/lib/core/metering";

/** Tenants with their live ACU consumption against their monthly cap. */
export const GET = handle({ permission: "admin:config" }, async ({ db }) => {
  const rows = await db.select().from(schema.tenants).orderBy(desc(schema.tenants.createdAt));
  const withUsage = [];
  for (const t of rows) {
    const usage = await monthlyConsumption(t.id);
    const [{ n }] = await db.select({ n: schema.organisations.id }).from(schema.organisations).where(eq(schema.organisations.tenantId, t.id)).limit(1).then((r) => (r.length ? [{ n: r.length }] : [{ n: 0 }]));
    withUsage.push({ ...t, usage, hasOrganisations: n > 0 });
  }
  return { tenants: withUsage };
});

const Body = z.object({
  name: z.string().min(2).max(160),
  type: z.enum(["national", "ministry", "ngo", "programme", "platform"]).default("programme"),
  legalName: z.string().max(240).optional(),
  acuMonthlyCap: z.number().positive().optional(),
  entitlements: z.array(z.enum(["health", "agriculture", "education"])).default(["health", "agriculture", "education"]),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const POST = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  const [row] = await db
    .insert(schema.tenants)
    .values({ ...body, legalName: body.legalName ?? null, acuMonthlyCap: body.acuMonthlyCap ?? null })
    .returning();
  await audit({ action: "admin.tenant_created", actorUserId: user.userId, actorRole: user.role, entityType: "tenant", entityId: row.id, after: { name: row.name, type: row.type, cap: row.acuMonthlyCap }, tenantId: row.id, ip });
  return { tenant: row };
});
