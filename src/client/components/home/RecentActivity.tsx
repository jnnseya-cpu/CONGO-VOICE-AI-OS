"use client";
import Link from "next/link";
import { useLanguage } from "../shell/LanguageProvider";
import { timeAgo } from "@shared/i18n/format";
import { Badge, Card, CardHeader, EmptyState } from "../ui";
import { IconBriefcase, IconGraduation, IconHeart, IconLeaf, IconMessage } from "../icons";

export interface ActivityItem {
  id: string;
  module: "health" | "agriculture" | "education" | "general";
  channel: string;
  title: string;
  who: string;
  province: string | null;
  escalated: boolean;
  createdAt: string;
}

const MOD = {
  health: { icon: <IconHeart size={18} />, cls: "bg-health-soft text-health", tone: "health" as const, label: "Santé" },
  agriculture: { icon: <IconLeaf size={18} />, cls: "bg-agri-soft text-agri", tone: "agri" as const, label: "Agriculture" },
  education: { icon: <IconGraduation size={18} />, cls: "bg-edu-soft text-edu", tone: "edu" as const, label: "Éducation" },
  general: { icon: <IconMessage size={18} />, cls: "bg-brand-soft text-brand", tone: "case" as const, label: "Accueil" },
};

export function RecentActivity({ items, now, href = "/tableau-de-bord#activite" }: { items: ActivityItem[]; now: number; href?: string }) {
  const { t, lang } = useLanguage();
  return (
    <Card className="p-0">
      <CardHeader title={t("recentActivity")} action={t("viewAll")} href={href} />
      <div className="px-3 pb-3 pt-2">
        {items.length === 0 && <EmptyState title="Pas encore d'activité" hint="Les échanges apparaîtront ici dès la première conversation." />}
        {items.map((a) => {
          const m = a.escalated ? { icon: <IconBriefcase size={18} />, cls: "bg-brand-soft text-brand", tone: "case" as const, label: "Cas & Suivi" } : MOD[a.module];
          return (
            <Link key={a.id} href={`/historique/${a.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
              <span className={`icon-tile h-9 w-9 ${m.cls}`}>{m.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{a.title}</div>
                <div className="truncate text-[11.5px] text-muted">
                  {t("by")} {a.who}
                  {a.province ? ` ${t("in")} ${a.province}` : ""}
                </div>
              </div>
              <Badge tone={m.tone}>{m.label}</Badge>
              <span className="w-[66px] shrink-0 text-right text-[11px] text-muted-2">{timeAgo(a.createdAt, lang, now)}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
