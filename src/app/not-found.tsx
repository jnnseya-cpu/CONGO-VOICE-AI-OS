import Link from "next/link";
import { SITE } from "@shared/site";
import { IconArrowRight, IconSearch } from "@client/components/icons";

export const metadata = { title: "Page introuvable", robots: { index: false, follow: true } };

const LINKS = [
  { href: "/", label: "Accueil du service" },
  { href: "/acces", label: "Comment y accéder" },
  { href: "/urgence", label: "En cas d'urgence" },
  { href: "/aide", label: "Questions fréquentes" },
  { href: "/programme", label: "Le programme" },
];

/** Rendered outside both the operating system and the public chrome: it must stand on its own. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex h-[3px]" aria-hidden="true">
        <span className="flex-1 bg-[#007fff]" />
        <span className="flex-1 bg-[#f7d618]" />
        <span className="flex-1 bg-[#ce1021]" />
      </div>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 items-center px-5 py-12">
        <section className="card w-full p-7 text-center">
          <span className="icon-tile mx-auto h-12 w-12 bg-brand-soft text-brand">
            <IconSearch size={24} />
          </span>
          <h1 className="mt-4 text-[22px] font-bold text-ink">Page introuvable</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Cette page n&apos;existe pas ou n&apos;est plus accessible. Elle a peut-être été déplacée, ou le lien que vous avez suivi est incomplet.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/" className="btn btn-primary">
              Retour à l&apos;accueil <IconArrowRight size={16} />
            </Link>
            <Link href="/programme" className="btn btn-ghost">
              Le programme
            </Link>
          </div>
          <nav aria-label="Pages principales" className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-line pt-5">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-[12.5px] text-muted hover:text-brand hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="mt-5 text-[12px] text-muted-2">
            {SITE.name} · Devant un signe de danger, rendez-vous immédiatement au centre de santé le plus proche.
          </p>
        </section>
      </main>
    </div>
  );
}
