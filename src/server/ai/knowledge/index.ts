/**
 * Knowledge base (RAG) — curated, versioned, approved documents per module.
 * Source files live in content/kb/<module>/<docId>.md with a front-matter header
 * (docId, module, title, authority, source, version, language, geography, evidenceGrade,
 * approvedBy, effectiveFrom, reviewDate, supersedes). They are loaded into kb_documents /
 * kb_chunks and searched with PostgreSQL full-text search (French) with a keyword fallback.
 *
 * Every health and agriculture recommendation must cite at least one docId or protocol id.
 */
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode, ModuleType } from "@server/db/schema";

export interface KnowledgeHit {
  docId: string;
  chunkId: string;
  title: string;
  authority: string;
  version: string;
  text: string;
  score: number;
}

export interface KbFrontMatter {
  docId: string;
  module: ModuleType;
  title: string;
  authority: string;
  source?: string;
  version?: string;
  language?: LanguageCode;
  geography?: string;
  evidenceGrade?: string;
  approvedBy?: string;
  effectiveFrom?: string;
  reviewDate?: string;
  supersedes?: string;
}

export function parseFrontMatter(raw: string): { meta: KbFrontMatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("Knowledge document is missing front matter");
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!meta.docId || !meta.module || !meta.title || !meta.authority) throw new Error(`Knowledge document ${meta.docId ?? "?"} lacks required fields`);
  return { meta: meta as unknown as KbFrontMatter, body: m[2].trim() };
}

/** Split on blank lines, merge to ~700-character chunks. */
export function chunkText(body: string, target = 700): string[] {
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paras) {
    if ((current + "\n\n" + p).length > target && current) {
      chunks.push(current);
      current = p;
    } else current = current ? current + "\n\n" + p : p;
  }
  if (current) chunks.push(current);
  return chunks;
}

const contentRoot = () => path.resolve(process.cwd(), "content", "kb");

/** Load or refresh all documents under content/kb. Idempotent (checksum-based). */
export async function loadKnowledgeFromContent(): Promise<{ loaded: number; skipped: number }> {
  const db = await getDb();
  let loaded = 0;
  let skipped = 0;
  const root = contentRoot();
  let modules: string[] = [];
  try {
    modules = await fs.readdir(root);
  } catch {
    return { loaded, skipped };
  }
  for (const moduleDir of modules) {
    const dir = path.join(root, moduleDir);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    for (const file of await fs.readdir(dir)) {
      if (!file.endsWith(".md")) continue;
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const { meta, body } = parseFrontMatter(raw);
      const checksum = createHash("sha256").update(raw).digest("hex");
      const [existing] = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.docId, meta.docId));
      if (existing?.checksum === checksum) {
        skipped++;
        continue;
      }
      if (existing) await db.delete(schema.kbDocuments).where(eq(schema.kbDocuments.id, existing.id));
      const [doc] = await db
        .insert(schema.kbDocuments)
        .values({
          docId: meta.docId,
          module: meta.module,
          title: meta.title,
          authority: meta.authority,
          source: meta.source,
          version: meta.version ?? "1.0",
          language: meta.language ?? "fr",
          geography: meta.geography ?? "RDC",
          evidenceGrade: meta.evidenceGrade ?? "B",
          approvedBy: meta.approvedBy,
          effectiveFrom: meta.effectiveFrom ? new Date(meta.effectiveFrom) : null,
          reviewDate: meta.reviewDate ? new Date(meta.reviewDate) : null,
          supersedes: meta.supersedes,
          status: "approved",
          checksum,
          body,
        })
        .returning();
      const chunks = chunkText(body);
      if (chunks.length) {
        await db.insert(schema.kbChunks).values(
          chunks.map((text, i) => ({ documentId: doc.id, docId: doc.docId, module: doc.module, chunkIndex: i, text, language: doc.language, checksum: createHash("sha256").update(text).digest("hex") })),
        );
      }
      loaded++;
    }
  }
  return { loaded, skipped };
}

let ensured: Promise<void> | undefined;
/** Lazy one-time load so retrieval works from a clean checkout. */
export function ensureKnowledgeLoaded(): Promise<void> {
  return (ensured ??= loadKnowledgeFromContent().then(() => undefined).catch((e) => {
    console.error("[knowledge] load failed", e);
  }));
}

const STOP = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "je", "mon", "ma", "mes", "pour", "que", "qui", "pas", "ne",
  "en", "au", "aux", "ce", "se", "sur", "dans", "est", "il", "elle", "avec", "son", "sa", "ses", "très", "plus", "nous",
  "vous", "ils", "elles", "leur", "leurs", "cette", "ces", "être", "avoir", "fait", "faire", "chez", "par", "quand",
  "comme", "mais", "donc", "alors", "aussi", "bien", "tout", "tous", "toute", "toutes", "depuis", "sans", "peut",
]);

