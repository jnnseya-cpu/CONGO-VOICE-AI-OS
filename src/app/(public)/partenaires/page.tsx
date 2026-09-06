import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Steps, Callout, Note, CtaBand } from "@client/components/public/ui";
import { IconBook, IconBriefcase, IconGlobe, IconGraduation, IconHeart, IconLanguage, IconPhone, IconSettings, IconUsers } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Partenaires et intégration",
  description:
    "Ce qu'apportent et ce que reçoivent ministères, ONG, bailleurs, opérateurs, écoles, universités et intégrateurs, et comment une organisation est intégrée.",
  alternates: { canonical: "/partenaires" },
  openGraph: {
    title: "Partenaires et intégration — CONGO VOICE AI OS",
    description: "Ministères, divisions provinciales, ONG, opérateurs mobiles, écoles, universités et intégrateurs : apports, contreparties et modalités d'intégration technique.",
    url: "/partenaires",
  },
};

const PARTNERS = [
  {
    title: "Ministères de la Santé, de l'Agriculture et de l'EPST",
    icon: <IconHeart size={22} />,
    tone: "health" as const,
    bring: [
      "L'autorité de contenu : approbation des protocoles cliniques, des scripts d'urgence, des calendriers culturaux, du registre des intrants et de la cartographie du programme scolaire.",
      "Les réseaux d'agents : relais communautaires, agents de vulgarisation, enseignants, qui reçoivent les cas escaladés.",
      "L'annuaire des structures de référence et les zones de santé, données sans lesquelles aucune orientation n'est fiable.",
      "L'engagement d'effectifs pour tenir les files d'attente ouvertes dans les territoires desservis.",
    ],
    get: [
      "Des tableaux de bord par province et par territoire sur la demande réelle, les risques qui montent et les délais de prise en charge.",
      "Des exports vérifiables, avec définition, période, dénominateur et règle de suppression des petits effectifs.",
      "Une remontée précoce des signaux de foyer épidémique ou de ravageur, avec validation humaine avant toute alerte.",
      "Un canal d'information de masse vers les citoyens, soumis au consentement enregistré de chaque destinataire.",
    ],
  },
  {
    title: "Divisions provinciales de la santé et zones de santé",
    icon: <IconUsers size={22} />,
    tone: "plain" as const,
    bring: [
      "La supervision des relais communautaires et l'arbitrage des cas qui dépassent le niveau du village.",
      "La validation locale de l'annuaire des structures et des circuits de référence.",
      "La connaissance du terrain qui permet de qualifier un signal statistique avant qu'il ne devienne une alerte.",
    ],
    get: [
      "La file d'attente de leur territoire, avec la profondeur de file, le cas le plus ancien et l'horloge de prise en charge.",
      "La remontée automatique d'un cas non pris en charge dans le délai, vers le niveau supérieur.",
      "Un résumé de chaque cas dans le sens de lecture d'un agent : ce qui a été dit, ce qui a été compris, la voie de protocole suivie et les règles déclenchées.",
    ],
  },
  {
    title: "ONG et bailleurs de fonds",
    icon: <IconBriefcase size={22} />,
    tone: "plain" as const,
    bring: [
      "Le financement d'un périmètre défini : une province, une filière, une cohorte d'apprenants.",
      "Des équipes de terrain, des campagnes et des dispositifs de suivi déjà en place.",
      "Des exigences de redevabilité qui obligent le programme à publier ses définitions et ses dénominateurs.",
    ],
    get: [
      "Une organisation dédiée à l'intérieur du programme, avec son périmètre géographique, ses files, ses rapports et son plafond de consommation.",
      "Des rapports d'impact anonymisés et des indicateurs exportables, réutilisables tels quels dans un rapport de bailleur.",
      "La ventilation de leur propre consommation d'intelligence artificielle, isolée à l'intérieur d'un programme partagé.",
    ],
  },
  {
    title: "Opérateurs mobiles et agrégateurs",
    icon: <IconPhone size={22} />,
    tone: "plain" as const,
    bring: [
      "Un numéro court national, la gratuité pour l'appelant et, quand c'est possible, l'exonération de données pour l'application web.",
      "Les passerelles USSD et SMS, indispensables pour servir les téléphones simples sans internet.",
      "La couverture et la qualité de transport, qui déterminent ce que le service peut promettre en zone rurale.",
    ],
    get: [
      "Un usage de service public à fort volume sur des canaux à faible coût unitaire.",
      "Une intégration standard par rappel signé, avec vérification de signature, journalisation et rejeu maîtrisé.",
      "Des statistiques de livraison par canal, utiles à l'exploitation des deux côtés.",
    ],
  },
  {
    title: "Écoles et réseaux scolaires",
    icon: <IconGraduation size={22} />,
    tone: "edu" as const,
    bring: [
      "Les enseignants référents qui reçoivent les demandes d'appui et les signalements de difficulté.",
      "La cohérence avec le programme officiel, les niveaux et les échéances d'examen.",
      "Le cadre de protection de l'enfance applicable dans l'établissement.",
    ],
    get: [
      "Un tableau de bord des lacunes d'apprentissage par classe et par notion, sans exposer les transcriptions des enfants.",
      "Des preuves d'apprentissage exploitables pour l'accompagnement individuel.",
      "Un appui aux parents qui ne peuvent pas suivre les devoirs, disponible en dehors des heures de classe.",
    ],
  },
  {
    title: "Centres d'appel et guichets assistés",
    icon: <IconPhone size={22} />,
    tone: "plain" as const,
    bring: [
      "Des opérateurs humains capables de reprendre un échange que le service a jugé trop incertain.",
      "Une amplitude horaire et une capacité de rappel que le service seul ne peut pas offrir.",
      "Un accompagnement de proximité pour les personnes qui ne peuvent ni lire ni écrire.",
    ],
    get: [
      "Des appels qui arrivent avec le contexte complet : enregistrement d'origine, transcription, traduction, niveau de risque, historique et statut de consentement.",
      "Une console assistée qui permet d'enregistrer un consentement pour la personne accompagnée, en déclarant explicitement qu'il s'agit d'une saisie assistée.",
      "Des files et des horloges de prise en charge partagées avec les autres acteurs du territoire.",
    ],
  },
  {
    title: "Universités, linguistes et locuteurs de référence",
    icon: <IconLanguage size={22} />,
    tone: "plain" as const,
    bring: [
      "La relecture par des locuteurs natifs : validation ou correction de ce que le système a entendu et de ce qu'il a compris.",
      "L'enrichissement d'un lexique de termes locaux, avec leur sens et leur domaine d'emploi.",
      "L'expertise dialectale nécessaire pour décider si une langue peut être ouverte dans un module.",
    ],
    get: [
      "Un corpus vivant de parole spontanée en lingala, kikongo, kiswahili et tshiluba, collecté sous consentement et dé-identifié.",
      "Des jeux de données exportables pour la recherche et pour la mise au point de modèles de parole.",
      "Une mesure continue de la qualité par langue, par module et par canal, publiée avec ses seuils.",
    ],
  },
  {
    title: "Intégrateurs techniques et développeurs",
    icon: <IconSettings size={22} />,
    tone: "plain" as const,
    bring: [
      "L'intégration avec les systèmes existants d'un ministère, d'une ONG ou d'un opérateur.",
      "Le développement de connecteurs, d'imports de données de référence et de tableaux de bord spécifiques.",
      "Des revues de sécurité et des tests indépendants.",
    ],
    get: [
      "Une interface de programmation documentée sous une racine versionnée, avec authentification, contrôle de permissions, limitation de débit et enveloppe d'erreur uniforme.",
      "Des rappels sortants signés pour les canaux, et une synchronisation hors ligne à écriture unique avec clé d'idempotence.",
      "La structure de la base de données et ses migrations dans le dépôt de code : ce qui est stocké est lisible avant même de signer.",
    ],
  },
];

