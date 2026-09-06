import Link from "next/link";
import { IconArrowRight, IconSearch } from "@client/components/icons";

export const metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[560px] py-12">
      <section className="card p-7 text-center">
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
          <Link href="/recherche" className="btn btn-ghost">
            Rechercher
          </Link>
        </div>
        <p className="mt-6 border-t border-line pt-4 text-[12.5px] text-muted">
          Besoin d&apos;aide ? Vous pouvez toujours{" "}
          <Link href="/cas/nouveau?humain=1" className="link">
            parler à une personne
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
