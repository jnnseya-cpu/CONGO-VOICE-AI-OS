import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight } from "../icons";

/** Building blocks for the public programme site. Server components: no client JS. */

export function PageIntro({ eyebrow, title, lead, meta }: { eyebrow: string; title: string; lead: string; meta?: ReactNode }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto max-w-[1120px] px-5 py-12 sm:py-16">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>
        <h1 className="mt-3 max-w-[26ch] text-balance font-serif text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[46px]">{title}</h1>
        <p className="mt-5 max-w-[62ch] font-serif text-[18px] leading-[1.6] text-ink-2 sm:text-[20px]">{lead}</p>
        {meta && <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">{meta}</div>}
      </div>
    </header>
  );
}

export function Section({ id, eyebrow, title, lead, children, tone = "ground" }: { id?: string; eyebrow?: string; title?: string; lead?: string; children: ReactNode; tone?: "ground" | "white" | "navy" }) {
  const bg = tone === "white" ? "bg-white" : tone === "navy" ? "bg-navy text-white" : "bg-bg";
  return (
    <section id={id} className={`${bg} ${tone !== "ground" ? "border-y border-line" : ""}`}>
      <div className="mx-auto max-w-[1120px] px-5 py-12 sm:py-16">
        {eyebrow && <p className={`text-[12px] font-bold uppercase tracking-[0.14em] ${tone === "navy" ? "text-white/60" : "text-brand"}`}>{eyebrow}</p>}
        {title && <h2 className={`mt-2 max-w-[26ch] text-balance font-serif text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px] ${tone === "navy" ? "text-white" : "text-ink"}`}>{title}</h2>}
        {lead && <p className={`mt-3 max-w-[62ch] text-[15px] leading-relaxed ${tone === "navy" ? "text-white/75" : "text-ink-2"}`}>{lead}</p>}
        <div className={title || lead ? "mt-8" : ""}>{children}</div>
      </div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[68ch] space-y-4 text-[15px] leading-[1.75] text-ink-2 [&_a]:font-semibold [&_a]:text-brand [&_a:hover]:underline [&_h3]:pt-3 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>;
}

export function Cards({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid gap-4 ${c}`}>{children}</div>;
}

export function InfoCard({ title, children, icon, tone = "plain", href }: { title: string; children: ReactNode; icon?: ReactNode; tone?: "plain" | "health" | "agri" | "edu" | "danger"; href?: string }) {
  const tile = { plain: "bg-brand-soft text-brand", health: "bg-health-soft text-health", agri: "bg-agri-soft text-agri", edu: "bg-edu-soft text-edu", danger: "bg-danger-soft text-danger" }[tone];
  const inner = (
    <>
      {icon && <span className={`icon-tile mb-3 h-11 w-11 rounded-xl ${tile}`}>{icon}</span>}
      <h3 className="text-[16px] font-bold text-ink">{title}</h3>
      <div className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{children}</div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card card-hover flex flex-col p-5">
        {inner}
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
          En savoir plus <IconArrowRight size={15} />
        </span>
      </Link>
    );
  }
  return <article className="card flex flex-col p-5">{inner}</article>;
}

export function Steps({ items }: { items: Array<{ title: string; body: string }> }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="card p-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-[14px] font-bold text-white">{i + 1}</span>
          <h3 className="mt-3 text-[16px] font-bold text-ink">{s.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function KeyFacts({ items }: { items: Array<{ value: string; label: string; note?: string }> }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {items.map((f) => (
        <div key={f.label} className="bg-white p-5">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
          <dd className="mt-1.5 text-[26px] font-bold tabular-nums leading-none tracking-tight text-ink">{f.value}</dd>
          {f.note && <p className="mt-2 text-[12px] leading-snug text-muted">{f.note}</p>}
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "danger" | "warn" | "ok"; title: string; children: ReactNode }) {
  const styles = {
    info: "border-[#cfe0ff] bg-[#eef4ff] text-ink",
    danger: "border-danger/30 bg-danger-soft text-ink",
    warn: "border-warn/30 bg-warn-soft text-ink",
    ok: "border-health/25 bg-health-soft text-ink",
  }[tone];
  const label = { info: "text-brand", danger: "text-danger", warn: "text-warn", ok: "text-health" }[tone];
  return (
    <div className={`rounded-[14px] border p-5 ${styles}`}>
      <p className={`text-[13px] font-bold uppercase tracking-wide ${label}`}>{title}</p>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

export function DataTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
        {caption && <caption className="px-5 pt-4 text-left text-[12.5px] text-muted">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((h) => (
              <th key={h} scope="col" className="px-5 py-3 text-[11.5px] font-bold uppercase tracking-wide text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((cell, j) => (
                <td key={j} className={`px-5 py-3 align-top ${j === 0 ? "font-semibold text-ink" : "text-ink-2"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: ReactNode }> }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
      {items.map((item) => (
        <details key={item.q} className="group px-5 py-4 open:bg-surface-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-ink marker:hidden">
            {item.q}
            <span className="text-muted transition group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </summary>
          <div className="mt-3 max-w-[68ch] space-y-2 text-[14px] leading-relaxed text-ink-2">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title, body, primary, secondary }: { title: string; body: string; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <section className="bg-navy">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-12 sm:py-14 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="max-w-[24ch] text-balance font-serif text-[24px] font-semibold leading-tight text-white sm:text-[28px]">{title}</h2>
          <p className="mt-2 max-w-[58ch] text-[14.5px] leading-relaxed text-white/75">{body}</p>
        </div>
        <div className="flex flex-none flex-wrap gap-3">
          <Link href={primary.href} className="btn btn-primary h-11 px-5">
            {primary.label} <IconArrowRight size={16} />
          </Link>
          {secondary && (
            <Link href={secondary.href} className="btn btn-outline-light h-11 px-5">
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Language block used on citizen-facing pages, where every language is shown inline. */
export function LangBlock({ lang, native, children }: { lang: string; native: string; children: ReactNode }) {
  return (
    <article className="card p-5">
      <p className="text-[11.5px] font-bold uppercase tracking-wide text-brand">
        {native} <span className="font-medium text-muted-2">· {lang}</span>
      </p>
      <div className="mt-2 text-[15px] leading-[1.65] text-ink">{children}</div>
    </article>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-6 border-t border-line pt-4 text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

/** In-page jump links, for long pages whose sections carry anchors. */
export function AnchorNav({ items, label = "Sur cette page" }: { items: Array<{ href: string; label: string }>; label?: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
      {items.map((i) => (
        <a key={i.href} href={i.href} className="rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] font-semibold text-ink hover:border-brand hover:text-brand">
          {i.label}
        </a>
      ))}
    </nav>
  );
}
