"use client";
import { useLanguage } from "../shell/LanguageProvider";
import { Card, CardHeader } from "../ui";
import { IconMic, IconPhone, IconSparkle } from "../icons";

export function HowItWorks() {
  const { t } = useLanguage();
  const steps = [
    { n: 1, label: t("step1"), icon: <IconMic size={18} />, cls: "bg-brand-soft text-brand" },
    { n: 2, label: t("step2"), icon: <IconSparkle size={18} />, cls: "bg-edu-soft text-edu" },
    { n: 3, label: t("step3"), icon: <IconPhone size={18} />, cls: "bg-health-soft text-health" },
  ];
  return (
    <Card className="p-0">
      <CardHeader title={t("howItWorks")} />
      <ol className="space-y-3 px-5 pb-5 pt-3">
        {steps.map((s) => (
          <li key={s.n} className="flex items-center gap-3">
            <span className={`icon-tile h-9 w-9 ${s.cls}`}>{s.icon}</span>
            <span className="text-[13px] text-ink-2">
              <span className="mr-1.5 font-bold text-ink">{s.n}.</span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="px-5 pb-5 text-[11.5px] leading-relaxed text-muted">{t("privacyNote")}</p>
    </Card>
  );
}
