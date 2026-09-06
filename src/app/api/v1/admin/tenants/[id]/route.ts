import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { isDegradedMode, monthlyConsumption } from "@server/core/metering";

export const GET = handle<{ id: string }>({ permission: "admin:config" }, async ({ db, params }) => {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, params.id));
  if (!tenant) throw notFound();
  const organisations = await db.select().from(schema.organisations).where(eq(schema.organisations.tenantId, tenant.id));
  return { tenant, organisations, usage: await monthlyConsumption(tenant.id), degradedMode: await isDegradedMode(tenant.id) };
});

const Patch = z.object({
  name: z.string().min(2).max(160).optional(),
  legalName: z.string().max(240).optional(),
  status: z.enum(["active", "suspended", "closed"]).optional(),
  acuMonthlyCap: z.number().positive().nullable().optional(),
  entitlements: z.array(z.enum(["health", "agriculture", "education"])).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = handle<{ id: string }>({ permission: "admin:config" }, async ({ db, user, params, json, ip }) => {
  const body = await json(Patch);
  const [before] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, params.id));
  if (!before) throw notFound();
  const [row] = await db.update(schema.tenants).set(body).where(eq(schema.tenants.id, params.id)).returning();
  await audit({ action: "admin.tenant_updated", actorUserId: user.userId, actorRole: user.role, entityType: "tenant", entityId: params.id, before: { status: before.status, cap: before.acuMonthlyCap }, after: { status: row.status, cap: row.acuMonthlyCap }, tenantId: params.id, ip });
  return { tenant: row };
});
