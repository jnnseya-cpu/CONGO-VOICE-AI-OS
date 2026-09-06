import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, DataTable, Prose, Callout, Cards, InfoCard, Faq, Note, CtaBand } from "@client/components/public/ui";
import { IconAlert, IconGraduation, IconHeart, IconShield, IconUser } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Protection des données",
  description:
    "Ce qui est collecté, pourquoi, sur quelle base légale, combien de temps, qui peut le voir, et comment exercer vos droits par la voix, par SMS ou par écrit.",
  alternates: { canonical: "/confidentialite" },
  openGraph: {
    title: "Protection des données — CONGO VOICE AI OS",
    description: "Notice de protection des données : catégories collectées, finalités, bases légales, durées de conservation, consentements par finalité et droits des personnes.",
    url: "/confidentialite",
  },
};

const LAST_UPDATED = "6 septembre 2026";

const DATA_MATRIX: Array<[string, string, string, string, string]> = [
  [
    "Identifiants de contact",
    "Vous reconnaître d'une session à l'autre et vous rappeler",
    "Consentement au service",
    "Le temps du compte ; effacés ou remplacés par un jeton irréversible sur demande d'effacement",
    "Vous, et l'agent qui traite votre cas",
  ],
  [
    "Enregistrements vocaux",
    "Transcrire ce que vous dites",
    "Consentement au service",
    "90 jours par défaut, paramétrable par programme",
    "Vous, l'agent qui traite votre cas, l'équipe technique en cas d'incident tracé",
  ],
  [
    "Transcriptions et traductions",
    "Comprendre la demande et permettre à un humain de reprendre le dossier",
    "Consentement au service",
    "Avec le dossier structuré correspondant ; effacées sur demande",
    "Vous et l'agent qui traite votre cas",
  ],
  [
    "Photos de cultures et d'animaux",
    "Identifier une maladie ou un ravageur probable",
    "Consentement au service",
    "12 mois",
    "Vous et l'agent agricole du territoire",
  ],
  [
    "Réponses de triage en santé",
    "Déterminer le niveau de gravité et la conduite à tenir",
    "Consentement explicite (donnée de santé)",
    "Selon la politique du ministère de tutelle ; effaçables sous réserve d'obligation légale",
    "Vous et le relais communautaire ou l'agent de santé saisi",
  ],
  [
    "État de grossesse",
    "Adapter l'orientation et les rappels",
    "Consentement explicite et distinct",
    "Selon la politique du ministère de tutelle",
    "Vous et l'agent de santé saisi",
  ],
  [
    "Profil d'apprenant et preuves d'apprentissage",
    "Adapter les explications au niveau et suivre les acquis",
    "Consentement explicite et distinct pour un profil enfant",
    "Selon la politique du ministère de tutelle",
    "L'apprenant, le parent ou le tuteur, l'enseignant référent",
  ],
  [
    "Localisation au niveau de la province et du territoire",
    "Orienter vers la structure la plus proche et produire des statistiques territoriales",
    "Consentement au service",
    "Avec le dossier correspondant",
    "Vous et l'agent du territoire ; en agrégé pour les institutions",
  ],
  [
    "Localisation précise",
    "Orienter avec plus d'exactitude",
    "Consentement distinct, refusable sans perdre le service",
    "Avec le dossier correspondant ; supprimée au retrait du consentement",
    "Vous et l'agent qui traite votre cas",
  ],
  [
    "Accusés de livraison des messages",
    "Savoir si un rappel ou une alerte vous est parvenu",
    "Consentement aux rappels, ou intérêt vital pour une alerte d'urgence",
    "12 mois",
    "L'exploitation du programme",
  ],
  [
    "Dossiers relevant de la protection des personnes",
    "Protéger une personne exposée à des violences, de l'exploitation ou un danger immédiat",
    "Intérêt vital et obligation de protection",
    "Selon la politique de protection applicable",
    "Uniquement les personnes habilitées, dans un espace restreint",
  ],
  [
    "Registre de consommation et journaux techniques",
    "Facturer le programme, exploiter et sécuriser le service",
    "Intérêt légitime de l'institution qui porte le programme",
    "Journaux de requêtes 90 jours, journaux d'usage 24 mois, registre de consommation 7 ans",
    "L'exploitation du programme et l'administration",
  ],
  [
    "Journal d'audit",
    "Prouver ce que le programme et ses agents ont fait",
    "Obligation légale et redevabilité",
    "Durée statutaire ; survit à une demande d'effacement",
    "Les rôles habilités à l'audit ; toute consultation est elle-même journalisée",
  ],
  [
    "Corpus linguistique vérifié",
    "Améliorer la compréhension des langues nationales",
    "Consentement distinct de recherche, refusable",
    "Selon la politique du programme ; l'échantillon est vidé de son texte à l'effacement",
    "Les relecteurs habilités ; export dé-identifié et tracé",
  ],
];

