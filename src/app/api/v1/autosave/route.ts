import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { schema } from "@/lib/db/client";

const Body = z.object({
  clientKey: z.string().min(1).max(120),
  module: z.enum(["health", "agriculture", "education", "general"]).default("general"),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  payload: z.record(z.string(), z.unknown()),
});

/** Upsert a draft (text typed, recording state, selections…). Called continuously by the client. */
export const PUT = handle({ permission: "autosave:write", limit: "none" }, async ({ db, user, json }) => {
  const body = await json(Body);
  const [existing] = await db.select().from(schema.autosaveDrafts).where(and(eq(schema.autosaveDrafts.userId, user.userId), eq(schema.autosaveDrafts.clientKey, body.clientKey)));
  if (existing) {
    const [row] = await db.update(schema.autosaveDrafts).set({ payload: body.payload, module: body.module, language: body.language ?? existing.language, version: existing.version + 1, updatedAt: new Date() }).where(eq(schema.autosaveDrafts.id, existing.id)).returning();
    return { draft: row };
  }
  const [row] = await db.insert(schema.autosaveDrafts).values({ userId: user.userId, clientKey: body.clientKey, module: body.module, language: body.language, payload: body.payload }).returning();
  return { draft: row };
});

export const GET = handle({ permission: "autosave:write", limit: "none" }, async ({ req, db, user }) => {
  const key = req.nextUrl.searchParams.get("clientKey");
  const rows = await db.select().from(schema.autosaveDrafts).where(and(eq(schema.autosaveDrafts.userId, user.userId), key ? eq(schema.autosaveDrafts.clientKey, key) : undefined)).orderBy(desc(schema.autosaveDrafts.updatedAt)).limit(20);
  return { drafts: rows };
});
