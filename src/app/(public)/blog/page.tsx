import type { Metadata } from "next";
import Link from "next/link";
import { allPosts, categories, clusters, tags, slugifyTerm } from "@server/blog/index";
import { SITE } from "@shared/site";
import { PageIntro, Section } from "@client/components/public/ui";
import { PostCard } from "@client/components/blog/ui";

export const metadata: Metadata = {
  title: "Blog — IA vocale, langues congolaises et services publics",
  description:
    "Recherche appliquée et retours de terrain sur l'IA vocale en langues congolaises : santé communautaire, agriculture, éducation, corpus linguistique et sécurité des systèmes.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml", "application/feed+json": "/blog/feed.json" } },
  openGraph: { title: "Blog — CONGO VOICE AI OS", description: "IA vocale en langues congolaises : santé, agriculture, éducation, corpus et sécurité.", url: "/blog", type: "website" },
};

export default async function BlogIndexPage() {
  const [posts, cats, allTags, groups] = await Promise.all([allPosts(), categories(), tags(), clusters()]);
  const [featured, ...rest] = posts;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `Blog — ${SITE.name}`,
    url: `${SITE.url}/blog`,
    inLanguage: "fr-CD",
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
    blogPost: posts.slice(0, 20).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      url: `${SITE.url}/blog/${p.slug}`,
      datePublished: p.publishedAt,
      dateModified: p.updatedAt,
      author: { "@type": "Person", name: p.author },
    })),
  };

  return (
    <>
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageIntro
        eyebrow="Blog du programme"
        title="Ce que l'on apprend en faisant parler un service public"
        lead="Recherche appliquée, décisions d'architecture et retours de terrain sur l'intelligence artificielle vocale en français, lingala, kikongo, kiswahili et tshiluba. Chaque article est signé, daté, relu et cite ses sources."
        meta={
          <>
            <span>{posts.length} articles</span>
            <span aria-hidden="true">·</span>
            <span>{groups.length} dossiers</span>
            <span aria-hidden="true">·</span>
            <a href="/blog/rss.xml" className="link">
              Flux RSS
            </a>
          </>
        }
      />

      {featured && (
        <Section tone="white" eyebrow="À la une">
          <div className="grid gap-4 lg:grid-cols-2">
            <PostCard post={featured} featured />
            <div className="grid gap-4">
              {rest.slice(0, 2).map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        </Section>
      )}

      {groups.map((g) => (
        <Section key={g.id} eyebrow="Dossier" title={g.pillar?.title ?? g.id} lead={g.pillar?.description} tone={g.id === groups[0]?.id ? "ground" : "white"}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.pillar && <PostCard post={g.pillar} />}
            {g.spokes.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </Section>
      ))}

      <Section eyebrow="Explorer" title="Par catégorie et par sujet">
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <Link key={c.slug} href={`/blog/categorie/${c.slug}`} className="chip border-line bg-white text-ink-2 hover:bg-brand-soft hover:text-brand">
              {c.name} <span className="text-muted-2">{c.count}</span>
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {allTags.map((t) => (
            <Link key={t.slug} href={`/blog/sujet/${t.slug}`} className="chip border-line bg-surface-2 text-muted hover:bg-brand-soft hover:text-brand">
              {t.name}
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
