import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE } from "@shared/site";
import { allPosts, categories, tags } from "@server/blog/index";

/** Public programme pages, the citizen service entry points and every blog page. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const services = [
    { href: "/", priority: 1 },
    { href: "/sante", priority: 0.9 },
    { href: "/agriculture", priority: 0.9 },
    { href: "/education", priority: 0.9 },
  ];
  const priority: Record<string, number> = { "/programme": 0.9, "/urgence": 0.9, "/acces": 0.9, "/aide": 0.8, "/services": 0.8 };
  const [posts, cats, allTags] = await Promise.all([allPosts(), categories(), tags()]);
  return [
    ...services.map((s) => ({ url: `${SITE.url}${s.href}`, lastModified: now, changeFrequency: "daily" as const, priority: s.priority })),
    ...PUBLIC_PAGES.map((p) => ({
      url: `${SITE.url}${p.href}`,
      lastModified: now,
      changeFrequency: (p.group === "legal" ? "yearly" : "monthly") as "yearly" | "monthly",
      priority: priority[p.href] ?? 0.6,
    })),
    ...posts.map((p) => ({
      url: `${SITE.url}/blog/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "monthly" as const,
      priority: p.pillar ? 0.9 : 0.7,
    })),
    ...cats.map((c) => ({ url: `${SITE.url}/blog/categorie/${c.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...allTags.map((t) => ({ url: `${SITE.url}/blog/sujet/${t.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.4 })),
  ];
}
