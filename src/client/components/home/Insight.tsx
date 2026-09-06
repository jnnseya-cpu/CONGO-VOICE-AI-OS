"use client";
import { useLanguage } from "../shell/LanguageProvider";
import { ArrowLink, Card } from "../ui";
import { IconSparkle } from "../icons";

export interface InsightData {
  headline: string;
  recommendation: string;
  nextAction: string;
  basis: string;
}

export function Insight({ insight }: { insight: InsightData }) {
  const { t } = useLanguage();
  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 px-5 pt-5">
        <span className="icon-tile h-7 w-7 bg-brand-soft text-brand">
          <IconSparkle size={15} />
        </span>
        <h2 className="section-title">{t("insightOfDay")}</h2>
      </div>
      <div className="px-5 pb-5 pt-3">
        <div className="rounded-xl border border-[#cfe0ff] bg-[#eef4ff] p-4">
          <p className="text-[13px] leading-relaxed text-ink">
            <Strong text={insight.headline} />
          </p>
          <div className="mt-3 text-[13px] font-semibold text-brand">{t("recommendation")}</div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{insight.recommendation}</p>
          <div className="mt-3 text-[13px] font-semibold text-brand">{t("nextAction")}</div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{insight.nextAction}</p>
          <p className="mt-3 text-[11px] text-muted">Base : {insight.basis}</p>
        </div>
        <ArrowLink href="/tableau-de-bord" className="btn btn-ghost mt-4 w-full">
          {t("viewFullAnalysis")}
        </ArrowLink>
      </div>
    </Card>
  );
}

/** Bold numbers and percentages inside the headline for scannability. */
function Strong({ text }: { text: string }) {
  const parts = text.split(/(\d+\s?%|\d+ province\(s\)|\d+ provinces|\d+ demandes|\d+ signalements)/g);
  return (
    <>
      {parts.map((p, i) => (/^\d/.test(p) ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}