const API_GROUPS: Array<[string, string]> = [
  ["Authentification et comptes", "Ouverture de session, session anonyme pour les citoyens, profil, authentification à deux facteurs pour les rôles privilégiés, création de comptes institutionnels."],
  ["Interactions", "Envoi d'un tour de conversation en texte ou en multipart avec audio et images, historique, détail d'un échange, retour du citoyen sur la qualité de la réponse."],
  ["Sessions de canal", "Service de conversation indépendant du canal, utilisé par le serveur vocal, WhatsApp, l'USSD, le SMS et l'application web : création, reprise, tours avec clé d'idempotence, flux d'événements."],
  ["Médias et parole", "Dépôt de fichiers, envoi reprenable, téléchargement contrôlé, synthèse vocale."],
  ["Cas et files d'attente", "File filtrée, création manuelle, espace de travail, machine à états complète : escalade, accusé de réception, transitions, affectations, corrections de gravité avec motif obligatoire, suivis, notes, fusion."],
  ["Notifications et rappels", "Boîte de réception, accusé de réception, diffusion à un rôle, rappels de vaccination, de consultation prénatale, de semis et de révision, soumis au consentement."],
  ["Analyse et rapports", "Tableau de bord de commandement, tableaux par module, alertes issues des données, exports en CSV, XLSX et PDF, travaux d'export asynchrones et définitions de rapports programmés."],
  ["Consommation", "Consommation en unités normalisées par période et par périmètre, coût par interaction, état des plafonds."],
  ["Connaissance et protocoles", "Recherche dans la base de connaissances approuvée, cycle de vie des protocoles, calendrier vaccinal, annuaire des structures de référence."],
  ["Agriculture", "Mercuriale, calendriers culturaux, prévisions météorologiques, foyers de propagation, registre des intrants."],
  ["Éducation", "Profil d'apprenant, questionnaires oraux, histoires, leçons, preuves d'apprentissage, plans de révision."],
  ["Apprentissage des langues", "File de relecture par locuteurs natifs, lexique, mesure de maîtrise par langue, export de jeux de données."],
  ["Consentement et vie privée", "Consentements par finalité, demandes d'accès et d'effacement avec échéance légale suivie."],
  ["Administration et système", "État de la plateforme par clé interne, statistiques d'usage et de coût, configuration, organisations, modèles de messages, accès exceptionnel tracé, journal d'audit, sondes de santé, exécution des tâches planifiées."],
];