const CONSENTS: Array<[string, string, string]> = [
  ["Service", "Traiter votre demande, transcrire, comprendre, répondre et ouvrir un cas si nécessaire.", "Indispensable pour utiliser le service."],
  ["Rappels", "Vous envoyer des rappels de vaccination, de consultation prénatale, de semis ou de révision.", "Refusable. Le service fonctionne sans."],
  ["Localisation précise", "Affiner l'orientation vers une structure proche.", "Refusable. L'orientation se fait alors au niveau du territoire."],
  ["Analytique", "Compter et agréger l'usage pour piloter le programme.", "Refusable."],
  ["Recherche et amélioration des modèles", "Utiliser vos échanges, dé-identifiés, pour améliorer la compréhension des langues nationales.", "Refusable. Aucun modèle de tiers n'est entraîné sur vos données sans ce consentement."],
  ["Partage avec un partenaire", "Permettre à une organisation partenaire nommée d'accéder à votre dossier dans le cadre du programme.", "Refusable."],
  ["Orientation entre programmes", "Transmettre votre cas d'un programme à un autre lorsqu'il relève d'un autre service.", "Refusable."],
  ["Données de grossesse", "Adapter l'orientation, les rappels et le niveau de vigilance.", "Refusable, avec un consentement explicite et séparé."],
  ["Profil enfant", "Créer un profil d'apprenant et suivre les acquis d'un enfant.", "Refusable, avec un consentement explicite et séparé."],
];

