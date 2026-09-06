"use client";
import Link from "next/link";
import { useLanguage } from "../shell/LanguageProvider";
import { IconShield } from "../icons";
import { SITE } from "@shared/site";

const LINKS = [
  { href: "/programme", label: "Le programme" },
  { href: "/acces", label: "Comment y accéder" },
  { href: "/urgence", label: "En cas d'urgence" },
  { href: "/aide", label: "Questions fréquentes" },
  { href: "/confidentialite", label: "Protection des données" },
  { href: "/accessibilite", label: "Accessibilité" },
  { href: "/contact", label: "Contact" },
];

/** Footer of the operating system. `year` comes from the server so hydration cannot differ. */
export function Footer({ year }: { year: number }) {
  const { t } = useLanguage();
  return (
    <footer className="card mt-4 flex flex-col gap-3 px-5 py-4 text-[12px] text-ink-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-health">
            <IconShield size={18} />
          </span>
          {t("footerPrivacy")}
        </div>
        <div className="text-muted">
          © {year} {SITE.name}. {t("rights")}
        </div>
      </div>
      <nav aria-label="Informations sur le programme" className="hairline flex flex-wrap gap-x-4 gap-y-1.5 pt-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-[12px] text-muted hover:text-brand hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
