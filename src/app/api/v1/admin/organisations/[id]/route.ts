import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { notFound } from "@server/core/errors";
import { schema } from "@server/db/client";

export const GET = handle<{ id: string }>({ permission: "admin:config" }, async ({ db, params }) => {
  const [organisation] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, params.id));
  if (!organisation) throw notFound();
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, onDuty: schema.users.onDuty, territories: schema.users.territories })
    .from(schema.users)
    .where(eq(schema.users.organisationId, params.id));
  return { organisation, members };
});

const Patch = z.object({
  name: z.string().min(2).max(160).optional(),
  provinceScope: z.array(z.string().max(120)).optional(),
  territoryScope: z.array(z.string().max(120)).optional(),
  routingSkills: z.array(z.string().max(48)).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const PATCH = handle<{ id: string }>({ permission: "admin:config" }, async ({ db, user, params, json, ip }) => {
  const body = await json(Patch);
  const [before] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, params.id));
  if (!before) throw notFound();
  const [row] = await db.update(schema.organisations).set(body).where(eq(schema.organisations.id, params.id)).returning();
  await audit({ action: "admin.organisation_updated", actorUserId: user.userId, actorRole: user.role, entityType: "organisation", entityId: params.id, before: { name: before.name, territoryScope: before.territoryScope }, after: { name: row.name, territoryScope: row.territoryScope }, tenantId: row.tenantId, ip });
  return { organisation: row };
});
