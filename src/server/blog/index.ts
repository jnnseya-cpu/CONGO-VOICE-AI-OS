import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { SITE } from "@shared/site";
import { buildLinkIndex, injectLinks } from "./links";
import { checksum, collectLinks, parseFrontMatter, renderMarkdown, stripTags, wordCount } from "./parse";
import type { Post, PostFrontMatter } from "./types";

const DIR = () => path.resolve(process.cwd(), "content", "blog");
const READING_WPM = 210;

const cache = globalThis as unknown as { __cvosPosts?: Promise<Post[]> };

async function build(): Promise<Post[]> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(DIR())).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const raws: Array<{ meta: PostFrontMatter; body: string; raw: string }> = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(DIR(), file), "utf8");
    const { meta, body } = parseFrontMatter(raw, file);
    if (meta.slug !== file.replace(/\.md$/, "")) throw new Error(`${file}: slug "${meta.slug}" does not match the file name`);
    raws.push({ meta, body, raw });
  }
  const index = buildLinkIndex(raws.map((r) => r.meta));

  const posts = raws.map(({ meta, body, raw }) => {
    const { html, headings } = renderMarkdown(body);
    const linked = injectLinks(html, index, { selfHref: `/blog/${meta.slug}` });
    const text = stripTags(linked.html);
    const words = wordCount(text);
    return {
      ...meta,
      html: linked.html,
      text,
      markdown: body,
      headings,
      links: collectLinks(linked.html),
      wordCount: words,
      readingMinutes: Math.max(1, Math.round(words / READING_WPM)),
      checksum: checksum(raw),
    } satisfies Post;
  });

  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function allPosts(): Promise<Post[]> {
  if (process.env.NODE_ENV === "production") return (cache.__cvosPosts ??= build());
  return build();
}

export async function getPost(slug: string): Promise<Post | null> {
  return (await allPosts()).find((p) => p.slug === slug) ?? null;
}

export async function postsByCategory(category: string): Promise<Post[]> {
  return (await allPosts()).filter((p) => slugifyTerm(p.category) === slugifyTerm(category));
}

export async function postsByTag(tag: string): Promise<Post[]> {
  return (await allPosts()).filter((p) => p.tags.some((t) => slugifyTerm(t) === slugifyTerm(tag)));
}

export async function categories(): Promise<Array<{ name: string; slug: string; count: number }>> {
  const map = new Map<string, { name: string; count: number }>();
  for (const p of await allPosts()) {
    const key = slugifyTerm(p.category);
    map.set(key, { name: p.category, count: (map.get(key)?.count ?? 0) + 1 });
  }
  return [...map.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.count - a.count);
}

export async function tags(): Promise<Array<{ name: string; slug: string; count: number }>> {
  const map = new Map<string, { name: string; count: number }>();
  for (const p of await allPosts()) {
    for (const t of p.tags) {
      const key = slugifyTerm(t);
      map.set(key, { name: t, count: (map.get(key)?.count ?? 0) + 1 });
    }
  }
  return [...map.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface Cluster {
  id: string;
  pillar: Post | null;
  spokes: Post[];
}

export async function clusters(): Promise<Cluster[]> {
  const posts = await allPosts();
  const ids = [...new Set(posts.map((p) => p.cluster))];
  return ids
    .map((id) => {
      const inCluster = posts.filter((p) => p.cluster === id);
      return { id, pillar: inCluster.find((p) => p.pillar) ?? null, spokes: inCluster.filter((p) => !p.pillar) };
    })
    .sort((a, b) => b.spokes.length - a.spokes.length);
}

/** Explicit `related` slugs first, then the closest posts by cluster, entities and keywords. */
export async function relatedPosts(post: Post, limit = 4): Promise<Post[]> {
  const posts = (await allPosts()).filter((p) => p.slug !== post.slug);
  const explicit = post.related.map((s) => posts.find((p) => p.slug === s)).filter((p): p is Post => !!p);
  const scored = posts
    .filter((p) => !explicit.includes(p))
    .map((p) => {
      let score = 0;
      if (p.cluster === post.cluster) score += 5;
      if (p.category === post.category) score += 1;
      score += overlap(p.entities, post.entities) * 2;
      score += overlap(p.keywords, post.keywords);
      score += overlap(p.tags, post.tags);
      if (p.lang === post.lang) score += 1;
      return { p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.p.publishedAt.localeCompare(a.p.publishedAt))
    .map((s) => s.p);
  return [...explicit, ...scored].slice(0, limit);
}

/** Previous and next post inside the same cluster, for sequential reading. */
export async function clusterNeighbours(post: Post): Promise<{ prev: Post | null; next: Post | null }> {
  const inCluster = (await allPosts()).filter((p) => p.cluster === post.cluster).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const i = inCluster.findIndex((p) => p.slug === post.slug);
  return { prev: i > 0 ? inCluster[i - 1] : null, next: i >= 0 && i < inCluster.length - 1 ? inCluster[i + 1] : null };
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => set.has(x.toLowerCase())).length;
}

export function slugifyTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function postUrl(slug: string): string {
  return `${SITE.url}/blog/${slug}`;
}

export type { Post } from "./types";
