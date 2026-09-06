"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import type { Role, SessionUser } from "@shared/types";
import { LANGUAGES } from "@shared/types";
import type { UiKey } from "@shared/i18n";
import { useLanguage } from "./LanguageProvider";
import { Logo } from "./Logo";
import { IconBook, IconBriefcase, IconChart, IconChevronDown, IconGlobe, IconGraduation, IconGrid, IconHeart, IconHome, IconLanguage, IconLeaf, IconMessage, IconBell, IconSettings, IconShield, IconUser, IconX } from "../icons";

interface NavItem {
  href: string;
  key: UiKey;
  icon: ComponentType<{ size?: number }>;
  roles?: Role[];
  badge?: number;
}

const INSTITUTIONAL: Role[] = ["chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"];

const ROLE_LABEL: Record<Role, string> = {
  citizen: "Citoyen",
  chw: "Agent de santé communautaire",
  agri_officer: "Agent agricole",
  teacher: "Enseignant",
  ngo: "Partenaire ONG",
  gov_admin: "Administrateur",
  platform_admin: "Administrateur",
};

export function Sidebar({ user, unread, open, onClose }: { user: SessionUser | null; unread: number; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { t, lang, setLang } = useLanguage();
  const role = user?.role ?? "citizen";
  const items: NavItem[] = [
    { href: "/", key: "nav_home", icon: IconHome },
    { href: "/tableau-de-bord", key: "nav_dashboard", icon: IconGrid, roles: INSTITUTIONAL },
    { href: "/sante", key: "nav_health", icon: IconHeart },
    { href: "/agriculture", key: "nav_agri", icon: IconLeaf },
    { href: "/education", key: "nav_edu", icon: IconGraduation },
    { href: "/cas", key: "nav_cases", icon: IconBriefcase, roles: INSTITUTIONAL },
    { href: "/rapports", key: "nav_reports", icon: IconChart, roles: INSTITUTIONAL },
    { href: "/notifications", key: "nav_notifications", icon: IconBell, badge: unread },
    { href: "/messages", key: "nav_messages", icon: IconMessage },
    { href: "/ressources", key: "nav_resources", icon: IconBook },
    { href: "/langues", key: "nav_languages", icon: IconLanguage, roles: INSTITUTIONAL },
    { href: "/admin", key: "nav_admin", icon: IconShield, roles: ["platform_admin", "gov_admin"] },
    { href: "/parametres", key: "nav_settings", icon: IconSettings },
  ];
  const visible = items.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col bg-navy text-white transition-transform duration-200 lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Navigation principale"
      >
        <div className="flex items-start justify-between px-5 pt-5">
          <Link href="/" className="block" onClick={onClose}>
            <Logo />
          </Link>
          <button className="rounded-md p-1 text-white/70 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="Fermer">
            <IconX size={18} />
          </button>
        </div>
        <p className="px-5 pt-3 text-[12.5px] leading-snug text-white/70">{t("tagline")}</p>
        <div className="mx-5 mt-4 h-px bg-white/10" />

        <nav className="scrollbar-thin mt-3 flex-1 space-y-0.5 overflow-y-auto px-3">
          {visible.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={onClose} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                <Icon size={20} />
                <span className="flex-1">{t(item.key)}</span>
                {item.badge ? <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 px-4 pb-5 pt-3">
          <label className="relative block">
            <span className="sr-only">Langue</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/80">
              <IconGlobe size={18} />
            </span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as typeof lang)}
              className="w-full appearance-none rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-9 text-sm font-medium text-white outline-none hover:bg-white/10"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="text-ink">
                  {l.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70">
              <IconChevronDown size={16} />
            </span>
          </label>
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white ring-2 ring-white/10">
              <IconUser size={18} />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{user?.name ?? (user ? t("citizen") : "Visiteur")}</div>
              <div className="truncate text-[12px] text-white/60">{user ? ROLE_LABEL[user.role] : "Non connecté"}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