export default function PartenairesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Partenariats"
        title="Un service public ne se construit pas seul : ce que chacun apporte, ce que chacun reçoit"
        lead="CONGO VOICE AI OS n'a de valeur que branché sur des institutions réelles : l'autorité qui approuve le contenu, les agents qui prennent en charge les cas, les opérateurs qui portent les appels, les écoles qui accompagnent les enfants, les linguistes qui corrigent la machine et les équipes techniques qui relient le tout aux systèmes existants. Cette page dit précisément ce qui est attendu de chaque partenaire et ce qu'il obtient en retour."
        meta={
          <>
            <span>{SITE.status}</span>
            <span aria-hidden="true">·</span>
            <span>Intégration par interface documentée et rappels signés</span>
            <span aria-hidden="true">·</span>
            <span>Structure de données publiée dans le dépôt</span>
          </>
        }
      />

      <Section tone="white" eyebrow="Par type de partenaire" title="Apports et contreparties, sans ambiguïté" lead="Aucun partenariat n'est purement déclaratif. Chaque ligne d'apport correspond à une donnée, un contenu approuvé, un effectif ou un accord sans lequel une partie du service ne peut pas être ouverte.">
        <div className="grid gap-4 lg:grid-cols-2">
          {PARTNERS.map((p) => (
            <article key={p.title} className="card flex flex-col p-5">
              <span className={`icon-tile mb-3 h-11 w-11 rounded-xl ${p.tone === "health" ? "bg-health-soft text-health" : p.tone === "edu" ? "bg-edu-soft text-edu" : "bg-brand-soft text-brand"}`}>{p.icon}</span>
              <h3 className="text-[16px] font-bold text-ink">{p.title}</h3>
              <p className="mt-3 text-[11.5px] font-bold uppercase tracking-wide text-muted">Ce qu&apos;ils apportent</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-ink-2">
                {p.bring.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-4 text-[11.5px] font-bold uppercase tracking-wide text-muted">Ce qu&apos;ils reçoivent</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-ink-2">
                {p.get.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="Mise en place" title="Comment une organisation entre dans le programme" lead="L'accueil d'un partenaire n'est pas un développement : c'est une configuration, qui suit toujours les mêmes étapes.">
        <Steps
          items={[
            { title: "Le programme et son périmètre", body: "Un programme est créé avec son plafond mensuel de consommation, la liste des modules ouverts et les langues ayant franchi leurs seuils de qualité. Les organisations partenaires y sont rattachées." },
            { title: "La géographie et les files", body: "Chaque organisation reçoit son périmètre de provinces et de territoires et ses compétences de routage. C'est ce périmètre qui détermine quels cas lui parviennent et quelles données elle peut voir." },
            { title: "Les rôles et les personnes", body: "Les comptes sont créés avec un rôle, une province et une organisation. Les rôles d'administration exigent une authentification à deux facteurs ; certaines actions sensibles exigent une vérification supplémentaire au moment de l'action." },
          ]}
        />
        <div className="mt-4">
          <Steps
            items={[
              { title: "Les agents de garde", body: "Chaque agent de terrain porte un indicateur de disponibilité. Le routage d'un cas tient compte du module, du territoire et de cette disponibilité : une file sans agent de garde est un défaut de sécurité, pas un simple retard." },
              { title: "Les messages et les consentements", body: "Les modèles de notification sont approuvés par canal et par langue, avec une variante à formulation neutre pour les sujets sensibles. Les scripts de consentement sont validés avant toute mise en service." },
              { title: "Les rapports et la revue", body: "Les définitions de rapports, leurs destinataires et leur périodicité sont fixées à l'ouverture, avec leur règle de suppression des petits effectifs. Une revue périodique porte sur la qualité, les délais et les corrections humaines." },
            ]}
          />
        </div>
      </Section>

      <Section tone="white" eyebrow="Engagements exigés" title="Ce que le programme demande à un partenaire, avant d'ouvrir un canal">
        <Callout tone="warn" title="Une escalade sans agent est pire que pas d'escalade">
          <p>
            Ouvrir un canal dans un territoire sans file d&apos;attente réellement tenue revient à promettre un secours qui n&apos;arrivera pas. Aucun canal n&apos;est ouvert dans un territoire tant que ces trois engagements ne sont pas pris.
          </p>
        </Callout>
        <div className="mt-6">
          <DataTable
            head={["Engagement", "Ce que cela signifie concrètement"]}
            rows={[
              ["Une file d'attente avec un responsable nommé", "Une personne redevable par module et par territoire, avec des agents identifiés, une amplitude horaire déclarée et un remplaçant."],
              ["Des délais de prise en charge tenus", "Quinze minutes pour une urgence, quatre heures pour un cas à consulter le jour même, vingt-quatre heures pour un cas à consulter sous un jour. Le dépassement est mesuré et remonte automatiquement."],
              ["Des scripts de consentement validés", "Le texte lu à la personne, dans sa langue, avec sa version enregistrée. Un agent qui recueille un consentement pour autrui doit le déclarer comme saisie assistée."],
              ["Une autorité de contenu identifiée", "Pour la santé, l'agriculture et l'éducation : la personne ou l'instance qui approuve, et dont le nom figure sur la version approuvée."],
              ["Un usage non punitif des tableaux de bord", "Les indicateurs servent à allouer des moyens, jamais à sanctionner un village, une famille, un apprenant ou un exploitant."],
            ]}
          />
        </div>
      </Section>

      <Section eyebrow="Intégration technique" title="Ce à quoi une équipe technique peut se brancher" lead="Toutes les fonctions sont exposées sous une racine versionnée, en HTTPS et en JSON, ou en multipart pour les médias. Chaque requête traverse le même chemin : authentification, contrôle de permissions, limitation de débit, journalisation, enveloppe d'erreur uniforme, puis écriture d'audit.">
        <DataTable head={["Groupe de fonctions", "Ce qu'il permet"]} rows={API_GROUPS.map((r) => [r[0], r[1]])} />
        <Prose>
          <h3>Rappels entrants pour les canaux</h3>
          <p>
            Les canaux téléphoniques et de messagerie n&apos;utilisent pas la session applicative&nbsp;: ils entrent par des points de rappel dont la signature est vérifiée. Sont pris en charge la messagerie WhatsApp — texte, notes vocales, images, vidéos et boutons —, le flux d&apos;appel vocal avec accueil multilingue, repli par touches, enregistrement, réponse parlée en segments et reprise d&apos;un appel interrompu, ainsi que l&apos;USSD à deux niveaux de menu et le SMS avec ses accusés de livraison.
          </p>
          <h3>Ce qui ne sort jamais de la plateforme</h3>
          <p>
            Aucune réponse d&apos;interface ne contient de nom de fournisseur d&apos;intelligence artificielle, de consigne système, de clé, de trace technique ni de requête de base de données. L&apos;historique d&apos;un échange est consultable&nbsp;; les mécanismes internes qui l&apos;ont produit ne le sont pas.
          </p>
          <h3>Hors ligne et reprise</h3>
          <p>
            Un client mobile ou un poste en zone mal couverte peut accumuler des événements localement et les renvoyer en une fois&nbsp;: l&apos;envoi est accepté une seule fois, avec une politique de conflit explicite. Les tours de conversation portent une clé d&apos;idempotence, ce qui rend un renvoi sans danger.
          </p>
        </Prose>
      </Section>

      <Section tone="navy" eyebrow="Ce que le programme ne fera pas" title="Les limites d'un partenariat">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Aucune vente, aucune cession commerciale et aucun courtage de données de citoyens, quelle que soit l'offre.",
            "Aucune mise en avant rémunérée d'un produit, d'un intrant, d'un établissement ou d'un service.",
            "Aucun accès d'un partenaire aux données d'un autre programme : le cloisonnement par organisation et par territoire est la règle.",
            "Aucun accès aux dossiers relevant de la protection des personnes en dehors du circuit restreint et des personnes habilitées.",
            "Aucune ouverture de langue ni de module en dessous de ses seuils de qualité, même à la demande d'un financeur.",
            "Aucun indicateur publié sans sa définition, sa période, son dénominateur et sa règle de suppression des petits effectifs.",
          ].map((item) => (
            <li key={item} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[13.5px] leading-relaxed text-white/85">
              <span className="mt-0.5 flex-none text-white/40" aria-hidden="true">
                —
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="white">
        <Cards cols={2}>
          <InfoCard title="Écrire au programme" icon={<IconGlobe size={22} />}>
            Les demandes de partenariat, de présentation institutionnelle et d&apos;intégration technique passent par{" "}
            <a href={`mailto:${SITE.contact.partnerships}`} className="link">
              {SITE.contact.partnerships}
            </a>
            .{!SITE.contactsActive && <> {SITE.contactsNote}</>}
          </InfoCard>
          <InfoCard title="Aller plus loin" icon={<IconBook size={22} />}>
            Voir{" "}
            <Link href="/gouvernance" className="link">
              les garde-fous de sécurité
            </Link>
            ,{" "}
            <Link href="/financement" className="link">
              le modèle de financement
            </Link>
            ,{" "}
            <Link href="/confidentialite" className="link">
              la protection des données
            </Link>{" "}
            et{" "}
            <Link href="/langues-nationales" className="link">
              la couverture par langue
            </Link>
            .
          </InfoCard>
        </Cards>
        <Note>
          Les provinces pilotes, les langues de démarrage, les accords avec les opérateurs et la répartition des effectifs d&apos;escalade sont des décisions de programme encore ouvertes. Elles conditionnent le calendrier d&apos;ouverture&nbsp;: la plateforme porte les cinq langues et les vingt-six provinces, mais chaque ouverture reste soumise à ses conditions de qualité et de personnel.
        </Note>
      </Section>

      <CtaBand
        title="Votre organisation peut-elle tenir une file d'attente dans son territoire ?"
        body="C'est la question déterminante. Le reste — périmètre, rôles, tableaux de bord, exports, intégration technique — se configure en quelques jours."
        primary={{ href: "/contact", label: "Ouvrir une discussion" }}
        secondary={{ href: "/services", label: "Voir les services" }}
      />
    </>
  );
}
