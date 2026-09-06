/**
 * Presentational kit shared by every institutional screen (dashboard, cases, reports,
 * notifications, admin, languages, resources, settings, search).
 * No server imports: these components are rendered from server components and from
 * client components alike.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "../ui";
import { IconAlert, IconArrowRight, IconShield } from "../icons";

/* ── Vocabulary ───────────────────────────────────────────────────────────── */

export const MODULE_FR: Record<string, string> = {
  health: "Santé",
  agriculture: "Agriculture",
  education: "Éducation",
  general: "Général",
};

export const MODULE_TONE: Record<string, "health" | "agri" | "edu" | "case"> = {
  health: "health",
  agriculture: "agri",
  education: "edu",
  general: "case",
};

export const SEVERITY_FR: Record<string, string> = {
  low: "Faible",
  medium: "Modéré",
  high: "Élevé",
  critical: "Critique",
};

export const STATUS_FR: Record<string, string> = {
  open: "Ouvert",
  open_emergency: "Urgence ouverte",
  assigned: "Attribué",
  acknowledged: "Accusé réception",
  in_progress: "En cours",
  needs_follow_up: "Suivi requis",
  reassigned: "Réattribué",
  escalated: "Escaladé",
  escalated_up: "Escalade superviseur",
  resolved: "Résolu",
  closed: "Clos",
  cancelled: "Annulé",
  duplicate: "Doublon",
};

export const LANGUAGE_FR: Record<string, string> = {
  fr: "Français",
  ln: "Lingala",
  kg: "Kikongo",
  sw: "Swahili",
  lua: "Tshiluba",
};

export const ROLE_FR: Record<string, string> = {
  citizen: "Citoyen",
  chw: "Agent de santé",
  agri_officer: "Agent agricole",
  teacher: "Enseignant",
  ngo: "Partenaire ONG",
  gov_admin: "Administration",
  platform_admin: "Administrateur plateforme",
};

export const CHANNEL_FR: Record<string, string> = {
  voice: "Vocal",
  text: "Texte",
  image: "Photo",
  video: "Vidéo",
  pwa: "Application",
  ivr: "Serveur vocal",
  whatsapp: "WhatsApp",
  ussd: "USSD",
  sms: "SMS",
  assisted: "Assisté",
  android: "Android",
  in_app: "Application",
  email: "E-mail",
};

export const NOTIFICATION_TYPE_FR: Record<string, string> = {
  escalation: "Escalade",
  reminder: "Rappel",
  follow_up: "Suivi",
  broadcast: "Diffusion",
  alert: "Alerte",
  case: "Cas",
  report: "Rapport",
};

/* ── Time helpers ─────────────────────────────────────────────────────────── */

/** Current instant, read outside the component body so renders stay pure. */
export function nowMs(): number {
  return Date.now();
}

