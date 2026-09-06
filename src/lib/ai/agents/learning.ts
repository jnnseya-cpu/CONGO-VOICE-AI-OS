/**
 * Language Learning Agent — makes the platform better at listening, understanding and
 * speaking each national language over time.
 *
 *  1. Every conversation is captured as a corpus sample (heard text, French meaning, audio).
 *  2. Citizens flag misunderstandings; native-speaking officers verify or correct samples and
 *     enrich a lexicon of local terms (with pronunciation hints).
 *  3. Verified samples and lexicon entries are retrieved at inference time and injected into
 *     the Language Agent prompt (in-context learning) so accuracy improves immediately.
 *  4. Verified audio/transcript pairs are exportable as datasets to fine-tune speech models.
 *  5. Per-language proficiency (listening / understanding / speaking) is measured continuously.
 */
import "server-only";
import { and, count, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { LanguageCode, ModuleType } from "@/lib/db/schema";
import { audit } from "@/lib/core/audit";


const STOPWORDS = new Set(["le", "la", "les", "de", "des", "du", "un", "une", "et", "je", "tu", "il", "elle", "nous", "vous", "ils", "est", "a", "na", "ya", "ma", "mon", "mes", "pour", "que", "qui", "pas", "ne", "en", "au", "aux", "ce", "ça", "se", "sur", "dans", "the"]);

function keywords(text: string, max = 6): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s']/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ).slice(0, max);
}

/** Record what the system heard and understood. Called for every interaction. */
export async function recordSample(input: {
  interactionId: string;
  audioFileId?: string | null;
  language: LanguageCode;
  sourceText: string;
  translationFr: string | null;
  province?: string | null;
  intent?: string | null;
  module: ModuleType;
  confidence: number;
}) {
  if (!input.sourceText.trim()) return null;
  const db = await getDb();
  const [row] = await db
    .insert(schema.languageCorpus)
    .values({
      interactionId: input.interactionId,
      audioFileId: input.audioFileId ?? null,
      language: input.language,
      sourceText: input.sourceText,
      translationFr: input.translationFr,
      province: input.province ?? null,
      intent: input.intent ?? null,
      module: input.module,
      systemConfidence: input.confidence,
      // Low-confidence samples go straight to the review queue.
      reviewStatus: "pending",
    })
    .returning();
  return row;
}

export interface LearningContext {
  examples: Array<{ source: string; fr: string; language: LanguageCode }>;
  lexicon: Array<{ term: string; meaningFr: string; language: LanguageCode }>;
}

/**
 * Retrieve verified examples and lexicon entries relevant to a new message.
 * Ranking: keyword overlap first, then recency. Cheap enough to run on every request.
 */
export async function retrieveLearningContext(text: string, preferred?: LanguageCode | null, limit = 6): Promise<LearningContext> {
  const db = await getDb();
  const kws = keywords(text);
  const verified = inArray(schema.languageCorpus.reviewStatus, ["verified", "corrected"]);
  const langFilter = preferred ? eq(schema.languageCorpus.language, preferred) : undefined;
  const kwFilter = kws.length ? or(...kws.map((k) => sql`${schema.languageCorpus.sourceText} ILIKE ${"%" + k + "%"}`)) : undefined;

  let rows = await db
    .select()
    .from(schema.languageCorpus)
    .where(and(verified, langFilter, kwFilter))
    .orderBy(desc(schema.languageCorpus.reviewedAt))
    .limit(limit);
  if (rows.length < 3) {
    const more = await db.select().from(schema.languageCorpus).where(and(verified, langFilter)).orderBy(desc(schema.languageCorpus.reviewedAt)).limit(limit - rows.length);
    const seen = new Set(rows.map((r) => r.id));
    rows = [...rows, ...more.filter((m) => !seen.has(m.id))];
  }
  const examples = rows.map((r) => ({
    source: r.correctedSourceText ?? r.sourceText,
    fr: r.correctedTranslationFr ?? r.translationFr ?? "",
    language: r.correctedLanguage ?? r.language,
  })).filter((e) => e.fr);

  const lexRows = await db
    .select()
    .from(schema.languageLexicon)
    .where(and(eq(schema.languageLexicon.verified, true), preferred ? eq(schema.languageLexicon.language, preferred) : undefined, kws.length ? or(...kws.map((k) => sql`${schema.languageLexicon.term} ILIKE ${"%" + k + "%"}`)) : undefined))
    .orderBy(desc(schema.languageLexicon.usageCount))
    .limit(12);
  if (lexRows.length) {
    await db.update(schema.languageLexicon).set({ usageCount: sql`${schema.languageLexicon.usageCount} + 1` }).where(inArray(schema.languageLexicon.id, lexRows.map((l) => l.id)));
  }
  return { examples, lexicon: lexRows.map((l) => ({ term: l.term, meaningFr: l.meaningFr, language: l.language })) };
}

