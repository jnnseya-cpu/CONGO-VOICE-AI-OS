"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useLanguage } from "../shell/LanguageProvider";
import { filterSelectClass } from "../dashboard/Common";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les cas actifs" },
  { value: "open", label: "Ouvert" },
  { value: "open_emergency", label: "Urgence ouverte" },
  { value: "assigned", label: "Attribué" },
  { value: "acknowledged", label: "Accusé de réception" },
  { value: "in_progress", label: "En cours" },
  { value: "needs_follow_up", label: "Suivi requis" },
  { value: "escalated", label: "Escaladé" },
  { value: "escalated_up", label: "Escalade superviseur" },
  { value: "resolved", label: "Résolu" },
  { value: "closed", label: "Clos" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "Toutes gravités" },
  { value: "critical", label: "Critique" },
  { value: "high", label: "Élevé" },
  { value: "medium", label: "Modéré" },
  { value: "low", label: "Faible" },
];

export function CaseFilters({ modules }: { modules: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useLanguage();

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const mine = params.get("mine") === "1";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      <select aria-label="Statut" className={`${filterSelectClass} min-w-[190px]`} value={params.get("status") ?? ""} onChange={(e) => update("status", e.target.value)}>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {modules.length > 1 && (
        <select aria-label="Module" className={`${filterSelectClass} min-w-[150px]`} value={params.get("module") ?? ""} onChange={(e) => update("module", e.target.value)}>
          <option value="">Tous les modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m === "health" ? "Santé" : m === "agriculture" ? "Agriculture" : m === "education" ? "Éducation" : "Général"}
            </option>
          ))}
        </select>
      )}
      <select aria-label="Gravité" className={`${filterSelectClass} min-w-[150px]`} value={params.get("severity") ?? ""} onChange={(e) => update("severity", e.target.value)}>
        {SEVERITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => update("mine", mine ? "" : "1")} className={`btn ${mine ? "btn-primary" : "btn-ghost"} h-10`} aria-pressed={mine}>
        {t("myCases")}
      </button>
      {(params.get("status") || params.get("module") || params.get("severity") || mine) && (
        <button type="button" onClick={() => router.push(pathname)} className="text-[13px] font-semibold text-muted hover:text-ink">
          {t("reset")}
        </button>
      )}
    </div>
  );
}
