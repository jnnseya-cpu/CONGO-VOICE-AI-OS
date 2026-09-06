import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconTrendDown, IconTrendUp } from "../icons";

export function Card({ children, className = "", hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <section className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</section>;
}

export function CardHeader({ title, action, href, icon }: { title: string; action?: string; href?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5">
      <h2 className="section-title flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      {action && href && (
        <Link href={href} className="link shrink-0 whitespace-nowrap">
          {action}
        </Link>
      )}
    </div>
  );
}

export function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[12px] font-semibold text-muted-2">—</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold ${up ? "text-ok" : "text-danger"}`}>
      {up ? <IconTrendUp size={14} /> : <IconTrendDown size={14} />}
      {Math.abs(pct)}%
    </span>
  );
}

export function StatRow({ icon, label, value, pct, tone = "brand" }: { icon: ReactNode; label: string; value: string; pct: number | null; tone?: "brand" | "health" | "warn" | "danger" }) {
  const tones = { brand: "bg-brand-soft text-brand", health: "bg-health-soft text-health", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
      <span className={`icon-tile h-9 w-9 ${tones[tone]}`}>{icon}</span>
      <span className="flex-1 text-[13.5px] text-ink-2">{label}</span>
      <span className="text-[15px] font-bold tabular-nums text-ink">{value}</span>
      <Delta pct={pct} />
    </div>
  );
}

export function ArrowLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 text-[13.5px] font-semibold text-brand ${className}`}>
      <span className="min-w-0 text-[13px] leading-tight">{children}</span>
      <IconArrowRight size={16} className="shrink-0" />
    </Link>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
      <div className="text-sm font-semibold text-ink-2">{title}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "health" | "agri" | "edu" | "case" | "danger" | "warn" | "muted"; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