export function startOfDay(offsetDays = 0): Date {
  const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

/** "dimanche 6 septembre 2026" */
export function todayLabelFr(): string {
  return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function dateFr(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dateTimeFr(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Il y a 3 h" / "À l'instant" — computed on the server, French only. */
export function since(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const min = Math.round(Math.max(0, now - date.getTime()) / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const j = Math.round(h / 24);
  return j < 31 ? `Il y a ${j} j` : dateFr(date);
}

/** Relative deadline: "dans 2 h" / "en retard de 40 min". */
export function dueIn(d: Date | string | null | undefined, now = Date.now()): { label: string; late: boolean } {
  if (!d) return { label: "—", late: false };
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - now;
  const late = diff < 0;
  const min = Math.round(Math.abs(diff) / 60000);
  const body = min < 60 ? `${min} min` : min < 60 * 48 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} j`;
  return { label: late ? `en retard de ${body}` : `dans ${body}`, late };
}

/* ── Badges ───────────────────────────────────────────────────────────────── */

export function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return <span className="tag tag-muted">—</span>;
  const cls = severity === "critical" || severity === "high" ? "tag-danger" : severity === "medium" ? "tag-warn" : "tag-muted";
  return <span className={`tag ${cls}`}>{SEVERITY_FR[severity] ?? severity}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const danger = ["escalated", "escalated_up", "open_emergency"].includes(status);
  const warn = ["open", "needs_follow_up", "reassigned"].includes(status);
  const ok = ["resolved", "closed"].includes(status);
  const cls = danger ? "tag-danger" : warn ? "tag-warn" : ok ? "tag-health" : "tag-case";
  return <span className={`tag ${cls}`}>{STATUS_FR[status] ?? status}</span>;
}

export function ModuleBadge({ module }: { module: string }) {
  return <span className={`tag tag-${MODULE_TONE[module] ?? "case"}`}>{MODULE_FR[module] ?? module}</span>;
}

/* ── Layout primitives ────────────────────────────────────────────────────── */

export function Panel({
  title,
  hint,
  action,
  id,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-0 ${className}`}>
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4" id={id}>
          <div className="min-w-0">
            <h2 className="section-title">{title}</h2>
            {hint && <p className="mt-1 text-[12.5px] leading-snug text-muted">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

const TILE_TONES: Record<string, string> = {
  brand: "bg-brand-soft text-brand",
  health: "bg-health-soft text-health",
  agri: "bg-agri-soft text-agri",
  edu: "bg-edu-soft text-edu",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-muted",
};

export function StatTile({
  label,
  value,
  hint,
  tone = "brand",
  icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TILE_TONES;
  icon?: ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        {icon && <span className={`icon-tile h-8 w-8 ${TILE_TONES[tone]}`}>{icon}</span>}
        <span className="text-[12.5px] font-medium leading-tight text-muted">{label}</span>
      </div>
      <div className="text-[26px] font-bold leading-none tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-auto text-[11.5px] leading-snug text-muted">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="card card-hover block">
      {inner}
    </Link>
  ) : (
    <Card>{inner}</Card>
  );
}

const BAR_TONES: Record<string, string> = {
  brand: "bg-brand",
  health: "bg-health",
  agri: "bg-agri",
  edu: "bg-edu",
  warn: "bg-warn",
  danger: "bg-danger",
};

export interface BarRow {
  label: string;
  value: number;
  display?: string;
  sub?: string;
}

/** Horizontal ranking bars — pure CSS, no chart library. */
export function BarList({ rows, tone = "brand", emptyLabel = "Aucune donnée sur la période." }: { rows: BarRow[]; tone?: keyof typeof BAR_TONES; emptyLabel?: string }) {
  if (rows.length === 0) return <p className="px-5 py-6 text-[13px] text-muted">{emptyLabel}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5 px-5 py-4">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] text-ink-2">{r.label}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{r.display ?? fmt(r.value)}</span>
          </div>
          <div className="mt-1 h-[7px] w-full overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${BAR_TONES[tone]}`} style={{ width: `${Math.max(2, Math.round((r.value / max) * 100))}%` }} />
          </div>
          {r.sub && <div className="mt-0.5 text-[11.5px] text-muted">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Stacked share bar (language mix, referral mix…). */
export function ShareBar({ rows }: { rows: Array<{ label: string; value: number; color: string }> }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) return <p className="px-5 py-6 text-[13px] text-muted">Aucune donnée sur la période.</p>;
  return (
    <div className="px-5 py-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        {rows.map((r) => (
          <span key={r.label} title={`${r.label} — ${Math.round((r.value / total) * 100)}%`} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{r.label}</span>
            <span className="tabular-nums font-semibold text-ink">{Math.round((r.value / total) * 100)}%</span>
            <span className="w-10 text-right tabular-nums text-muted">{fmt(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const SHARE_COLORS = ["#1d4ed8", "#15803d", "#7c3aed", "#d97706", "#0891b2", "#be123c"];

/* ── Tables ───────────────────────────────────────────────────────────────── */

export function TableShell({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted">{head}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="px-5 py-8 text-center text-[13px] text-muted">Aucun élément à afficher.</p>}
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-semibold ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-[13px] text-ink-2 ${className}`}>{children}</td>;
}

/* ── Notices ──────────────────────────────────────────────────────────────── */

export function AccessNotice({ title = "Accès non autorisé", hint, back = "/" }: { title?: string; hint?: string; back?: string }) {
  return (
    <div className="mx-auto max-w-[560px] py-10">
      <Card className="p-6 text-center">
        <span className="icon-tile mx-auto h-11 w-11 bg-brand-soft text-brand">
          <IconShield size={22} />
        </span>
        <h1 className="mt-3 text-[18px] font-bold text-ink">{title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {hint ?? "Votre profil ne donne pas accès à cet écran. Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur de votre organisation."}
        </p>
        <Link href={back} className="btn btn-primary mt-5 inline-flex">
          Retour à l&apos;accueil
          <IconArrowRight size={16} />
        </Link>
      </Card>
    </div>
  );
}

export function Notice({ tone = "brand", children }: { tone?: "brand" | "warn" | "danger" | "health"; children: ReactNode }) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    health: "bg-health-soft text-health",
  } as const;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-[13px] leading-relaxed ${tones[tone]}`}>
      <IconAlert size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </label>
  );
}

const CONTROL = "h-10 rounded-[10px] border border-line bg-white px-3 text-[13.5px] text-ink outline-none placeholder:text-muted-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-soft";
const CONTROL_SELECT = "h-10 rounded-[10px] border border-line bg-white px-3 pr-8 text-[13.5px] text-ink outline-none focus:border-brand-2 focus:ring-4 focus:ring-brand-soft";

/** Full-width form controls. */
export const inputClass = `w-full ${CONTROL}`;
export const selectClass = `w-full ${CONTROL_SELECT}`;
export const textareaClass =
  "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-muted-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-soft";

/** Inline controls for filter bars: the caller sets the width. */
export const filterInputClass = CONTROL;
export const filterSelectClass = CONTROL_SELECT;

/** k-anonymity: cells built on fewer than `min` people are never published. */
export function kAnon(value: number, min = 10): string {
  return value > 0 && value < min ? `< ${min}` : fmt(value);
}
