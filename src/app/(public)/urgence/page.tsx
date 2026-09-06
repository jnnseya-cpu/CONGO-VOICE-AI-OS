import type { Metadata } from "next";
import Link from "next/link";
import { EMERGENCY_MESSAGES } from "@server/ai/safety";
import { SITE } from "@shared/site";
import { PageIntro, Section, Callout, Cards, InfoCard, LangBlock, Note, Prose } from "@client/components/public/ui";
import { IconAlert, IconPhone, IconUsers } from "@client/components/icons";

export const metadata: Metadata = {
  title: "En cas d'urgence",
  description: "Les signes de danger qui imposent d'aller immédiatement au centre de santé, en français, lingala, kikongo, kiswahili et tshiluba. Ce service n'est pas un service d'urgence.",
  alternates: { canonical: "/urgence" },
  openGraph: { title: "En cas d'urgence — CONGO VOICE AI OS", description: "Signes de danger et conduite à tenir, dans les cinq langues du programme.", url: "/urgence" },
};

const DANGER: Array<{ group: string; tone: "danger"; signs: string[] }> = [
  {
    group: "Chez un enfant de moins de cinq ans",
    tone: "danger",
    signs: [
      "Convulsions",
      "Impossible de boire ou de téter",
      "Vomit tout ce qu'il avale",
      "Somnolence inhabituelle, difficile à réveiller",
      "Respiration rapide, sifflante ou creusement des côtes",
      "Yeux enfoncés, peau qui reste plissée quand on la pince",
    ],
  },
  {
    group: "Pendant la grossesse ou après l'accouchement",
    tone: "danger",
    signs: [
      "Saignement",
      "Douleur forte et continue du ventre",
      "Maux de tête violents, vision trouble",
      "Fièvre",
      "Perte des eaux avant terme",
      "Le bébé ne bouge plus comme d'habitude",
    ],
  },
  {
    group: "Chez un nouveau-né (moins de deux mois)",
    tone: "danger",
    signs: [
      "Fièvre ou corps anormalement froid",
      "Refuse de téter",
      "Respiration difficile ou gémissements",
      "Convulsions ou raideur",
      "Nombril rouge, gonflé ou qui coule",
      "Jaunisse des paumes et des plantes des pieds",
    ],
  },
  {
    group: "Chez l'adulte",
    tone: "danger",
    signs: [
      "Perte de connaissance",
      "Difficulté à respirer",
      "Saignement abondant",
      "Nuque raide avec fièvre",
      "Douleur forte de la poitrine",
      "Morsure de serpent, brûlure étendue, empoisonnement",
    ],
  },
];