/** Prompt fragment built from the learning context (empty string when nothing is known yet). */
export function learningPromptFragment(ctx: LearningContext, target?: LanguageCode | null): string {
  const parts: string[] = [];
  const ex = ctx.examples.filter((e) => !target || e.language === target).slice(0, 6);
  if (ex.length) parts.push("<exemples_verifies>\n" + ex.map((e) => `[${e.language}] ${e.source}\n[fr] ${e.fr}`).join("\n---\n") + "\n</exemples_verifies>");
  const lx = ctx.lexicon.filter((l) => !target || l.language === target).slice(0, 12);
  if (lx.length) parts.push("<lexique_local>\n" + lx.map((l) => `[${l.language}] ${l.term} = ${l.meaningFr}`).join("\n") + "\n</lexique_local>");
  return parts.join("\n");
}

/** Citizen feedback: "the system did not understand me" or a rating of the spoken answer. */
export async function flagSample(interactionId: string, input: { misunderstood?: boolean; speechRating?: number }) {
  const db = await getDb();
  await db
    .update(schema.languageCorpus)
    .set({
      ...(input.misunderstood ? { citizenFlagged: true, reviewStatus: "pending" } : {}),
      ...(input.speechRating ? { speechRating: input.speechRating } : {}),
    })
    .where(eq(schema.languageCorpus.interactionId, interactionId));
}

/** Native-speaker review of a sample. */
export async function reviewSample(
  id: string,
  reviewer: { userId: string; role: string },
  decision: { status: "verified" | "corrected" | "rejected"; correctedSourceText?: string; correctedTranslationFr?: string; correctedLanguage?: LanguageCode; lexicon?: Array<{ term: string; meaningFr: string; pronunciation?: string }> },
) {
  const db = await getDb();
  const [before] = await db.select().from(schema.languageCorpus).where(eq(schema.languageCorpus.id, id));
  if (!before) return null;
  const [after] = await db
    .update(schema.languageCorpus)
    .set({
      reviewStatus: decision.status,
      correctedSourceText: decision.correctedSourceText ?? null,
      correctedTranslationFr: decision.correctedTranslationFr ?? null,
      correctedLanguage: decision.correctedLanguage ?? null,
      reviewedBy: reviewer.userId,
      reviewedAt: new Date(),
    })
    .where(eq(schema.languageCorpus.id, id))
    .returning();
  for (const l of decision.lexicon ?? []) {
    if (!l.term.trim() || !l.meaningFr.trim()) continue;
    await db.insert(schema.languageLexicon).values({ language: decision.correctedLanguage ?? before.language, term: l.term.trim(), meaningFr: l.meaningFr.trim(), domain: before.module, region: before.province, pronunciation: l.pronunciation, verified: true, addedBy: reviewer.userId });
  }
  await audit({ action: "language.sample_reviewed", actorUserId: reviewer.userId, actorRole: reviewer.role, entityType: "language_corpus", entityId: id, before: { status: before.reviewStatus }, after: { status: decision.status, corrected: !!decision.correctedSourceText } });
  return after;
}

export interface LanguageProficiency {
  language: LanguageCode;
  samples: number;
  verified: number;
  corrected: number;
  flagged: number;
  lexicon: number;
  avgConfidence: number;
  /** 0-100 estimates. */
  listening: number;
  understanding: number;
  speaking: number;
  level: "débutant" | "intermédiaire" | "avancé" | "natif";
}

