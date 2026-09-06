"use client";
import Link from "next/link";
import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@client/components/icons";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[560px] py-12">
      <section className="card p-7 text-center">
        <span className="icon-tile mx-auto h-12 w-12 bg-danger-soft text-danger">
          <IconAlert size={24} />
        </span>
        <h1 className="mt-4 text-[22px] font-bold text-ink">Une erreur est survenue</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Cette page n&apos;a pas pu s&apos;afficher. Vos données sont enregistrées : rien n&apos;est perdu. Réessayez dans un instant.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11.5px] text-muted-2">Référence technique : {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            <IconRefresh size={16} /> Réessayer
          </button>
          <Link href="/" className="btn btn-ghost">
            Retour à l&apos;accueil
          </Link>
        </div>
        <p className="mt-6 border-t border-line pt-4 text-[12.5px] text-muted">
          Si le problème persiste, signalez-le à l&apos;administrateur de votre organisation en indiquant la référence ci-dessus.
        </p>
      </section>
    </div>
  );
}
