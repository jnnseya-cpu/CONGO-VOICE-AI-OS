/**
 * Personalisation Agent — remembers language, place, repeated needs and recent context
 * so answers get more relevant over time without exposing anything sensitive.
 */
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode } from "@server/db/schema";

export interface ProfileContext {
  language: LanguageCode;
  province: string | null;
  topIntents: Array<{ intent: string; count: number }>;
  recentSummaries: string[];
  historyText: string | null;
}

export async function getProfileContext(userId: string | null | undefined): Promise<ProfileContext | null> {
  if (!userId) return null;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return null;
  const topIntents = await db
    .select({ intent: schema.interactions.intent, count: sql<number>`count(*)::int` })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId))
    .groupBy(schema.interactions.intent)
    .orderBy(desc(sql`count(*)`))
    .limit(3);
  const recent = await db
    .select({ summary: schema.interactions.summary })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId))
    .orderBy(desc(schema.interactions.createdAt))
    .limit(3);
  const recentSummaries = recent.map((r) => r.summary).filter((s): s is string => !!s);
  return {
    language: user.languagePreference,
    province: user.province,
    topIntents: topIntents.filter((t) => t.intent).map((t) => ({ intent: t.intent as string, count: t.count })),
    recentSummaries,
    historyText: recentSummaries.length ? `Échanges récents : ${recentSummaries.join(" | ")}` : null,
  };
}

export async function rememberLanguage(userId: string | null | undefined, language: LanguageCode, confidence: number) {
  if (!userId || confidence < 0.75) return;
  const db = await getDb();
  await db.update(schema.users).set({ languagePreference: language, lastActivityAt: new Date() }).where(eq(schema.users.id, userId));
}

export async function touchActivity(userId: string | null | undefined) {
  if (!userId) return;
  const db = await getDb();
  await db.update(schema.users).set({ lastActivityAt: new Date() }).where(eq(schema.users.id, userId));
}
