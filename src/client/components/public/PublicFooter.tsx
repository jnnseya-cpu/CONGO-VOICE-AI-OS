import Link from "next/link";
import { PUBLIC_PAGES, SITE } from "@shared/site";

const GROUPS: Array<{ title: string; group: (typeof PUBLIC_PAGES)[number]["group"] }> = [
  { title: "Utiliser le service", group: "citoyen" },
  { title: "Le programme", group: "programme" },
  { title: "Institutions", group: "institution" },
  { title: "Informations légales", group: "legal" },
];

export function PublicFooter({ year }: { year: number }) {
  return (
    <footer className="border-t border-white/10 bg-navy text-white">
      <div className="mx-auto max-w-[1120px] px-5 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((g) => (
            <nav key={g.group} aria-label={g.title}>
              <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/50">{g.title}</h2>
              <ul className="mt-3 space-y-2">
                {PUBLIC_PAGES.filter((p) => p.group === g.group).map((p) => (
                  <li key={p.href}>
                    <Link href={p.href} className="text-[13.5px] text-white/80 hover:text-white hover:underline">
                      {p.label}
                    </Link>
                  </li>
                ))}
                {g.group === "citoyen" && (
                  <li>
                    <Link href="/sante#parler" className="text-[13.5px] text-white/80 hover:text-white hover:underline">
                      Poser une question maintenant
                    </Link>
                  </li>
                )}
                {g.group === "institution" && (
                  <li>
                    <Link href="/connexion" className="text-[13.5px] text-white/80 hover:text-white hover:underline">
                      Espace institutionnel
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 rounded-[14px] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[13px] font-semibold text-white">Ce service n&apos;est pas un service d&apos;urgence.</p>
          <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-white/70">
            Il oriente et informe. Il ne remplace ni un médecin, ni un agronome, ni un enseignant. Devant un signe de danger, rendez-vous immédiatement au centre de santé le plus proche.{" "}
            <Link href="/urgence" className="font-semibold text-white underline">
              Voir la conduite à tenir
            </Link>
            .
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-[12.5px] text-white/60 md:flex-row md:items-center md:justify-between">
          <p>
            {SITE.name} · {SITE.country} · Opéré par {SITE.operator}
          </p>
          <p>
            {SITE.status} · © {year} · Contact&nbsp;:{" "}
            <a href={`mailto:${SITE.contact.general}`} className="underline hover:text-white">
              {SITE.contact.general}
            </a>
            {!SITE.contactsActive && <span className="ml-2 text-white/40">(adresse en cours d&apos;activation)</span>}
          </p>
        </div>
      </div>
    </footer>
  );
}
