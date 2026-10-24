import { PublicHeader } from "@client/components/public/PublicHeader";
import { PublicFooter } from "@client/components/public/PublicFooter";
import { SITE } from "@shared/site";
import { jsonLdScript } from "@shared/jsonld";

/**
 * Chrome for the public programme site: no session, no sidebar, indexable.
 * A serif face is loaded here only, so the operating system itself stays on one font.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}#website`,
    name: SITE.name,
    url: SITE.url,
    inLanguage: ["fr-CD", "ln", "kg", "sw", "lua"],
    publisher: { "@type": "Organization", name: SITE.operator },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE.url}/recherche?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: SITE.name,
    alternateName: SITE.shortDescription,
    description: SITE.description,
    serviceType: "Information santé, agriculture et éducation par la voix",
    areaServed: { "@type": "Country", name: SITE.country },
    availableLanguage: SITE.languages.map((l) => l.label),
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: SITE.operator },
    audience: { "@type": "Audience", audienceType: "Population rurale et péri-urbaine" },
    url: SITE.url,
  };
  return (
    <>
      {/* Self-hosted font, served from /public so it survives offline and makes no third-party request.
          Next would have us import the CSS, which would inline it into the bundle for every route. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/fonts/source-serif.css" />
      <div className="flex min-h-screen flex-col bg-bg">
        <PublicHeader />
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <PublicFooter year={new Date().getUTCFullYear()} />
      </div>
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdScript(website) }} />
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
    </>
  );
}
