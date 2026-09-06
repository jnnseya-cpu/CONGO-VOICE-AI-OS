import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, Steps, Note, CtaBand } from "@client/components/public/ui";
import { IconCheck, IconMic, IconPhone, IconUsers, IconVolume } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Déclaration d'accessibilité",
  description:
    "Objectif WCAG 2.2 AA : ce qui est déjà en place, ce qui ne l'est pas encore, l'accessibilité des canaux sans internet et comment signaler un obstacle.",
  alternates: { canonical: "/accessibilite" },
  openGraph: {
    title: "Déclaration d'accessibilité — CONGO VOICE AI OS",
    description: "Auto-déclaration en attente d'audit : objectif WCAG 2.2 AA, conception vocale pour faible littératie, canaux sans internet et voie d'assistance humaine.",
    url: "/accessibilite",
  },
};

const LAST_UPDATED = "6 septembre 2026";

const DONE: Array<[string, string]> = [
  ["La voix comme interface principale", "Parler est le mode d'entrée par défaut. Aucune démarche n'exige de savoir lire ni écrire : la question est posée oralement, la réponse est prononcée à voix haute dans la langue de la personne."],
  ["Une action grande et unique", "L'écran principal propose une action dominante plutôt qu'un ensemble de commandes concurrentes. Aucun menu ne dépasse deux niveaux de profondeur, sur aucun canal."],
  ["Fonctionnement au clavier", "L'ensemble des interfaces web s'utilise sans souris. Un lien d'évitement placé en tête de page permet d'atteindre directement le contenu."],
  ["Focus visible", "L'élément qui a le focus est signalé par un contour net et permanent, sans dépendre du survol ni de la couleur seule."],
  ["Contraste et taille", "Le texte et les éléments d'interface visent un contraste conforme au niveau AA, avec des cibles tactiles larges pensées pour un usage debout, en extérieur et à une main."],
  ["Aucun statut par la couleur seule", "Un niveau de risque, un état de cas ou une alerte s'accompagnent toujours d'un mot et, le cas échéant, d'un pictogramme. La couleur renforce l'information, elle ne la porte jamais seule."],
  ["Alternatives textuelles", "Les pictogrammes purement décoratifs sont masqués aux technologies d'assistance ; les images porteuses d'information sont accompagnées d'un texte."],
  ["Transcription de chaque échange vocal", "Ce que le service a entendu, ce qu'il a compris et ce qu'il répond sont consultables sous forme de texte, ce qui rend le service utilisable par une personne sourde ou malentendante et vérifiable par la personne elle-même."],
  ["Utilisable sans téléphone intelligent", "L'appel vocal et l'USSD couvrent les téléphones les plus simples. Ni application à installer, ni adresse électronique, ni connexion permanente ne sont exigés."],
  ["Fonctionnement en 2G et hors ligne", "L'audio est compressé, l'application web fonctionne une fois ouverte sans réseau, et les notes vocales comme les photos attendent dans le téléphone puis repartent seules, sans doublon."],
  ["Reprise d'une session interrompue", "Une coupure de courant, un crédit épuisé ou un appel coupé ne font pas recommencer depuis le début : la conversation reprend là où elle s'était arrêtée."],
  ["Débit de parole ralenti et interruption possible", "La lecture vocale est prononcée à un débit volontairement ralenti et peut être arrêtée à tout moment par la personne."],
];

const NOT_DONE: Array<[string, string]> = [
  ["Audit externe formel", "Aucun audit d'accessibilité par un tiers indépendant n'a encore été réalisé. Cette page est donc une auto-déclaration, prévue pour être remplacée par une déclaration adossée à un audit."],
  ["Tableaux complexes sur petit écran", "Plusieurs tableaux institutionnels — matrice de données, tableau de bord, relevés de consommation — restent difficiles à parcourir sur un écran étroit malgré le défilement horizontal. Une présentation alternative en liste est à produire."],
  ["Tests complets avec lecteurs d'écran", "Les interfaces ont été conçues pour un usage au clavier et avec un lecteur d'écran, mais un cycle de tests complet avec les lecteurs d'écran les plus répandus, dans les cinq langues, n'a pas encore été mené."],
  ["Langue des signes", "Aucun contenu en langue des signes n'est aujourd'hui proposé. La demande a été identifiée mais n'est pas encore programmée."],
  ["Réglage fin de la vitesse de lecture", "La vitesse de restitution vocale est fixée par le service et ne peut pas encore être réglée par la personne."],
  ["Tests d'usage en faible littératie", "Le protocole d'évaluation prévoit des tests avec au moins trente citoyens par province pilote, avec un objectif de réussite des tâches. Ces tests sont un livrable de terrain qui n'a pas encore eu lieu."],
];

