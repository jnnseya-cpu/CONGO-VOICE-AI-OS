"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@shared/types";
import { useLanguage } from "./LanguageProvider";
import { IconBell, IconLogout, IconMenu, IconMic, IconSearch, IconUser } from "../icons";

export function Topbar({ user, unread, onMenu, healthy = true }: { user: SessionUser | null; unread: number; onMenu: () => void; healthy?: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="topbar sticky top-0 z-20 flex h-[68px] items-center gap-4 border-b border-line bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Menu">
        <IconMenu size={22} />
      </button>
      <button onClick={onMenu} className="hidden rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:block" aria-label="Menu">
        <IconMenu size={22} />
      </button>
      <h1 className="truncate text-[15px] font-semibold text-ink sm:text-[16.5px]">{t("welcome")}</h1>
      <div className="ml-auto hidden items-center gap-2 text-[13px] font-medium text-ink-2 md:flex">
        <span className={healthy ? "live-dot" : "h-2 w-2 rounded-full bg-warn"} />
        {healthy ? t("systemOk") : "Service dégradé"}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/recherche?q=${encodeURIComponent(q.trim())}`);
        }}
        className="relative hidden w-[240px] md:block lg:w-[280px]"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="h-10 w-full rounded-full border border-line bg-white pl-4 pr-10 text-sm outline-none placeholder:text-muted-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-soft" />
        <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:text-ink" aria-label={t("search")}>
          <IconSearch size={18} />
        </button>
      </form>
      <Link href="/sante#parler" className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-brand shadow-sm hover:bg-brand-soft" aria-label={t("speakNow")}>
        <IconMic size={20} />
      </Link>
      <Link href="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:bg-surface-2" aria-label={t("nav_notifications")}>
        <IconBell size={20} />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-danger px-1.5 py-0.5 text-center text-[11px] font-bold text-white ring-2 ring-white">{unread}</span>}
      </Link>
      <div className="relative">
        <button onClick={() => setMenu((m) => !m)} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink-2 shadow-sm hover:bg-surface-2" aria-label="Compte" aria-expanded={menu}>
          <IconUser size={20} />
        </button>
        {menu && (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-lg" onMouseLeave={() => setMenu(false)}>
            <div className="border-b border-line px-4 py-3">
              <div className="text-sm font-semibold">{user?.name ?? (user ? t("citizen") : "Visiteur")}</div>
              <div className="text-xs text-muted">{user?.province ?? "—"}</div>
            </div>
            <Link href="/parametres" className="block px-4 py-2.5 text-sm hover:bg-surface-2" onClick={() => setMenu(false)}>
              {t("nav_settings")}
            </Link>
            {user ? (
              <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-surface-2">
                <IconLogout size={16} /> {t("logout")}
              </button>
            ) : (
              <Link href="/connexion" className="block px-4 py-2.5 text-sm font-semibold text-brand hover:bg-surface-2" onClick={() => setMenu(false)}>
                {t("login")}
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