export default function ConfidentialitePage() {
  return (
    <>
      <PageIntro
        eyebrow="Protection des données"
        title="Ce que le service sait de vous, pourquoi, pendant combien de temps, et ce que vous pouvez exiger"
        lead="Cette notice est écrite pour être comprise, pas pour être opposée. Elle décrit ce que la plateforme enregistre réellement, la raison de chaque enregistrement, la durée pendant laquelle il est conservé, les personnes qui peuvent le consulter, et les moyens dont vous disposez pour refuser, retirer, obtenir une copie ou faire effacer vos données — par la voix, par SMS ou par écrit, sans savoir lire ni écrire."
        meta={
          <>
            <span>Dernière mise à jour&nbsp;: {LAST_UPDATED}</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.status}</span>
            <span aria-hidden="true">·</span>
            <span>Version en cours de revue avec l&apos;autorité nationale</span>
          </>
        }
      />

      <Section tone="white">
        <Callout tone="info" title="Statut de cette notice">
          <p>
            Cette notice décrit la conception et le fonctionnement de la plateforme tels qu&apos;ils sont aujourd&apos;hui. Elle est en cours de revue avec l&apos;autorité nationale compétente et avec les ministères concernés avant l&apos;ouverture publique. Le responsable de traitement doit être désigné avant tout lancement&nbsp;: sa désignation est une condition de lancement du programme, au même titre que l&apos;analyse d&apos;impact relative à la protection des données et le calendrier de conservation.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Qui traite vos données" title="Responsable de traitement et sous-traitant">
        <Prose>
          <p>
            <strong>Responsable de traitement.</strong> L&apos;institution publique qui porte le programme dans votre province — un ministère ou le programme national — détermine les finalités et les moyens du traitement. Sa désignation formelle est un préalable au lancement&nbsp;: tant qu&apos;elle n&apos;est pas publiée, aucun déploiement public n&apos;est autorisé.
          </p>
          <p>
            <strong>Sous-traitant.</strong> {SITE.operator} exploite la plateforme pour le compte de cette institution, sur instruction documentée, dans le cadre d&apos;un contrat de sous-traitance qui doit être signé avant toute mise en service.
          </p>
          <h3>Cadre juridique applicable</h3>
          <ul>
            <li>
              <strong>République Démocratique du Congo</strong> — Ordonnance-loi n°&nbsp;23/010 du 13&nbsp;mars 2023 portant Code du numérique, qui régit le traitement des données à caractère personnel sur le territoire national. Les données de santé y relèvent d&apos;une protection renforcée et d&apos;un consentement explicite. Une revue juridique est en cours pour confirmer l&apos;ensemble des obligations, y compris toute formalité auprès de l&apos;autorité nationale.
            </li>
            <li>
              <strong>Royaume-Uni</strong> — l&apos;entité exploitante étant établie au Royaume-Uni, le régime britannique de protection des données s&apos;applique à son activité de sous-traitant&nbsp;: contrat de sous-traitance, registre des traitements et analyse d&apos;impact sont requis.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Le détail" title="Ce qui est collecté, pour quoi faire, et combien de temps" lead="Ce tableau est la référence. Tout ce qui n'y figure pas n'est pas collecté.">
        <DataTable
          head={["Donnée", "Finalité", "Base", "Conservation", "Qui peut la voir"]}
          rows={DATA_MATRIX.map((r) => [r[0], r[1], r[2], r[3], r[4]])}
          caption="Chaque durée est paramétrable par programme et par domaine ; une mesure de conservation judiciaire peut suspendre une suppression, avec une autorité et une échéance visibles."
        />
        <Note>
          Ne sont <strong>jamais</strong> collectés&nbsp;: données de carte bancaire, données biométriques d&apos;identification, opinions politiques, religieuses ou syndicales, orientation sexuelle. Il n&apos;existe dans la plateforme aucun traitement de publicité, de profilage commercial, de courtage de données ni d&apos;enrichissement auprès de tiers, et ces traitements ne doivent jamais y être ajoutés.
        </Note>
      </Section>

      <Section eyebrow="Vos choix" title="Neuf consentements séparés, refusables un par un" lead="Le consentement n'est pas une case unique à cocher au début. Chaque finalité est demandée séparément, dans votre langue, avec la version du texte qui vous a été lu, la méthode utilisée — voix, touche, USSD ou saisie par un agent — et, si quelqu'un répond pour vous, la raison pour laquelle il le fait.">
        <DataTable head={["Finalité", "Ce qu'elle autorise", "Peut-on la refuser ?"]} rows={CONSENTS.map((r) => [r[0], r[1], r[2]])} />
        <Prose>
          <p>
            Un consentement est un événement, jamais une valeur écrasée&nbsp;: accorder puis retirer laisse deux enregistrements horodatés, ce qui permet de savoir à tout moment ce qui était autorisé au moment d&apos;un traitement. Le consentement est revérifié à l&apos;instant de l&apos;envoi pour chaque rappel et chaque message de masse&nbsp;: retirer le consentement aux rappels annule immédiatement ceux qui étaient déjà programmés.
          </p>
          <p>
            Refuser une finalité facultative ne vous prive jamais du service de base&nbsp;: vous pouvez toujours poser votre question, obtenir une orientation et être mis en relation avec un humain.
          </p>
          <p>
            La capture d&apos;une preuve enregistrée du consentement vocal est un développement prévu&nbsp;: aujourd&apos;hui, la version du script, la langue, la méthode et l&apos;horodatage sont enregistrés, mais l&apos;enregistrement audio de la phrase de consentement ne l&apos;est pas systématiquement.
          </p>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Protections renforcées" title="Santé, enfants et situations de danger">
        <Cards>
          <InfoCard title="Données de santé" tone="health" icon={<IconHeart size={22} />}>
            Consentement explicite et distinct pour la grossesse et pour un profil d&apos;enfant. Les publications agrégées appliquent une règle de suppression des petits effectifs afin d&apos;empêcher toute ré-identification.{" "}
            <strong>Une exception assumée&nbsp;:</strong> l&apos;alerte devant un signe de danger fonctionne quel que soit l&apos;état des consentements. Refuser d&apos;avertir quelqu&apos;un d&apos;une urgence ne serait pas une protection de sa vie privée.
          </InfoCard>
          <InfoCard title="Enfants" tone="edu" icon={<IconGraduation size={22} />}>
            Aucun nom de famille et aucun identifiant scolaire pour un apprenant mineur, sauf accord formel avec l&apos;établissement. Un parcours de consentement parental existe pour les rappels. Les contenus sont filtrés avant tout enseignement, sans aucune incitation commerciale. Les résumés destinés aux parents et aux enseignants ne reprennent pas mot pour mot ce que l&apos;enfant a dit.
          </InfoCard>
          <InfoCard title="Protection des personnes" tone="danger" icon={<IconAlert size={22} />}>
            Une divulgation de violence, d&apos;abus, d&apos;exploitation ou de pensées suicidaires ouvre un dossier restreint&nbsp;: accès limité aux personnes habilitées, aucun détail dans les notifications ordinaires, aucune apparition dans les exports ni dans les tableaux de bord.
          </InfoCard>
        </Cards>
      </Section>

      <Section eyebrow="Minimisation" title="Ce qui est retiré avant que la donnée ne circule">
        <Prose>
          <ul>
            <li>
              <strong>Aucun identifiant n&apos;accompagne un appel à un fournisseur d&apos;intelligence artificielle.</strong> Le fournisseur reçoit un extrait audio, un texte pseudonymisé ou une image dont les métadonnées ont été retirées. Ni nom, ni numéro, ni identifiant de dossier. Le lien avec une personne n&apos;existe qu&apos;à l&apos;intérieur de la plateforme.
            </li>
            <li>
              <strong>Les journaux techniques sont expurgés à l&apos;écriture.</strong> Numéros de téléphone, adresses électroniques, jetons d&apos;identité, identifiants et noms introduits par une formule de politesse sont remplacés automatiquement avant qu&apos;une ligne ne soit écrite. Les journaux ne remplacent jamais le journal d&apos;audit et ne contiennent pas de contenu personnel.
            </li>
            <li>
              <strong>Les statistiques sont pseudonymisées à la frontière analytique</strong>, et les effectifs trop petits sont masqués plutôt que publiés. Le seuil renforcé prévu sous le niveau de la zone de santé est implémenté et testé&nbsp;; son câblage complet dans les tableaux de bord de santé reste à finir, et il conditionne toute publication à ce niveau de détail.
            </li>
            <li>
              <strong>Les messages sensibles ont une formulation neutre.</strong> Un message qui peut s&apos;afficher sur un écran verrouillé, sur un téléphone partagé, ne révèle jamais l&apos;objet du dossier.
            </li>
            <li>
              <strong>Le téléphone n&apos;est pas votre identité.</strong> Les téléphones sont partagés&nbsp;; aucune conclusion de santé n&apos;est enregistrée dans un profil réutilisé d&apos;une session à l&apos;autre. La personnalisation ne retient que la langue, la province, les sujets récents et les derniers résumés.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Vos droits" title="Ce que vous pouvez demander, et comment">
        <DataTable
          head={["Droit", "Ce que vous obtenez", "Délai"]}
          rows={[
            ["Accès", "Une copie de tout ce que la plateforme détient sur vous : vos échanges, vos cas, vos consentements, vos messages, vos fichiers et vos dossiers de domaine.", "30 jours"],
            ["Rectification", "La correction d'une information inexacte vous concernant.", "30 jours"],
            ["Effacement", "La suppression des médias et le remplacement de ce qui vous identifie par un jeton irréversible. Le journal d'audit est conservé : il ne contient aucune donnée personnelle en texte libre et prouve ce que le programme a fait.", "30 jours"],
            ["Opposition", "L'arrêt d'un traitement facultatif vous concernant.", "30 jours"],
            ["Retrait d'un consentement", "L'arrêt immédiat de la finalité concernée, y compris des rappels déjà programmés.", "Immédiat"],
            ["Réclamation", "La saisine de l'autorité nationale de protection des données, sans passer d'abord par le programme.", "—"],
          ]}
        />
        <Prose>
          <h3>Comment exercer un droit sans savoir écrire</h3>
          <ul>
            <li>
              <strong>Par la voix</strong>&nbsp;: dites-le au service pendant un appel ou dans une note vocale. La demande est enregistrée avec sa méthode et son échéance.
            </li>
            <li>
              <strong>Par SMS ou par USSD</strong>&nbsp;: la même demande peut être ouverte depuis un téléphone simple, sans internet.
            </li>
            <li>
              <strong>Par un agent</strong>&nbsp;: un relais communautaire, un agent agricole ou un enseignant référent peut ouvrir la demande pour vous. Il doit alors déclarer qu&apos;il agit pour votre compte.
            </li>
            <li>
              <strong>Par écrit</strong>&nbsp;: à{" "}
              <a href={`mailto:${SITE.contact.dataProtection}`} className="link">
                {SITE.contact.dataProtection}
              </a>
              .{!SITE.contactsActive && <> {SITE.contactsNote}</>}
            </li>
          </ul>
          <p>
            Chaque demande ouvre un dossier avec une échéance de trente jours, suivie automatiquement&nbsp;: une demande en retard est signalée aux responsables. Les demandes d&apos;accès et d&apos;effacement suivent un circuit outillé de bout en bout&nbsp;; la rectification et l&apos;opposition sont traitées par l&apos;équipe de protection des données, dans le même délai.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Sécurité" title="Comment vos données sont protégées">
        <Cards cols={2}>
          <InfoCard title="Accès" icon={<IconUser size={22} />}>
            Chaque rôle ne dispose que des permissions strictement nécessaires, et les agents de terrain ne voient que les cas de leur module et de leur territoire. Les rôles d&apos;administration exigent une authentification à deux facteurs, et certaines actions sensibles — correction d&apos;une gravité, export identifiant, accès exceptionnel — exigent une vérification supplémentaire au moment de l&apos;action. Tout accès exceptionnel est limité dans le temps, justifié, révocable et signalé.
          </InfoCard>
          <InfoCard title="Traçabilité" icon={<IconShield size={22} />}>
            Toute action privilégiée écrit une ligne d&apos;audit chaînée par empreinte&nbsp;: une modification, une suppression ou une insertion rétroactive est détectée par une vérification quotidienne. La consultation du journal est elle-même journalisée. Les échanges sont chiffrés en transport, les secrets ne figurent jamais dans l&apos;image applicative, et les sauvegardes sont testées en restauration.
          </InfoCard>
        </Cards>
        <Note>
          Le cloisonnement au niveau des lignes de la base de données est aujourd&apos;hui appliqué par l&apos;application et non par le moteur de base de données&nbsp;; son renforcement est le point de sécurité ouvert le plus important du programme et il est prévu en phase 3. Le chiffrement au niveau du champ pour les données les plus sensibles est également prévu.
        </Note>
      </Section>

      <Section tone="white" eyebrow="Destinataires" title="À qui vos données peuvent parvenir">
        <DataTable
          head={["Catégorie de destinataire", "Ce qu'il reçoit", "Ce qu'il ne reçoit jamais"]}
          rows={[
            ["Fournisseurs d'intelligence artificielle (transcription, compréhension, analyse d'image, synthèse vocale)", "Un extrait audio, un texte pseudonymisé, une image sans métadonnées, ou le texte à prononcer.", "Votre nom, votre numéro, votre identifiant de dossier, votre historique."],
            ["Opérateurs de téléphonie et de messagerie", "Le numéro de destination et le texte du message, strict minimum pour livrer.", "Le contenu de votre dossier ; les sujets sensibles sont formulés de manière neutre."],
            ["Hébergement et stockage", "Les données chiffrées en transport, dans la région d'hébergement du programme.", "Aucun accès applicatif aux dossiers."],
            ["Service de prévision météorologique", "Le centre géographique d'une province.", "Votre position, jamais."],
            ["Ministères, ONG et bailleurs", "Des chiffres agrégés, avec définition, période, dénominateur et suppression des petits effectifs ; les cas nominatifs uniquement dans le territoire et le module qui les concernent.", "Les dossiers relevant de la protection des personnes ; les données d'un autre programme."],
          ]}
        />
        <Prose>
          <p>
            Le programme ne s&apos;engage sur aucun nom de fournisseur&nbsp;: les fournisseurs sont interchangeables derrière une passerelle unique, et la liste effective de ceux qui sont activés à un instant donné est documentée et annexée au contrat de sous-traitance, avec les garanties applicables aux transferts hors du pays. Cette liste est communicable sur demande à{" "}
            <a href={`mailto:${SITE.contact.dataProtection}`} className="link">
              {SITE.contact.dataProtection}
            </a>
            .
          </p>
          <p>
            L&apos;hébergement primaire se situe aujourd&apos;hui hors du pays, pour des raisons de latence, avec un chemin documenté vers un nœud hébergé à Kinshasa. Le calendrier de ce transfert est une décision de programme.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Incidents" title="En cas de violation de données">
        <Prose>
          <p>
            Une violation de données suit une procédure écrite&nbsp;: détection — pic d&apos;erreurs, taux d&apos;échec d&apos;un fournisseur, rupture de la chaîne d&apos;audit, alerte d&apos;urgence non prise en charge, demande d&apos;exercice de droits en retard —, confinement, évaluation de la nature et du volume des données concernées à partir de l&apos;identifiant de trace, notification, rétablissement puis retour d&apos;expérience.
          </p>
          <p>
            Le programme se conforme à une obligation de notification dans les <strong>soixante-douze heures</strong> à l&apos;autorité compétente, et informe les personnes concernées lorsque la violation présente un risque élevé pour leurs droits. Le responsable de traitement désigné et le responsable sécurité sont alertés automatiquement en cas de rupture de la chaîne d&apos;audit ou de demande d&apos;exercice de droits dépassée.
          </p>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Questions fréquentes" title="Ce que les gens demandent le plus souvent">
        <Faq
          items={[
            { q: "Le service peut-il me reconnaître si j'utilise le téléphone de quelqu'un d'autre ?", a: <p>Le téléphone n&apos;est pas votre identité. Une confirmation légère est demandée en début de session, et aucune conclusion de santé n&apos;est enregistrée dans un profil réutilisable. C&apos;est une protection délibérée, parce que les téléphones sont partagés dans beaucoup de ménages.</p> },
            { q: "Est-ce que mes conversations servent à entraîner une intelligence artificielle ?", a: <p>Pas sans votre accord distinct de recherche. Même avec cet accord, l&apos;export du corpus est dé-identifié et tracé, et aucun ajustement de modèle n&apos;est automatique. Sans cet accord, vos échanges ne quittent pas la plateforme à cette fin.</p> },
            { q: "Puis-je utiliser le service sans donner mon nom ?", a: <p>Oui. Une session anonyme est possible, et aucune adresse électronique ni aucun téléphone intelligent ne sont exigés.</p> },
            { q: "Si je demande l'effacement, tout disparaît-il vraiment ?", a: <p>Les médias sont supprimés, les textes libres sont vidés et ce qui vous identifie est remplacé par un jeton irréversible. Restent le journal d&apos;audit — qui ne contient aucun texte personnel et prouve ce que le programme a fait — et les statistiques dé-identifiées, qui ne permettent plus de remonter jusqu&apos;à vous.</p> },
            { q: "Mon employeur, mon chef de village ou mon école peuvent-ils voir mes questions ?", a: <p>Non. L&apos;accès est limité au rôle, au module et au territoire, et les tableaux de bord ne montrent que des agrégats avec suppression des petits effectifs. Les tableaux de bord ne doivent jamais servir à sanctionner un village, une famille, un apprenant ou un exploitant.</p> },
            { q: "Que se passe-t-il si je parle de violences ?", a: <p>Le service ne promet jamais le secret. Il vous croit, ne demande aucun détail, et prévient une personne formée à la protection. Le dossier est restreint dès son ouverture&nbsp;: aucun détail ne circule dans les notifications ordinaires ni dans les exports.</p> },
          ]}
        />
      </Section>

      <Section>
        <Note>
          Dernière mise à jour&nbsp;: {LAST_UPDATED}. Cette notice est en cours de revue avec l&apos;autorité nationale compétente et les ministères de tutelle avant l&apos;ouverture publique&nbsp;; elle sera republiée avec la désignation du responsable de traitement, le calendrier de conservation arrêté par domaine et la liste des sous-traitants effectivement activés. Voir aussi{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance et la sécurité
          </Link>
          ,{" "}
          <Link href="/conditions" className="link">
            les conditions d&apos;utilisation
          </Link>{" "}
          et{" "}
          <Link href="/aide" className="link">
            les questions fréquentes
          </Link>
          .
        </Note>
      </Section>

      <CtaBand
        title="Une question sur vos données, ou une demande à formuler ?"
        body="Vous pouvez demander une copie de vos données, leur correction ou leur effacement — par la voix, par SMS, par l'intermédiaire d'un agent, ou par écrit."
        primary={{ href: "/contact", label: "Contacter le programme" }}
        secondary={{ href: "/acces", label: "Comment joindre le service" }}
      />
    </>
  );
}
