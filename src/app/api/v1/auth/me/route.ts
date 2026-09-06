import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { schema } from "@/lib/db/client";
import { notFound } from "@/lib/core/errors";
import { audit } from "@/lib/core/audit";
import { publicUser } from "@/lib/core/users";

export const GET = handle({ auth: true }, async ({ db, user }) => {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId));
  if (!u) throw notFound();
  return { user: publicUser(u) };
});

const Patch = z.object({
  name: z.string().max(160).optional(),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  province: z.string().max(120).optional(),
  territory: z.string().max(120).optional(),
  consent: z.boolean().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = handle({ auth: true }, async ({ db, user, json }) => {
  const body = await json(Patch);
  const [before] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId));
  if (!before) throw notFound();
  const [after] = await db
    .update(schema.users)
    .set({
      name: body.name ?? before.name,
      languagePreference: body.language ?? before.languagePreference,
      province: body.province ?? before.province,
      territory: body.territory ?? before.territory,
      consentStatus: body.consent === undefined ? before.consentStatus : body.consent ? "granted" : "declined",
      preferences: body.preferences ?? before.preferences,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.userId))
    .returning();
  await audit({ action: "user.profile_updated", actorUserId: user.userId, actorRole: user.role, entityType: "user", entityId: user.userId, before: publicUser(before), after: publicUser(after) });
  return { user: publicUser(after) };
});
