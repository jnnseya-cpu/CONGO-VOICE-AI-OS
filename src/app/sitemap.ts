import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE } from "@shared/site";

/** Public programme pages and the three citizen service entry points. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const services = [
    { href: "/", priority: 1 },
    { href: "/sante", priority: 0.9 },
    { href: "/agriculture", priority: 0.9 },
    { href: "/education", priority: 0.9 },
  ];
  const priority: Record<string, number> = { "/programme": 0.9, "/urgence": 0.9, "/acces": 0.9, "/aide": 0.8, "/services": 0.8 };
  return [
    ...services.map((s) => ({ url: `${SITE.url}${s.href}`, lastModified: now, changeFrequency: "daily" as const, priority: s.priority })),
    ...PUBLIC_PAGES.map((p) => ({
      url: `${SITE.url}${p.href}`,
      lastModified: now,
      changeFrequency: (p.group === "legal" ? "yearly" : "monthly") as "yearly" | "monthly",
      priority: priority[p.href] ?? 0.6,
    })),
  ];
}
