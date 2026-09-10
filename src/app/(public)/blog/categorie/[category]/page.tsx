import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categories, postsByCategory } from "@server/blog/index";
import { PageIntro, Section } from "@client/components/public/ui";
import { Breadcrumbs, PostCard } from "@client/components/blog/ui";

export async function generateStaticParams() {
  return (await categories()).map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const posts = await postsByCategory(category);
  if (!posts.length) return { title: "Catégorie introuvable" };
  const name = posts[0].category;
  return {
    title: `${name} — articles du programme`,
    description: `Tous les articles publiés par CONGO VOICE AI OS dans la catégorie ${name} : recherche appliquée, décisions d'architecture et retours de terrain, signés et sourcés.`,
    alternates: { canonical: `/blog/categorie/${category}` },
    openGraph: { title: `${name} — CONGO VOICE AI OS`, description: `Articles de la catégorie ${name}.`, url: `/blog/categorie/${category}`, type: "website" },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const posts = await postsByCategory(category);
  if (!posts.length) notFound();
  const name = posts[0].category;
  return (
    <>
      <PageIntro eyebrow="Catégorie" title={name} lead={`${posts.length} article${posts.length > 1 ? "s" : ""} publié${posts.length > 1 ? "s" : ""} dans cette catégorie. Chaque article est signé, daté, relu et cite ses sources.`} />
      <Section tone="white">
        <Breadcrumbs trail={[{ href: "/", label: "Accueil" }, { href: "/blog", label: "Blog" }, { href: `/blog/categorie/${category}`, label: name }]} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      </Section>
    </>
  );
}
