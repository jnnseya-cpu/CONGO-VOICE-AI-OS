import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@/lib/core/api";
import { schema } from "@/lib/db/client";
import { audit } from "@/lib/core/audit";
import type { LanguageCode } from "@/lib/db/schema";

export const GET = handle({ permission: "language:review" }, async ({ req, db }) => {
  const { limit, offset } = paging(req);
  const language = req.nextUrl.searchParams.get("language") as LanguageCode | null;
  return { lexicon: await db.select().from(schema.languageLexicon).where(and(language ? eq(schema.languageLexicon.language, language) : undefined)).orderBy(desc(schema.languageLexicon.usageCount), desc(schema.languageLexicon.createdAt)).limit(limit).offset(offset) };
});

const Body = z.object({
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]),
  term: z.string().min(1).max(160),
  meaningFr: z.string().min(1).max(240),
  domain: z.enum(["health", "agriculture", "education", "general"]).default("general"),
  region: z.string().max(120).optional(),
  pronunciation: z.string().max(160).optional(),
});

export const POST = handle({ permission: "language:review" }, async ({ db, user, json }) => {
  const body = await json(Body);
  const [row] = await db.insert(schema.languageLexicon).values({ ...body, verified: true, addedBy: user.userId }).returning();
  await audit({ action: "language.lexicon_added", actorUserId: user.userId, actorRole: user.role, entityType: "lexicon", entityId: row.id, after: { language: body.language, term: body.term } });
  return { entry: row };
});
