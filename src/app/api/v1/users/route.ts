import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@server/core/api";
import { hashPin } from "@server/core/auth";
import { isWeakPin } from "@server/core/lockout";
import { audit } from "@server/core/audit";
import { badRequest } from "@server/core/errors";
import { schema } from "@server/db/client";
import { publicUser } from "@server/core/users";

export const GET = handle({ permission: "user:manage" }, async ({ db, req, user, ip }) => {
  const { limit, offset } = paging(req);
  const role = req.nextUrl.searchParams.get("role");
  const rows = await db
    .select()
    .from(schema.users)
    .where(role ? eq(schema.users.role, role as typeof schema.users.$inferSelect.role) : undefined)
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)
    .offset(offset);
  // This response carries phone numbers. Reading the directory is itself an
  // event worth keeping: it is the cheapest way to exfiltrate citizen contacts.
  await audit({ action: "user.directory_read", actorUserId: user.userId, actorRole: user.role, after: { count: rows.length, role: role ?? "all" }, ip });
  return { users: rows.map((u) => ({ ...publicUser(u), phone: u.phone, createdAt: u.createdAt, lastActivityAt: u.lastActivityAt })) };
});

const Create = z.object({
  phone: z.string().min(6).max(32),
  pin: z.string().min(4).max(12),
  name: z.string().max(160).optional(),
  role: z.enum(["citizen", "chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"]).default("citizen"),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).default("fr"),
  province: z.string().max(120).optional(),
  territory: z.string().max(120).optional(),
  organisation: z.string().max(160).optional(),
});

export const POST = handle({ permission: "user:manage" }, async ({ db, user, json, ip }) => {
  const body = await json(Create);
  if (isWeakPin(body.pin)) throw badRequest("Ce code PIN est trop courant. Choisissez-en un autre.");
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, body.phone));
  if (exists) throw badRequest("Ce numéro est déjà enregistré");
  const [created] = await db
    .insert(schema.users)
    .values({ phone: body.phone, pinHash: hashPin(body.pin), name: body.name, role: body.role, languagePreference: body.language, province: body.province, territory: body.territory, organisation: body.organisation, consentStatus: "granted" })
    .returning();
  await audit({ action: "user.created", actorUserId: user.userId, actorRole: user.role, entityType: "user", entityId: created.id, after: { role: created.role, province: created.province }, ip });
  return { user: publicUser(created) };
});