export default function UrgencePage() {
  return (
    <>
      <PageIntro
        eyebrow="Sécurité"
        title="En cas de danger, allez au centre de santé le plus proche maintenant"
        lead="CONGO VOICE AI OS oriente et informe. Ce n'est pas un service d'urgence et il ne remplace pas un agent de santé. Devant l'un des signes ci-dessous, ne perdez pas de temps à écrire ou à appeler le service : rendez-vous immédiatement à la structure de soins la plus proche, ou faites-vous accompagner par quelqu'un."
      />

      <Section tone="white">
        <Callout tone="danger" title="Conduite à tenir immédiatement">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Partez tout de suite vers le centre de santé, l&apos;hôpital général de référence ou le poste de santé le plus proche.</li>
            <li>Faites-vous accompagner : ne voyagez pas seul si vous vous sentez faible.</li>
            <li>Emportez le carnet de santé, la carte de consultation prénatale et la liste des médicaments déjà pris.</li>
            <li>Gardez la personne au calme et allongée. Ne lui donnez rien à avaler si elle est somnolente ou inconsciente.</li>
            <li>Si un relais communautaire est joignable dans le village, prévenez-le pendant le trajet.</li>
          </ul>
        </Callout>
      </Section>

      <Section eyebrow="Signes de danger" title="Ce qui impose de partir sans attendre" lead="Cette liste reprend les signes de danger utilisés par la prise en charge intégrée des maladies de l'enfant et par les protocoles communautaires nationaux. Elle est intégrée au service : quand l'un de ces signes est entendu, le système coupe court à la conversation, donne le message d'urgence et alerte un relais communautaire.">
        <Cards cols={2}>
          {DANGER.map((d) => (
            <InfoCard key={d.group} title={d.group} tone={d.tone} icon={<IconAlert size={22} />}>
              <ul className="list-disc space-y-1 pl-4">
                {d.signs.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </InfoCard>
          ))}
        </Cards>
      </Section>

      <Section tone="white" eyebrow="Dans votre langue" title="Le message d'urgence tel que le service le prononce" lead="Ce sont les mots exacts que le service dit à voix haute quand il détecte un signe de danger, dans chacune des cinq langues du programme.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE.languages.map((l) => (
            <LangBlock key={l.code} lang={l.label} native={l.native}>
              {EMERGENCY_MESSAGES[l.code]}
            </LangBlock>
          ))}
        </div>
      </Section>

      <Section eyebrow="Comment le service réagit" title="Ce qui se passe côté système">
        <Prose>
          <p>
            La détection des signes de danger ne dépend pas d&apos;un modèle de langage. Elle repose sur des règles écrites, versionnées et relues, appliquées dans les cinq langues <strong>avant</strong> tout appel à l&apos;intelligence artificielle. Un signe de danger déclenche donc la même réponse même si les fournisseurs d&apos;IA sont indisponibles.
          </p>
          <p>Concrètement, en quelques secondes :</p>
          <ul>
            <li>la conversation est interrompue et le message d&apos;urgence est prononcé dans la langue de la personne ;</li>
            <li>la structure de soins connue la plus proche est indiquée, ou l&apos;absence d&apos;information est dite explicitement ;</li>
            <li>un cas de gravité maximale est ouvert et assigné à la file des relais communautaires du territoire ;</li>
            <li>une alerte part vers les agents de santé et, pour les cas critiques, vers la coordination provinciale ;</li>
            <li>l&apos;échange complet est enregistré, horodaté et consultable par l&apos;agent qui rappellera.</li>
          </ul>
          <p>
            Un agent de santé peut modifier le niveau de gravité décidé par le système, mais uniquement en indiquant un motif, qui est journalisé. Le système, lui, ne peut jamais abaisser une gravité décidée par les règles.
          </p>
        </Prose>
      </Section>

      <Section tone="navy" eyebrow="Après l'urgence">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <span className="icon-tile mb-3 h-10 w-10 bg-white/10 text-white">
              <IconPhone size={20} />
            </span>
            <h3 className="text-[15px] font-bold text-white">Faites le point avec le service</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">Une fois la personne prise en charge, vous pouvez décrire ce qui s&apos;est passé pour recevoir les gestes de suivi et les rappels utiles.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <span className="icon-tile mb-3 h-10 w-10 bg-white/10 text-white">
              <IconUsers size={20} />
            </span>
            <h3 className="text-[15px] font-bold text-white">Le relais communautaire rappelle</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">Chaque cas escaladé a un délai de prise en charge suivi. En cas de dépassement, il remonte automatiquement au niveau supérieur.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <span className="icon-tile mb-3 h-10 w-10 bg-white/10 text-white">
              <IconAlert size={20} />
            </span>
            <h3 className="text-[15px] font-bold text-white">Signalez ce qui n&apos;a pas marché</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">
              Toute erreur de compréhension ou d&apos;orientation peut être signalée à{" "}
              <a href={`mailto:${SITE.contact.safety}`} className="underline">
                {SITE.contact.safety}
              </a>
              . Les signalements de sécurité sont traités en priorité.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <Note>
          Cette page est une information de santé publique générale. Elle ne remplace pas l&apos;avis d&apos;un professionnel de santé. Les listes de signes de danger sont issues des supports communautaires nationaux et internationaux et sont en cours de validation par le comité de revue clinique du programme. Voir{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance clinique
          </Link>{" "}
          et{" "}
          <Link href="/acces" className="link">
            comment joindre le service
          </Link>
          .
        </Note>
      </Section>
    </>
  );
}
