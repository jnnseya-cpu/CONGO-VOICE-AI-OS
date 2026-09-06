import Link from "next/link";
import { PUBLIC_PAGES, SITE } from "@shared/site";
import { DrcFlag } from "../shell/Logo";
import { IconMic } from "../icons";

const NAV = PUBLIC_PAGES.filter((p) => p.group !== "legal");

/** Header of the public programme site. No client JavaScript: it must work on a 2G feature-phone browser. */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 bg-navy/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-5 py-3.5">
        <Link href="/programme" className="flex items-center gap-3" aria-label={`${SITE.name} — accueil du programme`}>
          <svg width="26" height="30" viewBox="0 0 30 34" aria-hidden="true">
            <rect x="0" y="12" width="4" height="10" rx="2" fill="#f59e0b" />
            <rect x="6.5" y="6" width="4" height="22" rx="2" fill="#22c55e" />
            <rect x="13" y="1" width="4" height="32" rx="2" fill="#3b82f6" />
            <rect x="19.5" y="8" width="4" height="18" rx="2" fill="#a855f7" />
            <rect x="26" y="13" width="4" height="8" rx="2" fill="#ef4444" />
          </svg>
          <span className="leading-none">
            <span className="block text-[15px] font-extrabold tracking-tight text-white">CONGO VOICE AI OS</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-white/60">Programme national d&apos;inclusion numérique</span>
          </span>
          <span className="hidden sm:block">
            <DrcFlag size={26} />
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/connexion" className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-white/80 hover:text-white sm:block">
            Espace institutionnel
          </Link>
          <Link href="/sante#parler" className="btn btn-primary h-10 px-4">
            <IconMic size={17} /> Parler maintenant
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10">
        <nav aria-label="Sections du programme" className="scrollbar-thin mx-auto flex max-w-[1120px] gap-1 overflow-x-auto px-4 py-1.5">
          {NAV.map((p) => (
            <Link key={p.href} href={p.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-medium text-white/75 hover:bg-white/10 hover:text-white">
              {p.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex h-[3px]" aria-hidden="true">
        <span className="flex-1 bg-[#007fff]" />
        <span className="flex-1 bg-[#f7d618]" />
        <span className="flex-1 bg-[#ce1021]" />
      </div>
    </header>
  );
}
