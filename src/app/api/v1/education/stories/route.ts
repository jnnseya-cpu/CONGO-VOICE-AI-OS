import { desc, eq, and } from "drizzle-orm";
import { handle, paging } from "@server/core/api";
import { badRequest } from "@server/core/errors";
import { schema } from "@server/db/client";
import { ensureStories, storyMeta, storyWordCount } from "@server/db/reference/stories";

const LANGUAGES = ["fr", "ln", "kg", "sw", "lua"] as const;

/**
 * Read-aloud library (FR-ED-05): original stories written for the programme, two per
 * language, primary level. Public reference data. `?language=ln&id=…`
 */
export const GET = handle({ limit: "default" }, async ({ req, db }) => {
  await ensureStories();
  const q = req.nextUrl.searchParams;
  const language = q.get("language");
  if (language && !LANGUAGES.includes(language as (typeof LANGUAGES)[number])) throw badRequest(`Langue inconnue : ${language}`, { languages: LANGUAGES });
  const { limit, offset } = paging(req, { limit: 20, max: 100 });
  const id = q.get("id");

  const rows = await db
    .select()
    .from(schema.stories)
    .where(
      and(
        id ? eq(schema.stories.id, id) : undefined,
        language ? eq(schema.stories.language, language as (typeof LANGUAGES)[number]) : undefined,
        q.get("level") ? eq(schema.stories.level, q.get("level") as string) : undefined,
      ),
    )
    .orderBy(desc(schema.stories.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    stories: rows.map((s) => {
      const meta = storyMeta(s.title);
      return {
        id: s.id,
        language: s.language,
        title: s.title,
        level: s.level,
        licence: s.licence,
        words: storyWordCount(s.body),
        readingSeconds: Math.round(storyWordCount(s.body) / 2),
        focus: meta?.focus ?? null,
        comprehensionQuestions: meta?.comprehensionQuestions ?? [],
        body: s.body,
      };
    }),
    count: rows.length,
    notice: "Récits originaux écrits pour le programme national : libres de lecture, d'impression et d'enregistrement par les écoles.",
  };
});
