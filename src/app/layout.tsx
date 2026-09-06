import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { LanguageProvider } from "@client/components/shell/LanguageProvider";
import { ServiceWorker } from "@client/components/shell/ServiceWorker";
import { isLanguageCode, LANG_COOKIE } from "@shared/i18n";
import type { LanguageCode } from "@shared/types";
import { getSession } from "@server/core/auth";
import { SITE } from "@shared/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.shortDescription}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: "/manifest.webmanifest",
  keywords: ["inclusion numérique", "santé communautaire", "agriculture", "éducation", "lingala", "kikongo", "kiswahili", "tshiluba", "RDC", "IA vocale", "service public"],
  authors: [{ name: SITE.operator }],
  publisher: SITE.operator,
  category: "government",
  // One URL serves every language; the citizen's choice is carried by the session, not the path.
  alternates: { canonical: "/", languages: { "fr-CD": "/" } },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "fr_CD",
    title: `${SITE.name} — ${SITE.shortDescription}`,
    description: SITE.description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.shortDescription },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }], apple: "/icons/icon-512.svg" },
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport: Viewport = { themeColor: "#0b1220", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await getSession();
  const cookieLang = store.get(LANG_COOKIE)?.value;
  const lang: LanguageCode = isLanguageCode(cookieLang) ? cookieLang : (session?.language ?? "fr");

  return (
    <html lang={lang} className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg">
          Aller au contenu
        </a>
        <LanguageProvider initial={lang}>
          {children}
          <ServiceWorker />
        </LanguageProvider>
      </body>
    </html>
  );
}