/** Accent-insensitive form used by the keyword fallback. */
function fold(word: string): string {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function terms(q: string): string[] {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return Array.from(new Set(words)).slice(0, 12);
}

export interface SearchOptions {
  /** Restrict the search to these document ids (protocol-linked retrieval). */
  docIds?: string[];
  /** Documents that should be ranked first when they match. */
  boostDocIds?: string[];
  /** At most one chunk per document, so k sources means k documents. */
  onePerDocument?: boolean;
}

/**
 * Retrieval: filters (module, approved status, optional document allow-list) are applied before
 * ranking; PostgreSQL French full-text search first, accent-folded keyword matching as fallback.
 * Boosted documents (those a protocol cites) float to the top so recommendations stay grounded.
 */
export async function searchKnowledge(module: ModuleType, query: string, k = 5, options: SearchOptions = {}): Promise<KnowledgeHit[]> {
  await ensureKnowledgeLoaded();
  const db = await getDb();
  const kws = terms(query);
  const allow = options.docIds?.length ? options.docIds : null;
  if (kws.length === 0 && !allow) return [];
  const base = [eq(schema.kbChunks.module, module), eq(schema.kbDocuments.status, "approved")];
  if (allow) base.push(inArray(schema.kbChunks.docId, allow));

  const columns = {
    docId: schema.kbChunks.docId,
    chunkId: schema.kbChunks.id,
    text: schema.kbChunks.text,
    title: schema.kbDocuments.title,
    authority: schema.kbDocuments.authority,
    version: schema.kbDocuments.version,
  };
  const overFetch = Math.max(k * 3, 10);

  let rows: Array<KnowledgeHit> = [];
  if (kws.length) {
    const tsQuery = kws.map((w) => w.replace(/'/g, "")).join(" | ");
    const rank = sql<number>`ts_rank(to_tsvector('french', ${schema.kbChunks.text}), to_tsquery('french', ${tsQuery}))`;
    try {
      rows = await db
        .select({ ...columns, score: rank })
        .from(schema.kbChunks)
        .innerJoin(schema.kbDocuments, eq(schema.kbChunks.documentId, schema.kbDocuments.id))
        .where(and(...base, sql`to_tsvector('french', ${schema.kbChunks.text}) @@ to_tsquery('french', ${tsQuery})`))
        .orderBy(desc(rank))
        .limit(overFetch);
    } catch (err) {
      console.warn("[knowledge] full-text search unavailable, using keyword fallback", err instanceof Error ? err.message : err);
      rows = [];
    }
  }

  if (rows.length === 0) {
    // Accent- and stem-insensitive matching in JavaScript: PGlite has no unaccent extension,
    // and the corpus of one module is small enough to score in memory.
    const folded = kws.map(fold).filter(Boolean);
    const candidates = await db
      .select(columns)
      .from(schema.kbChunks)
      .innerJoin(schema.kbDocuments, eq(schema.kbChunks.documentId, schema.kbDocuments.id))
      .where(and(...base))
      .limit(600);
    rows = candidates
      .map((r) => {
        const haystack = fold(r.text.toLowerCase());
        const score = folded.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
        return { ...r, score };
      })
      .filter((r) => (folded.length ? r.score > 0 : true))
      .sort((a, b) => b.score - a.score)
      .slice(0, overFetch);
  }

  const boost = new Set(options.boostDocIds ?? []);
  let hits = rows
    .map((r) => ({ ...r, score: Number(r.score) + (boost.has(r.docId) ? 100 : 0) }))
    .sort((a, b) => b.score - a.score);
  if (options.onePerDocument !== false) {
    const seen = new Set<string>();
    hits = hits.filter((h) => (seen.has(h.docId) ? false : (seen.add(h.docId), true)));
  }
  return hits.slice(0, k);
}

/** Loads whole documents by citation key — used to prove a citation exists (AI-13). */
export async function knowledgeDocuments(docIds: string[]): Promise<Array<{ docId: string; title: string; authority: string; version: string; status: string; module: ModuleType }>> {
  if (!docIds.length) return [];
  await ensureKnowledgeLoaded();
  const db = await getDb();
  const rows = await db
    .select({ docId: schema.kbDocuments.docId, title: schema.kbDocuments.title, authority: schema.kbDocuments.authority, version: schema.kbDocuments.version, status: schema.kbDocuments.status, module: schema.kbDocuments.module })
    .from(schema.kbDocuments)
    .where(inArray(schema.kbDocuments.docId, docIds));
  return rows;
}

/** Which of these document ids exist and are approved. */
export async function approvedDocIds(docIds: string[]): Promise<Set<string>> {
  const docs = await knowledgeDocuments(docIds);
  return new Set(docs.filter((d) => d.status === "approved").map((d) => d.docId));
}

/** Every approved document of a module, for the admin console. */
export async function listKnowledgeDocuments(module?: ModuleType) {
  await ensureKnowledgeLoaded();
  const db = await getDb();
  const rows = await db
    .select({
      docId: schema.kbDocuments.docId,
      module: schema.kbDocuments.module,
      title: schema.kbDocuments.title,
      authority: schema.kbDocuments.authority,
      source: schema.kbDocuments.source,
      version: schema.kbDocuments.version,
      language: schema.kbDocuments.language,
      geography: schema.kbDocuments.geography,
      evidenceGrade: schema.kbDocuments.evidenceGrade,
      status: schema.kbDocuments.status,
      approvedBy: schema.kbDocuments.approvedBy,
      effectiveFrom: schema.kbDocuments.effectiveFrom,
      reviewDate: schema.kbDocuments.reviewDate,
      createdAt: schema.kbDocuments.createdAt,
    })
    .from(schema.kbDocuments);
  const filtered = module ? rows.filter((r) => r.module === module) : rows;
  return filtered.sort((a, b) => a.docId.localeCompare(b.docId));
}

/** Forces a reload from content/kb on the next retrieval (admin action after editing files). */
export function invalidateKnowledgeCache() {
  ensured = undefined;
}

/** Prompt fragment with numbered, citable sources. */
export function knowledgePromptFragment(hits: KnowledgeHit[]): string {
  if (!hits.length) return "";
  return "<sources_approuvees>\n" + hits.map((h) => `[${h.docId}] (${h.authority}, v${h.version}) ${h.text}`).join("\n---\n") + "\n</sources_approuvees>\nCite les identifiants entre crochets utilisés dans le champ citations.";
}
