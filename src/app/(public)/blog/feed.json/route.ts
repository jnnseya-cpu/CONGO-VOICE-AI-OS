import { allPosts } from "@server/blog/index";
import { SITE } from "@shared/site";

export const dynamic = "force-static";
export const revalidate = 3600;

/** JSON Feed 1.1, with the full text so answer engines can quote the article accurately. */
export async function GET() {
  const posts = await allPosts();
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${SITE.name} — Blog`,
    home_page_url: `${SITE.url}/blog`,
    feed_url: `${SITE.url}/blog/feed.json`,
    description: "IA vocale en langues congolaises : santé communautaire, agriculture, éducation, corpus linguistique et sécurité des systèmes.",
    language: "fr-CD",
    authors: [{ name: SITE.operator, url: SITE.url }],
    items: posts.map((p) => ({
      id: `${SITE.url}/blog/${p.slug}`,
      url: `${SITE.url}/blog/${p.slug}`,
      title: p.title,
      summary: p.description,
      content_text: p.text,
      date_published: new Date(p.publishedAt).toISOString(),
      date_modified: new Date(p.updatedAt).toISOString(),
      authors: [{ name: p.author }],
      tags: [p.category, ...p.tags],
      language: p.lang === "en" ? "en" : "fr-CD",
      _cvos: { cluster: p.cluster, pillar: p.pillar, entities: p.entities, takeaways: p.takeaways, wordCount: p.wordCount },
    })),
  };
  return Response.json(feed, { headers: { "Cache-Control": "public, max-age=3600" } });
}
