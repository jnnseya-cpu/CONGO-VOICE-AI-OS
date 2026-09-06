"use client";
import { useLanguage } from "../shell/LanguageProvider";
import { IconShield } from "../icons";

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="card mt-4 flex flex-col gap-2 px-5 py-3 text-[12px] text-ink-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-health">
          <IconShield size={18} />
        </span>
        {t("footerPrivacy")}
      </div>
      <div className="text-muted">
        © {new Date().getFullYear()} CONGO VOICE AI OS. {t("rights")}
      </div>
    </footer>
  );
}
