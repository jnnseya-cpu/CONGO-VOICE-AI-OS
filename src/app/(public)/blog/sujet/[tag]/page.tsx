import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { postsByTag, tags } from "@server/blog/index";
import { PageIntro, Section } from "@client/components/public/ui";
import { Breadcrumbs, PostCard } from "@client/components/blog/ui";

export async function generateStaticParams() {
  return (await tags()).map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const posts = await postsByTag(tag);
  if (!posts.length) return { title: "Sujet introuvable" };
  const all = await tags();
  const name = all.find((t) => t.slug === tag)?.name ?? tag;
  return {
    title: `${name} — tous les articles`,
    description: `Articles de CONGO VOICE AI OS sur ${name} : ce que le programme a mesuré, décidé et publié sur ce sujet, avec ses sources et ses limites.`,
    alternates: { canonical: `/blog/sujet/${tag}` },
    openGraph: { title: `${name} — CONGO VOICE AI OS`, description: `Articles sur ${name}.`, url: `/blog/sujet/${tag}`, type: "website" },
  };
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const posts = await postsByTag(tag);
  if (!posts.length) notFound();
  const all = await tags();
  const name = all.find((t) => t.slug === tag)?.name ?? tag;
  return (
    <>
      <PageIntro eyebrow="Sujet" title={name} lead={`${posts.length} article${posts.length > 1 ? "s" : ""} traite${posts.length > 1 ? "nt" : ""} ce sujet.`} />
      <Section tone="white">
        <Breadcrumbs trail={[{ href: "/", label: "Accueil" }, { href: "/blog", label: "Blog" }, { href: `/blog/sujet/${tag}`, label: name }]} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </Section>
    </>
  );
}
