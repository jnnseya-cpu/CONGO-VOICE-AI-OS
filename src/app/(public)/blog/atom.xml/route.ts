import { allPosts } from "@server/blog/index";
import { SITE } from "@shared/site";

export const dynamic = "force-static";
export const revalidate = 3600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const posts = await allPosts();
  const entries = posts
    .map(
      (p) => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${SITE.url}/blog/${p.slug}" />
    <id>${SITE.url}/blog/${p.slug}</id>
    <updated>${new Date(p.updatedAt).toISOString()}</updated>
    <published>${new Date(p.publishedAt).toISOString()}</published>
    <author><name>${esc(p.author)}</name></author>
    <category term="${esc(p.category)}" />
    <summary>${esc(p.description)}</summary>
  </entry>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr-CD">
  <title>${esc(SITE.name)} — Blog</title>
  <link href="${SITE.url}/blog" />
  <link href="${SITE.url}/blog/atom.xml" rel="self" />
  <id>${SITE.url}/blog</id>
  <updated>${new Date(posts[0]?.updatedAt ?? Date.now()).toISOString()}</updated>
${entries}
</feed>`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
