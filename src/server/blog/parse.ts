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
    // Indented continuation of the current list item: `  - q: …` then `    a: …`.
    const cont = line.match(/^\s+([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/);
    if (cont && key && list !== null && pair) {
      pair[cont[1]] = unquote(cont[2]);
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "\u2026",
  laquo: "\u00ab",
  raquo: "\u00bb",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  ndash: "\u2013",
  mdash: "\u2014",
  eacute: "\u00e9",
  egrave: "\u00e8",
  agrave: "\u00e0",
  ccedil: "\u00e7",
  ocirc: "\u00f4",
  ecirc: "\u00ea",
  icirc: "\u00ee",
  ugrave: "\u00f9",
};

/**
 * Decodes the entities `marked` emits. Numeric entities matter for measurement:
 * an apostrophe is escaped to `&#39;`, so a target query containing one would
 * never match the rendered text if entities were merely dropped.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? " ";
  });
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
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
