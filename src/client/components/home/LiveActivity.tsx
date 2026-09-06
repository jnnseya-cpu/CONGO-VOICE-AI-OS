"use client";
import { useLanguage } from "../shell/LanguageProvider";
import { Card, CardHeader, StatRow } from "../ui";
import { IconAlert, IconBriefcase, IconMic, IconUsers } from "../icons";
import { ArrowLink } from "../ui";
import { formatNumber } from "@shared/i18n/format";

export interface LiveStats {
  activeUsersToday: { value: number; deltaPct: number | null };
  voiceInteractionsToday: { value: number; deltaPct: number | null };
  casesNeedingFollowUp: { value: number; deltaPct: number | null };
  criticalAlerts: { value: number; deltaPct: number | null };
}

export function LiveActivity({ stats, canOpenDashboard }: { stats: LiveStats; canOpenDashboard: boolean }) {
  const { t, lang } = useLanguage();
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="section-title">{t("liveActivity")}</h2>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ok">
          <span className="live-dot" /> {t("live")}
        </span>
      </div>
      <div className="space-y-1 px-3 pb-3 pt-3">
        <StatRow icon={<IconUsers size={18} />} label={t("activeUsersToday")} value={formatNumber(stats.activeUsersToday.value, lang)} pct={stats.activeUsersToday.deltaPct} />
        <StatRow icon={<IconMic size={18} />} label={t("voiceInteractions")} value={formatNumber(stats.voiceInteractionsToday.value, lang)} pct={stats.voiceInteractionsToday.deltaPct} />
        <StatRow icon={<IconBriefcase size={18} />} label={t("casesFollowUp")} value={formatNumber(stats.casesNeedingFollowUp.value, lang)} pct={stats.casesNeedingFollowUp.deltaPct} tone="warn" />
        <StatRow icon={<IconAlert size={18} />} label={t("criticalAlerts")} value={formatNumber(stats.criticalAlerts.value, lang)} pct={stats.criticalAlerts.deltaPct} tone="danger" />
      </div>
      <div className="px-5 pb-5">
        <ArrowLink href={canOpenDashboard ? "/tableau-de-bord" : "/connexion?next=/tableau-de-bord"} className="btn btn-ghost w-full">
          {t("viewFullDashboard")}
        </ArrowLink>
      </div>
    </Card>
  );
}
