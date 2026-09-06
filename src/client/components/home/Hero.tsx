"use client";
import Link from "next/link";
import { LANGUAGES } from "@shared/types";
import { useLanguage } from "../shell/LanguageProvider";
import { IconMic, IconUpload } from "../icons";
import { HeroScene } from "./HeroScene";

export function Hero({ photo }: { photo: boolean }) {
  const { t } = useLanguage();
  return (
    <section className="grain relative overflow-hidden rounded-2xl bg-navy-2 text-white shadow-lg" style={{ minHeight: 300 }}>
      <div className="absolute inset-y-0 right-0 w-full md:w-[62%]">
        <HeroScene photo={photo} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0e1a33] via-[#0e1a33]/70 to-transparent md:from-[#0e1a33] md:via-[#0e1a33]/40" />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between gap-6 p-6 sm:p-8 md:max-w-[58%]">
        <div>
          <h2 className="text-[26px] font-bold leading-[1.15] sm:text-[31px]">
            {t("hero_title_1")}
            <br />
            {t("hero_title_2")}
          </h2>
          <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-white/85">{t("hero_sub")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sante#parler" className="btn btn-primary h-[58px] px-5 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <IconMic size={20} />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-bold">{t("speakNow")}</span>
                <span className="block text-[12px] font-medium text-white/80">{t("speakHint")}</span>
              </span>
            </Link>
            <Link href="/agriculture#envoyer" className="btn btn-outline-light h-[58px] px-5 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                <IconUpload size={20} />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-bold">{t("sendFile")}</span>
                <span className="block text-[12px] font-medium text-white/80">{t("sendFileHint")}</span>
              </span>
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-white/85">
          <span className="mr-1">{t("supportedLanguages")}</span>
          {LANGUAGES.map((l) => (
            <span key={l.code} className="chip chip-light">
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
