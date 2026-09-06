import type { MetadataRoute } from "next";
import { SITE } from "@shared/site";

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
