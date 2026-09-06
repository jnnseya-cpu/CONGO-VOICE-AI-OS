"use client";
import Link from "next/link";
import { useLanguage } from "../shell/LanguageProvider";
import { Card, CardHeader } from "../ui";
import { IconBell, IconBook, IconFile, IconMap, IconPlus, IconUsers } from "../icons";

export function QuickActions() {
  const { t } = useLanguage();
  const actions = [
    { href: "/cas/nouveau", label: t("createCase"), icon: <IconPlus size={18} />, cls: "bg-brand-soft text-brand" },
    { href: "/notifications/envoyer", label: t("sendReminder"), icon: <IconBell size={18} />, cls: "bg-health-soft text-health" },
    { href: "/rapports", label: t("generateReport"), icon: <IconFile size={18} />, cls: "bg-edu-soft text-edu" },
    { href: "/admin/utilisateurs", label: t("addUser"), icon: <IconUsers size={18} />, cls: "bg-brand-soft text-brand" },
    { href: "/tableau-de-bord#cartes", label: t("viewMaps"), icon: <IconMap size={18} />, cls: "bg-agri-soft text-agri" },
    { href: "/ressources", label: t("resourceCentre"), icon: <IconBook size={18} />, cls: "bg-warn-soft text-warn" },
  ];
  return (
    <Card className="p-0">
      <CardHeader title={t("quickActions")} />
      <div className="grid grid-cols-3 gap-2.5 p-4">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="card card-hover flex flex-col items-center gap-2 px-2 py-3 text-center">
            <span className={`icon-tile h-9 w-9 ${a.cls}`}>{a.icon}</span>
            <span className="text-[11px] font-medium leading-tight text-ink-2">{a.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
