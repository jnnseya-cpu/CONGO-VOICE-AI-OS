import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allPosts, clusterNeighbours, getPost, relatedPosts, slugifyTerm } from "@server/blog/index";
import { SITE } from "@shared/site";
import { ArticleMeta, Breadcrumbs, FaqSection, Prose, RelatedPosts, Sources, TagList, Takeaways, Toc, Panel, formatDate } from "@client/components/blog/ui";
import { IconArrowRight } from "@client/components/icons";

export async function generateStaticParams() {
  return (await allPosts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Article introuvable" };
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    authors: [{ name: post.author }],
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      images: [{ url: `${url}/image.png`, width: 1200, height: 630, alt: post.imageAlt || post.title }],
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      tags: post.tags,
      locale: post.lang === "en" ? "en_GB" : "fr_CD",
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [`${url}/image.png`] },
    other: { "article:section": post.category },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const [related, neighbours] = await Promise.all([relatedPosts(post), clusterNeighbours(post)]);
  const url = `${SITE.url}/blog/${post.slug}`;

  const graph: Record<string, unknown>[] = [
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      headline: post.title,
      description: post.description,
      inLanguage: post.lang === "en" ? "en" : "fr-CD",
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      wordCount: post.wordCount,
      keywords: post.keywords.join(", "),
      articleSection: post.category,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: { "@type": "ImageObject", url: `${url}/image.png`, width: 1200, height: 630, caption: post.imageAlt },
      author: { "@type": "Person", name: post.author, jobTitle: post.authorRole, worksFor: { "@type": "Organization", name: SITE.operator } },
      publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
      ...(post.reviewer ? { reviewedBy: { "@type": "Person", name: post.reviewer, jobTitle: post.reviewerRole } } : {}),
      isAccessibleForFree: true,
      speakable: { "@type": "SpeakableSpecification", cssSelector: ["[data-speakable]"] },
      citation: post.sources.map((s) => ({ "@type": "CreativeWork", name: s.label, url: s.url })),
      about: post.entities.map((e) => ({ "@type": "Thing", name: e })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: SITE.url },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE.url}/blog` },
        { "@type": "ListItem", position: 3, name: post.category, item: `${SITE.url}/blog/categorie/${slugifyTerm(post.category)}` },
        { "@type": "ListItem", position: 4, name: post.title, item: url },
      ],
    },
  ];
  if (post.faq.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: post.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }

  return (
    <>
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }} />

      <div className="mx-auto max-w-[1120px] px-5 py-10 sm:py-14">
        <Breadcrumbs
          trail={[
            { href: "/", label: "Accueil" },
            { href: "/blog", label: "Blog" },
            { href: `/blog/categorie/${slugifyTerm(post.category)}`, label: post.category },
            { href: `/blog/${post.slug}`, label: post.title },
          ]}
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_268px]">
          <article>
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/blog/categorie/${slugifyTerm(post.category)}`} className="tag tag-case hover:underline">
                  {post.category}
                </Link>
                {post.pillar && <span className="tag tag-muted">Dossier de référence</span>}
                <time className="text-[12.5px] text-muted" dateTime={post.publishedAt}>
                  Publié le {formatDate(post.publishedAt)}
                </time>
              </div>
              <h1 className="mt-4 max-w-[24ch] text-balance font-serif text-[32px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink sm:text-[42px]">{post.title}</h1>
              <p data-speakable="true" className="mt-5 max-w-[62ch] font-serif text-[19px] leading-[1.6] text-ink-2">
                {post.description}
              </p>
              <ArticleMeta post={post} />
            </header>

            <Takeaways items={post.takeaways} />
            <Prose html={post.html} />

            <FaqSection faq={post.faq} />
            <Sources sources={post.sources} />
            <TagList tags={post.tags} />

            {(neighbours.prev || neighbours.next) && (
              <nav aria-label="Suite du dossier" className="mt-10 grid gap-3 sm:grid-cols-2">
                {neighbours.prev && (
                  <Link href={`/blog/${neighbours.prev.slug}`} className="card card-hover p-4">
                    <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Précédent</span>
                    <span className="mt-1 block text-[14.5px] font-semibold text-ink">{neighbours.prev.title}</span>
                  </Link>
                )}
                {neighbours.next && (
                  <Link href={`/blog/${neighbours.next.slug}`} className="card card-hover p-4 sm:text-right">
                    <span className="text-[11.5px] font-bold uppercase tracking-wide text-muted">Suivant</span>
                    <span className="mt-1 block text-[14.5px] font-semibold text-ink">{neighbours.next.title}</span>
                  </Link>
                )}
              </nav>
            )}

            <RelatedPosts posts={related} />
          </article>

          <aside className="space-y-4 lg:sticky lg:top-[132px] lg:self-start">
            <Toc headings={post.headings} />
            <Panel title="Le service">
              <p className="text-[13px] leading-relaxed text-ink-2">
                {SITE.name} permet d&apos;obtenir une orientation en santé, un conseil agricole et un appui scolaire en parlant dans sa langue, depuis n&apos;importe quel téléphone. Gratuit pour le citoyen.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/sante#parler" className="btn btn-primary h-10">
                  Poser une question <IconArrowRight size={15} />
                </Link>
                <Link href="/programme" className="btn btn-ghost h-10">
                  Découvrir le programme
                </Link>
              </div>
            </Panel>
            <Panel title="Rester informé">
              <p className="text-[13px] leading-relaxed text-ink-2">Les nouveaux articles sont publiés dans les flux ouverts du programme.</p>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                <li>
                  <a href="/blog/rss.xml" className="link">
                    Flux RSS
                  </a>
                </li>
                <li>
                  <a href="/blog/feed.json" className="link">
                    Flux JSON
                  </a>
                </li>
                <li>
                  <a href="/llms.txt" className="link">
                    Index pour moteurs de réponse
                  </a>
                </li>
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </>
  );
}
