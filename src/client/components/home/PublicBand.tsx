import Link from "next/link";
import { SITE } from "@shared/site";
import { IconAlert, IconArrowRight, IconPhone, IconShield } from "../icons";

/**
 * Shown on the home screen to visitors who are not signed in: says what this service is,
 * how to reach it without a smartphone, and where the safety and privacy commitments are.
 */
export function PublicBand() {
  const items = [
    { href: "/acces", icon: <IconPhone size={20} />, title: "Sans smartphone", body: "Appel vocal, USSD et SMS sur n'importe quel téléphone. Gratuit pour le citoyen.", cls: "bg-brand-soft text-brand" },
    { href: "/urgence", icon: <IconAlert size={20} />, title: "En cas de danger", body: "Ce service n'est pas un service d'urgence. Voir la conduite à tenir immédiatement.", cls: "bg-danger-soft text-danger" },
    { href: "/gouvernance", icon: <IconShield size={20} />, title: "Sécurité et données", body: "Règles de sécurité écrites, supervision humaine, données protégées et exportables.", cls: "bg-health-soft text-health" },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-brand">Programme national d&apos;inclusion numérique</p>
          <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">
            {SITE.name} est un service public gratuit qui permet d&apos;obtenir une orientation en santé, un conseil agricole et un appui scolaire en parlant dans sa langue, depuis n&apos;importe quel téléphone.
          </p>
        </div>
        <Link href="/programme" className="btn btn-ghost h-10 flex-none">
          Découvrir le programme <IconArrowRight size={16} />
        </Link>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="flex gap-3 bg-white p-4 hover:bg-surface-2">
            <span className={`icon-tile h-9 w-9 flex-none ${i.cls}`}>{i.icon}</span>
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">{i.title}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{i.body}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
