import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";

/** Organisations: the operational units cases are routed to. `?tenantId=…&type=…` */
export const GET = handle({ permission: "admin:config" }, async ({ req, db }) => {
  const q = req.nextUrl.searchParams;
  const rows = await db
    .select()
    .from(schema.organisations)
    .where(and(q.get("tenantId") ? eq(schema.organisations.tenantId, q.get("tenantId") as string) : undefined, q.get("type") ? eq(schema.organisations.type, q.get("type") as string) : undefined))
    .orderBy(desc(schema.organisations.createdAt));
  return { organisations: rows };
});

const Body = z.object({
  tenantId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  name: z.string().min(2).max(160),
  type: z.enum(["ministry", "provincial_division", "ngo", "school_cluster", "call_centre", "extension_service", "clinic_network", "platform"]),
  provinceScope: z.array(z.string().max(120)).default([]),
  territoryScope: z.array(z.string().max(120)).default([]),
  routingSkills: z.array(z.string().max(48)).default([]),
});

export const POST = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  const [row] = await db.insert(schema.organisations).values({ ...body, parentId: body.parentId ?? null }).returning();
  await audit({ action: "admin.organisation_created", actorUserId: user.userId, actorRole: user.role, entityType: "organisation", entityId: row.id, after: { name: row.name, type: row.type, provinceScope: row.provinceScope }, tenantId: body.tenantId, ip });
  return { organisation: row };
});
