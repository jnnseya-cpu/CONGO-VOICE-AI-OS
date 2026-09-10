import Link from "next/link";
import type { ReactNode } from "react";
import type { Post } from "@server/blog/types";
import { slugifyTerm } from "@server/blog/index";
import { IconArrowRight, IconClock, IconFile, IconShield, IconSparkle } from "../icons";

export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return (
    <article className={`card card-hover flex flex-col p-5 ${featured ? "sm:p-6" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/blog/categorie/${slugifyTerm(post.category)}`} className="tag tag-case hover:underline">
          {post.category}
        </Link>
        {post.pillar && <span className="tag tag-muted">Dossier</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted">
          <IconClock size={13} /> {post.readingMinutes} min
        </span>
      </div>
      <h3 className={`mt-3 text-balance font-serif font-semibold leading-tight tracking-[-0.01em] text-ink ${featured ? "text-[22px] sm:text-[26px]" : "text-[18px]"}`}>
        <Link href={`/blog/${post.slug}`} className="hover:underline">
          {post.title}
        </Link>
      </h3>
      <p className={`mt-2 leading-relaxed text-ink-2 ${featured ? "text-[14.5px]" : "text-[13.5px]"}`}>{post.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        <span aria-hidden="true">·</span>
        <span>{post.author}</span>
        {post.lang === "en" && <span className="tag tag-muted">EN</span>}
      </div>
      <Link href={`/blog/${post.slug}`} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
        Lire l&apos;article <IconArrowRight size={15} />
      </Link>
    </article>
  );
}

export function Takeaways({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <aside data-speakable="true" className="not-prose my-8 rounded-[14px] border border-[#cfe0ff] bg-[#eef4ff] p-5">
      <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-brand">
        <IconSparkle size={16} /> Ce qu&apos;il faut retenir
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((t, i) => (
          <li key={`${t}-${i}`} className="flex gap-2.5 text-[14.5px] leading-relaxed text-ink">
            <span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-brand" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function Toc({ headings }: { headings: Post["headings"] }) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length < 3) return null;
  return (
    <nav aria-label="Sommaire" className="card p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Sommaire</h2>
      <ol className="mt-3 space-y-1.5">
        {items.map((h, i) => (
          <li key={`${h.id}-${i}`} className={h.level === 3 ? "pl-4" : ""}>
            <a href={`#${h.id}`} className="text-[13px] leading-snug text-ink-2 hover:text-brand hover:underline">
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function FaqSection({ faq }: { faq: Post["faq"] }) {
  if (!faq.length) return null;
  return (
    <section id="questions-frequentes" className="mt-12">
      <h2 className="font-serif text-[26px] font-semibold tracking-[-0.02em] text-ink">Questions fréquentes</h2>
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
        {faq.map((f, i) => (
          <details key={`${f.q}-${i}`} className="group px-5 py-4 open:bg-surface-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-semibold text-ink marker:hidden">
              {f.q}
              <span className="text-muted transition group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="mt-3 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Sources({ sources }: { sources: Post["sources"] }) {
  if (!sources.length) return null;
  return (
    <section className="mt-12">
      <h2 className="font-serif text-[22px] font-semibold tracking-[-0.02em] text-ink">Sources</h2>
      <ol className="mt-4 space-y-2 text-[13.5px] leading-relaxed text-ink-2">
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`} className="flex gap-2">
            <span className="text-muted-2 tabular-nums">{i + 1}.</span>
            <a href={s.url} rel="noopener noreferrer nofollow" target="_blank" className="font-medium text-brand hover:underline">
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RelatedPosts({ posts, title = "À lire ensuite" }: { posts: Post[]; title?: string }) {
  if (!posts.length) return null;
  return (
    <section className="mt-12">
      <h2 className="font-serif text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover p-4">
            <span className="tag tag-case">{p.category}</span>
            <h3 className="mt-2 text-[15.5px] font-bold leading-snug text-ink">{p.title}</h3>
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-muted">{p.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Breadcrumbs({ trail }: { trail: Array<{ href: string; label: string }> }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
        {trail.map((t, i) => (
          <li key={`${t.href}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-muted-2">
                /
              </span>
            )}
            {i === trail.length - 1 ? (
              <span className="text-ink-2">{t.label}</span>
            ) : (
              <Link href={t.href} className="hover:text-brand hover:underline">
                {t.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Sujets</span>
      {tags.map((t, i) => (
        <Link key={`${t}-${i}`} href={`/blog/sujet/${slugifyTerm(t)}`} className="chip border-line bg-surface-2 text-ink-2 hover:bg-brand-soft hover:text-brand">
          {t}
        </Link>
      ))}
    </div>
  );
}

export function ArticleMeta({ post }: { post: Post }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-4 text-[13px] text-ink-2">
      <span>
        Par <strong className="font-semibold text-ink">{post.author}</strong>, {post.authorRole}
      </span>
      {post.reviewer && (
        <span className="inline-flex items-center gap-1.5">
          <IconShield size={14} className="text-health" /> Relu par {post.reviewer}, {post.reviewerRole}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <IconClock size={14} /> {post.readingMinutes} min de lecture
      </span>
      <span className="inline-flex items-center gap-1.5">
        <IconFile size={14} /> Mis à jour le {formatDate(post.updatedAt)}
      </span>
    </div>
  );
}

export function Prose({ html }: { html: string }) {
  return (
    <div
      className="post-body mt-8 max-w-[68ch] text-[16.5px] leading-[1.78] text-ink-2"
      // Markdown is authored in this repository and rendered at build time.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
