import Link from "next/link";
import { Card } from "@client/components/ui";
import { IconShield } from "@client/components/icons";

/**
 * What an anonymous visitor sees where an account is needed.
 *
 * Not a redirect to sign-in: they already have a session, so a redirect loops,
 * and being bounced somewhere without explanation reads as a fault. The two
 * things this has to say are that the page keeps something under a name, and
 * that asking a question has not been taken away — a citizen who concludes the
 * service now requires registration will not come back to it in an emergency.
 */
export function AccountRequired({ what, next }: { what: string; next: string }) {
  return (
    <div className="mx-auto max-w-[560px] py-10">
      <Card className="p-6 text-center">
        <span className="icon-tile mx-auto h-11 w-11 bg-brand-soft text-brand">
          <IconShield size={22} />
        </span>
        <h1 className="mt-3 text-[18px] font-semibold text-ink">Un compte est nécessaire</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{what}</p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          Poser une question reste libre et gratuit, sans compte et sans numéro. Un compte sert uniquement à conserver vos
          échanges sous votre nom et à permettre qu&apos;un agent vous rappelle.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="btn btn-primary">
            Se connecter ou créer un compte
          </Link>
          <Link href="/sante" className="btn btn-ghost">
            Poser une question
          </Link>
        </div>
      </Card>
    </div>
  );
}
