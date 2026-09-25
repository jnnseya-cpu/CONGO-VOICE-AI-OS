import type { MetadataRoute } from "next";
import { SITE } from "@shared/site";

/**
 * Rendered per request rather than at build time.
 *
 * These two files are the only place the platform writes its own origin into a
 * document nobody re-reads. Generated statically, they take whatever
 * NEXT_PUBLIC_SITE_URL happened to be set to on the build machine — which is
 * how a service ends up serving a sitemap that points at a domain it is not on,
 * and nobody notices until the pages stop being indexed.
 */
export const dynamic = "force-dynamic";

/**
 * The public programme site is indexable. Everything that holds citizen conversations,
 * cases or institutional data is not, whether or not it is also protected by a session.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/cas", "/tableau-de-bord", "/historique", "/messages", "/notifications", "/parametres", "/rapports", "/recherche", "/langues", "/ressources", "/connexion"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