/** Continuous measurement of how well the platform handles each language. */
export async function languageProficiency(): Promise<LanguageProficiency[]> {
  const db = await getDb();
  const month = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const stats = await db
    .select({
      language: schema.languageCorpus.language,
      samples: count(),
      verified: sql<number>`sum(case when ${schema.languageCorpus.reviewStatus} = 'verified' then 1 else 0 end)::int`,
      corrected: sql<number>`sum(case when ${schema.languageCorpus.reviewStatus} = 'corrected' then 1 else 0 end)::int`,
      flagged: sql<number>`sum(case when ${schema.languageCorpus.citizenFlagged} then 1 else 0 end)::int`,
      avgConfidence: sql<number>`coalesce(avg(${schema.languageCorpus.systemConfidence}),0)::float`,
      avgSpeech: sql<number>`coalesce(avg(${schema.languageCorpus.speechRating}),0)::float`,
      rated: sql<number>`count(${schema.languageCorpus.speechRating})::int`,
    })
    .from(schema.languageCorpus)
    .where(gte(schema.languageCorpus.createdAt, month))
    .groupBy(schema.languageCorpus.language);
  const lex = await db.select({ language: schema.languageLexicon.language, n: count() }).from(schema.languageLexicon).where(eq(schema.languageLexicon.verified, true)).groupBy(schema.languageLexicon.language);

  const all: LanguageCode[] = ["fr", "ln", "kg", "sw", "lua"];
  return all.map((language) => {
    const s = stats.find((x) => x.language === language);
    const samples = s?.samples ?? 0;
    const verified = s?.verified ?? 0;
    const corrected = s?.corrected ?? 0;
    const flagged = s?.flagged ?? 0;
    const reviewed = verified + corrected;
    const lexicon = lex.find((l) => l.language === language)?.n ?? 0;
    const avgConfidence = s?.avgConfidence ?? 0;
    // Listening: share of reviewed samples that needed no transcript correction, blended with confidence.
    const listening = Math.round(100 * (reviewed ? 0.7 * (verified / reviewed) + 0.3 * avgConfidence : avgConfidence * 0.8));
    // Understanding: verified share minus citizen misunderstanding flags.
    const understanding = Math.round(100 * Math.max(0, (reviewed ? verified / reviewed : avgConfidence) - (samples ? flagged / samples : 0)));
    // Speaking: citizen ratings of the spoken answer (5 = native-like); unrated languages inherit a conservative baseline.
    const speaking = s?.rated ? Math.round((s.avgSpeech / 5) * 100) : language === "fr" ? 70 : 40;
    const overall = (listening + understanding + speaking) / 3;
    const level = overall >= 90 && reviewed >= 200 ? "natif" : overall >= 75 && reviewed >= 50 ? "avancé" : overall >= 55 ? "intermédiaire" : "débutant";
    return { language, samples, verified, corrected, flagged, lexicon, avgConfidence: Number(avgConfidence.toFixed(2)), listening, understanding, speaking, level };
  });
}

/** JSONL dataset of verified audio/transcript pairs for speech-model fine-tuning. */
export async function exportDataset(language?: LanguageCode) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.languageCorpus)
    .where(and(inArray(schema.languageCorpus.reviewStatus, ["verified", "corrected"]), language ? eq(schema.languageCorpus.language, language) : undefined))
    .orderBy(desc(schema.languageCorpus.reviewedAt));
  return rows
    .map((r) =>
      JSON.stringify({
        id: r.id,
        language: r.correctedLanguage ?? r.language,
        audio: r.audioFileId ? `/api/v1/files/${r.audioFileId}` : null,
        text: r.correctedSourceText ?? r.sourceText,
        translation_fr: r.correctedTranslationFr ?? r.translationFr,
        province: r.province,
        intent: r.intent,
        module: r.module,
      }),
    )
    .join("\n");
}

export async function pendingSamples(language?: LanguageCode, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(schema.languageCorpus)
    .where(and(eq(schema.languageCorpus.reviewStatus, "pending"), language ? eq(schema.languageCorpus.language, language) : undefined))
    .orderBy(desc(schema.languageCorpus.citizenFlagged), schema.languageCorpus.systemConfidence, desc(schema.languageCorpus.createdAt))
    .limit(limit);
}
