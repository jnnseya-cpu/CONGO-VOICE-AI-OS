import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AppShell } from "@client/components/shell/AppShell";
import { LanguageProvider } from "@client/components/shell/LanguageProvider";
import { ServiceWorker } from "@client/components/shell/ServiceWorker";
import { isLanguageCode, LANG_COOKIE } from "@shared/i18n";
import type { LanguageCode, SessionUser } from "@shared/types";
import { getSession } from "@/lib/core/auth";
import { unreadNotificationCount } from "@/lib/core/unread";

export const metadata: Metadata = {
  title: { default: "CONGO VOICE AI OS", template: "%s · CONGO VOICE AI OS" },
  description: "Plateforme Nationale d'Inclusion Numérique Vocale en Santé, Agriculture et Éducation — République Démocratique du Congo.",
  manifest: "/manifest.webmanifest",
  applicationName: "CONGO VOICE AI OS",
};

export const viewport: Viewport = { themeColor: "#0b1220", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await getSession();
  const cookieLang = store.get(LANG_COOKIE)?.value;
  const lang: LanguageCode = isLanguageCode(cookieLang) ? cookieLang : (session?.language ?? "fr");
  const user: SessionUser | null = session ? { id: session.userId, name: session.name ?? null, role: session.role, language: session.language, province: session.province ?? null, anonymous: session.anonymous } : null;
  const unread = session ? await unreadNotificationCount(session.userId) : 0;

  return (
    <html lang={lang} className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        <LanguageProvider initial={lang}>
          <AppShell user={user} unread={unread}>
            {children}
          </AppShell>
          <ServiceWorker />
        </LanguageProvider>
      </body>
    </html>
  );
}
