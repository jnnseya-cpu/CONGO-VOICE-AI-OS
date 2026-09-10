import "server-only";
import { createHash } from "node:crypto";
import { marked } from "marked";
import type { Heading, PostFrontMatter, PostLinkRef } from "./types";

const REQUIRED: Array<keyof PostFrontMatter> = ["slug", "title", "description", "lang", "category", "cluster", "publishedAt", "updatedAt", "author", "authorRole"];

/**
 * Front matter is a small, explicit subset of YAML: `key: value`, `key: [a, b]`,
 * and block lists of `- item` or `- q: … / a: …` pairs. Keeping the parser in the
 * repository avoids a dependency that would run over untrusted content at build time.
 */
export function parseFrontMatter(raw: string, file: string): { meta: PostFrontMatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${file}: missing front matter`);
  const lines = match[1].split(/\r?\n/);
  const data: Record<string, unknown> = {};
  let key: string | null = null;
  let list: Array<unknown> | null = null;
  let pair: Record<string, string> | null = null;

  const flush = () => {
    if (key && list) {
      if (pair && Object.keys(pair).length) list.push(pair);
      data[key] = list;
    }
    list = null;
    pair = null;
  };

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) {
      list ??= [];
      const inner = item[1].trim();
      const kv = inner.match(/^([a-zA-Z]+):\s*(.*)$/);
      if (kv) {
        if (pair && kv[1] in pair) {
          list.push(pair);
          pair = null;
        }
        pair ??= {};
        pair[kv[1]] = unquote(kv[2]);
      } else {
        if (pair && Object.keys(pair).length) {
          list.push(pair);
          pair = null;
        }
        list.push(unquote(inner));
      }
      continue;
    }
    const kv = line.match(/^([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    flush();
    key = kv[1];
    const value = kv[2].trim();
    if (value === "") continue;
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      key = null;
    } else if (value === "true" || value === "false") {
      data[key] = value === "true";
      key = null;
    } else {
      data[key] = unquote(value);
      key = null;
    }
  }
  flush();

  for (const field of REQUIRED) {
    if (!data[field]) throw new Error(`${file}: front matter is missing "${field}"`);
  }
  const raw2 = data as unknown as Partial<PostFrontMatter>;
  const meta: PostFrontMatter = {
    ...(raw2 as PostFrontMatter),
    pillar: raw2.pillar ?? false,
    keywords: raw2.keywords ?? [],
    entities: raw2.entities ?? [],
    tags: raw2.tags ?? [],
    takeaways: raw2.takeaways ?? [],
    faq: raw2.faq ?? [],
    sources: raw2.sources ?? [],
    related: raw2.related ?? [],
    imageAlt: raw2.imageAlt ?? "",
  };
  return { meta, body: match[2].trim() };
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70);
}

/** Markdown to HTML with stable heading ids, so the table of contents and deep links agree. */
export function renderMarkdown(markdown: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const seen = new Set<string>();
  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, depth }) {
    const plain = stripTags(marked.parseInline(text, { async: false }) as string);
    let id = slugifyHeading(plain);
    let n = 2;
    while (seen.has(id)) id = `${slugifyHeading(plain)}-${n++}`;
    seen.add(id);
    headings.push({ level: depth, text: plain, id });
    const inner = marked.parseInline(text, { async: false }) as string;
    return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
  };
  const html = marked.parse(markdown, { async: false, renderer, gfm: true, breaks: false }) as string;
  return { html, headings };
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collectLinks(html: string): PostLinkRef[] {
  const links: PostLinkRef[] = [];
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    links.push({ href: m[1], text: stripTags(m[2]), external: /^https?:\/\//i.test(m[1]) });
  }
  return links;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length > 0).length;
}

export function checksum(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
