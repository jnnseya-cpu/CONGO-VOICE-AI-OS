"use client";
import Link from "next/link";
import { useLanguage } from "../shell/LanguageProvider";
import { IconArrowRight, IconGraduation, IconHeart, IconLeaf } from "../icons";
import { formatNumber } from "@shared/i18n/format";

export interface ModuleStats {
  health: { today: number; urgent: number };
  agriculture: { today: number; alerts: number };
  education: { today: number; topics: number };
}

export function ModuleCards({ stats }: { stats: ModuleStats }) {
  const { t, lang } = useLanguage();
  const cards = [
    { href: "/sante", title: t("healthOs"), desc: t("healthDesc"), icon: <IconHeart size={26} />, tile: "bg-health-soft text-health", titleColor: "text-health", button: "bg-[#166534] hover:bg-[#14532d]", a: [formatNumber(stats.health.today, lang), t("interactionsToday")], b: [formatNumber(stats.health.urgent, lang), t("urgentCases")] },
    { href: "/agriculture", title: t("agriOs"), desc: t("agriDesc"), icon: <IconLeaf size={26} />, tile: "bg-agri-soft text-agri", titleColor: "text-agri", button: "bg-[#16a34a] hover:bg-[#15803d]", a: [formatNumber(stats.agriculture.today, lang), t("interactionsToday")], b: [formatNumber(stats.agriculture.alerts, lang), t("agriAlerts")] },
    { href: "/education", title: t("eduOs"), desc: t("eduDesc"), icon: <IconGraduation size={26} />, tile: "bg-edu-soft text-edu", titleColor: "text-edu", button: "bg-[#7c3aed] hover:bg-[#6d28d9]", a: [formatNumber(stats.education.today, lang), t("sessionsToday")], b: [formatNumber(stats.education.topics, lang), t("topicsRequested")] },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((c) => (
        <article key={c.href} className="card card-hover flex flex-col p-4">
          <div className="flex gap-3">
            <span className={`icon-tile h-14 w-14 rounded-2xl ${c.tile}`}>{c.icon}</span>
            <div className="min-w-0">
              <h3 className={`text-[17px] font-bold ${c.titleColor}`}>{c.title}</h3>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{c.desc}</p>
            </div>
          </div>
          <div className="hairline mt-4 grid grid-cols-2 pt-3">
            <div className="pr-3">
              <div className={`text-[21px] font-bold ${c.titleColor}`}>{c.a[0]}</div>
              <div className="text-[11.5px] text-muted">{c.a[1]}</div>
            </div>
            <div className="border-l border-line pl-4">
              <div className={`text-[21px] font-bold ${c.titleColor}`}>{c.b[0]}</div>
              <div className="text-[11.5px] text-muted">{c.b[1]}</div>
            </div>
          </div>
          <Link href={c.href} className={`btn mt-4 w-full text-white ${c.button}`}>
            {t("accessService")} <IconArrowRight size={16} />
          </Link>
        </article>
      ))}
    </div>
  );
}