const CHANNELS: Array<[string, string]> = [
  ["Appel vocal", "Accueil parlé, choix de langue proposé oralement, repli par les touches du clavier si la parole n'est pas comprise, réponse prononcée en segments courts, reprise d'un appel interrompu."],
  ["USSD", "Menu de deux niveaux au maximum, sans internet, sur n'importe quel téléphone. La réponse détaillée arrive ensuite par message."],
  ["SMS", "Réponses et rappels en texte court. Les messages qui touchent à un sujet sensible sont formulés de manière neutre, pour rester lisibles sur un écran verrouillé et sur un téléphone partagé."],
  ["WhatsApp", "Notes vocales, photos et messages. Utile pour montrer une plante, une plaie ou un carnet plutôt que de le décrire."],
  ["Application web", "Installable, utilisable hors ligne une fois ouverte, avec file d'attente locale. Conçue pour un appareil d'entrée de gamme et une connexion instable."],
  ["Guichet assisté", "Un agent formé conduit l'échange pour une personne qui ne peut pas utiliser le service seule, et le déclare explicitement comme saisie assistée."],
];

export default function AccessibilitePage() {
  return (
    <>
      <PageIntro
        eyebrow="Accessibilité"
        title="Un service conçu pour être utilisé par quelqu'un qui ne sait ni lire ni écrire"
        lead="L'accessibilité n'est pas un correctif appliqué à la fin : c'est la raison d'être du programme. Un service public qui exige de savoir lire, de posséder un téléphone intelligent et de disposer d'une connexion permanente exclut précisément les personnes qu'il devrait servir. Cette déclaration dit ce qui est en place, ce qui ne l'est pas encore, et comment nous signaler un obstacle."
        meta={
          <>
            <span>Objectif&nbsp;: WCAG 2.2 niveau AA</span>
            <span aria-hidden="true">·</span>
            <span>Auto-déclaration, en attente d&apos;audit externe</span>
            <span aria-hidden="true">·</span>
            <span>Dernière mise à jour&nbsp;: {LAST_UPDATED}</span>
          </>
        }
      />

      <Section tone="white">
        <Callout tone="warn" title="Statut de conformité : partiellement conforme, non audité">
          <p>
            L&apos;objectif retenu pour l&apos;application citoyenne et pour les interfaces des agents est le niveau AA des règles pour l&apos;accessibilité des contenus web, version 2.2. Ce niveau est une cible de conception appliquée dans le code&nbsp;; il n&apos;a pas encore été vérifié par un audit externe indépendant. Cette page est donc une <strong>auto-déclaration</strong>. Elle sera remplacée par une déclaration adossée à un audit et à un plan de correction daté.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Ce qui est en place" title="Les mesures déjà appliquées" lead="Chacune de ces mesures est vérifiable dans le service tel qu'il fonctionne aujourd'hui.">
        <DataTable head={["Mesure", "Ce qu'elle change pour la personne"]} rows={DONE.map((r) => [r[0], r[1]])} />
      </Section>

      <Section tone="white" eyebrow="Ce qui ne l'est pas" title="Les limites connues, dites franchement" lead="Publier des limites connues vaut mieux qu'annoncer une conformité qui n'a pas été vérifiée. Chacun de ces points est ouvert et suivi.">
        <DataTable head={["Limite", "État"]} rows={NOT_DONE.map((r) => [r[0], r[1]])} />
      </Section>

      <Section eyebrow="Canaux non web" title="L'accessibilité ne s'arrête pas au navigateur" lead="La plupart des personnes que le programme sert n'ouvriront jamais une page web. Les mêmes exigences s'appliquent donc au téléphone, à l'USSD et au SMS.">
        <DataTable head={["Canal", "Ce qui est prévu pour l'accessibilité"]} rows={CHANNELS.map((r) => [r[0], r[1]])} />
        <Note>
          Les numéros d&apos;accès sont en cours d&apos;attribution avec les opérateurs. Voir{" "}
          <Link href="/acces" className="link">
            comment joindre le service
          </Link>{" "}
          pour l&apos;état de chaque canal.
        </Note>
      </Section>

      <Section tone="white" eyebrow="Assistance" title="Si vous ne pouvez pas utiliser le service seul">
        <Cards>
          <InfoCard title="Par la voix, simplement" icon={<IconMic size={22} />}>
            Décrivez votre situation comme vous le diriez à un voisin, dans votre langue, même en mélangeant deux langues. Il n&apos;y a ni formulaire à remplir, ni mot exact à trouver, ni orthographe à respecter.
          </InfoCard>
          <InfoCard title="Par une personne de confiance" icon={<IconUsers size={22} />}>
            Un membre de la famille, un voisin, un relais communautaire, un agent agricole ou un enseignant référent peut conduire l&apos;échange pour vous. La console assistée permet de le faire en déclarant qu&apos;il s&apos;agit d&apos;une saisie pour le compte d&apos;une autre personne.
          </InfoCard>
          <InfoCard title="Par un téléphone simple" icon={<IconPhone size={22} />}>
            L&apos;appel vocal et l&apos;USSD fonctionnent sur les téléphones les plus basiques, sans internet et sans installation. Une réponse détaillée peut ensuite arriver par message.
          </InfoCard>
        </Cards>
      </Section>

      <Section eyebrow="Signaler un obstacle" title="Ce que nous faisons de votre signalement">
        <Steps
          items={[
            { title: "Vous décrivez le problème", body: "Dites simplement ce que vous vouliez faire, ce qui s'est passé, sur quel canal et avec quel appareil. Un signalement oral, par SMS ou par un agent a exactement la même valeur qu'un signalement écrit." },
            { title: "Nous répondons sous quinze jours ouvrables", body: "Nous accusons réception, nous disons si l'obstacle est confirmé, et nous indiquons soit la correction prévue, soit la solution de contournement immédiate qui vous permet d'obtenir le service en attendant." },
            { title: "Vous pouvez saisir l'autorité", body: "Si la réponse ne vous satisfait pas, vous pouvez saisir l'autorité nationale compétente. Le programme ne se substitue à aucun recours." },
          ]}
        />
        <Prose>
          <p>
            Les signalements d&apos;accessibilité s&apos;adressent à{" "}
            <a href={`mailto:${SITE.contact.general}`} className="link">
              {SITE.contact.general}
            </a>
            . Un obstacle qui empêche une personne d&apos;obtenir une orientation en situation d&apos;urgence est traité comme un incident de sécurité et adressé à{" "}
            <a href={`mailto:${SITE.contact.safety}`} className="link">
              {SITE.contact.safety}
            </a>
            .{!SITE.contactsActive && <> {SITE.contactsNote}</>}
          </p>
        </Prose>
      </Section>

      <Section tone="navy" eyebrow="Notre engagement">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <span className="icon-tile mb-3 h-10 w-10 bg-white/10 text-white">
              <IconCheck size={20} />
            </span>
            <h3 className="text-[15px] font-bold text-white">Un audit avant l&apos;échelle nationale</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">Un audit d&apos;accessibilité par un tiers indépendant et des tests d&apos;usage en faible littératie figurent parmi les conditions posées avant l&apos;élargissement du service au-delà des provinces pilotes.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <span className="icon-tile mb-3 h-10 w-10 bg-white/10 text-white">
              <IconVolume size={20} />
            </span>
            <h3 className="text-[15px] font-bold text-white">Aucune langue ouverte sous son seuil</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">Une langue qui n&apos;atteint pas ses seuils de qualité n&apos;est pas ouverte, et une langue qui repasse sous son seuil est ramenée à un mode guidé avec des messages enregistrés par des locuteurs natifs.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <span className="icon-tile mb-3 h-10 w-10 bg-white/10 text-white">
              <IconUsers size={20} />
            </span>
            <h3 className="text-[15px] font-bold text-white">Une voie humaine, toujours</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">Quand le service ne comprend pas, il ne s&apos;obstine pas&nbsp;: il ouvre un cas et une personne rappelle. L&apos;incompréhension du système ne doit jamais devenir le problème du citoyen.</p>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <Note>
          Déclaration établie le {LAST_UPDATED} sur la base d&apos;une évaluation interne du service tel qu&apos;il fonctionne à cette date. Elle sera révisée à chaque évolution significative des interfaces et remplacée après le premier audit externe. Voir aussi{" "}
          <Link href="/langues-nationales" className="link">
            la couverture par langue
          </Link>
          ,{" "}
          <Link href="/acces" className="link">
            les canaux d&apos;accès
          </Link>{" "}
          et{" "}
          <Link href="/aide" className="link">
            les questions fréquentes
          </Link>
          .
        </Note>
      </Section>

      <CtaBand
        title="Un obstacle vous empêche d'utiliser le service ?"
        body="Signalez-le, oralement ou par écrit. Nous répondons sous quinze jours ouvrables et indiquons une solution de contournement immédiate quand la correction demande du temps."
        primary={{ href: "/contact", label: "Signaler un obstacle" }}
        secondary={{ href: "/acces", label: "Voir les canaux d'accès" }}
      />
    </>
  );
}
