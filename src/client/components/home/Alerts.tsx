"use client";
import { useLanguage } from "../shell/LanguageProvider";
import { timeAgo } from "@shared/i18n/format";
import { Card, CardHeader, ArrowLink, EmptyState } from "../ui";
import { IconDrop, IconFlame, IconGraduation, IconBriefcase } from "../icons";

export interface AlertItem {
  id: string;
  kind: "health" | "agriculture" | "education" | "case";
  title: string;
  detail: string;
  at: string;
  severity: "critical" | "high" | "medium";
}

const ICON = {
  health: { node: <IconFlame size={18} />, cls: "bg-danger-soft text-danger" },
  agriculture: { node: <IconDrop size={18} />, cls: "bg-warn-soft text-warn" },
  education: { node: <IconGraduation size={18} />, cls: "bg-brand-soft text-brand" },
  case: { node: <IconBriefcase size={18} />, cls: "bg-danger-soft text-danger" },
};

export function Alerts({ alerts, now }: { alerts: AlertItem[]; now: number }) {
  const { t, lang } = useLanguage();
  return (
    <Card className="p-0">
      <CardHeader title={t("importantAlerts")} action={t("viewAll")} href="/tableau-de-bord#alertes" icon={<span className="icon-tile h-7 w-7 shrink-0 bg-danger-soft text-danger"><IconFlame size={15} /></span>} />
      <div className="space-y-1 px-3 pb-3 pt-3">
        {alerts.length === 0 && <EmptyState title="Aucune alerte active" hint="Les alertes apparaissent dès qu'une tendance ou un cas critique est détecté." />}
        {alerts.map((a) => (
          <div key={a.id} className="flex gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
            <span className={`icon-tile h-9 w-9 ${ICON[a.kind].cls}`}>{ICON[a.kind].node}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-snug text-ink">{a.title}</div>
              <div className="mt-0.5 text-[11.5px] text-muted">{timeAgo(a.at, lang, now)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 text-center">
        <ArrowLink href="/tableau-de-bord#alertes">{t("viewAllAlerts")}</ArrowLink>
      </div>
    </Card>
  );
}
