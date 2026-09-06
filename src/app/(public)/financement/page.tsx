import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, KeyFacts, Note, CtaBand } from "@client/components/public/ui";
import { IconChart, IconDownload, IconGlobe, IconMessage, IconMic, IconUsers, IconVolume } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Financement et transparence",
  description:
    "Qui paie ce service public gratuit, ce qui est payé, comment la consommation d'IA est mesurée en unités auditables, quels plafonds protègent le budget et quels engagements de sortie sont pris.",
  alternates: { canonical: "/financement" },
  openGraph: {
    title: "Financement et transparence — CONGO VOICE AI OS",
    description: "Un bien public gratuit pour le citoyen : financement institutionnel, unité de consommation auditable, plafonds budgétaires et engagements de souveraineté.",
    url: "/financement",
  },
};

const STREAMS: Array<[string, string, string]> = [
  [
    "Licence institutionnelle de plateforme",
    "L'institution qui porte le programme : programme d'État, ministère ou bailleur.",
    "Le droit d'exploiter la plateforme pour une population et un ensemble de provinces définis, avec l'exploitation, la sécurité, la gouvernance et le support.",
  ],
  [
    "Consommation d'IA mesurée",
    "La même institution.",
    "Le travail d'intelligence artificielle réellement effectué : transcription, compréhension, explication, analyse d'image, synthèse vocale.",
  ],
  [
    "Téléphonie et messagerie",
    "La même institution, en répercussion directe.",
    "Minutes d'appel gratuites pour l'appelant, sessions USSD, lots de SMS, conversations WhatsApp. Ces tarifs sont fixés par les opérateurs, pas par la plateforme, et sont rapportés ligne à ligne.",
  ],
  [
    "Budgets de programme des bailleurs et ONG",
    "Les partenaires de développement.",
    "Un périmètre défini — une province, une filière, une cohorte — avec sa propre organisation, ses files d'attente, ses rapports et son plafond budgétaire.",
  ],
  [
    "Effectifs d'escalade humaine",
    "Les ministères et les organisations partenaires, sur leurs propres effectifs.",
    "Les relais communautaires, agents agricoles et enseignants qui reçoivent les cas. Ils appartiennent aux institutions ; le programme ne les emploie pas et ne les facture pas.",
  ],
];

const ACU: Array<[string, string, string]> = [
  ["Compréhension et rédaction", "Jetons d'entrée et de sortie", "1 unité pour 1 000 jetons, multipliée par le poids du modèle utilisé"],
  ["Analyse d'image", "Images, plus les jetons", "2 unités par image, plus la formule de compréhension"],
  ["Transcription de la parole", "Secondes d'audio", "0,5 unité par minute"],
  ["Synthèse vocale", "Caractères prononcés", "0,1 unité pour 1 000 caractères"],
  ["Traduction, détection de langue, indexation", "Jetons", "Même formule que la compréhension"],
];

const WEIGHTS: Array<[string, string]> = [
  ["Modèle de raisonnement le plus lourd", "Poids 3"],
  ["Modèle intermédiaire", "Poids 1,5"],
  ["Modèle rapide", "Poids 0,5"],
  ["Modèle très rapide", "Poids 0,3"],
  ["Modèle minimal", "Poids 0,2"],
  ["Fournisseur de règles hors ligne", "Poids 0,05"],
];

const DRIVERS = [
  { title: "Reconnaissance de la parole", icon: <IconMic size={22} />, body: "Facturée à la durée d'audio. C'est le premier poste d'un service vocal, et celui que fait baisser la mise au point d'un modèle sur les langues nationales à partir du corpus du programme." },
  { title: "Compréhension et rédaction", icon: <IconChart size={22} />, body: "Facturée au volume de texte traité, pondérée par le modèle choisi. Le routage vers un modèle plus léger quand la tâche le permet est le levier de coût le plus efficace." },
  { title: "Synthèse vocale", icon: <IconVolume size={22} />, body: "Facturée aux caractères prononcés. Sur l'application web, la voix du téléphone peut prendre le relais et le coût tombe à zéro." },
  { title: "Téléphonie et messagerie", icon: <IconMessage size={22} />, body: "Minutes d'appel, sessions USSD, SMS et conversations WhatsApp. Ce poste dépend des accords avec les opérateurs, pas du logiciel. L'USSD et le SMS coûtent un ordre de grandeur de moins que la voix." },
  { title: "Hébergement et stockage", icon: <IconGlobe size={22} />, body: "Serveurs, base de données et stockage des médias. Les durées de conservation courtes sur l'audio brut sont autant une mesure de protection des données qu'une mesure de coût." },
  { title: "Suivi humain", icon: <IconUsers size={22} />, body: "Les minutes des agents qui prennent en charge les cas escaladés. Ce poste appartient aux ministères et aux partenaires ; le tri déterministe et le routage vers la bonne file existent précisément pour le contenir." },
];

export default function FinancementPage() {
  return (
    <>
      <PageIntro
        eyebrow="Financement"
        title="Un bien public : gratuit pour le citoyen, financé par les institutions, mesuré à l'unité"
        lead="Le citoyen ne paie jamais, ne voit aucune publicité et n'est jamais l'objet d'une vente de données. Ce que coûte le service est payé par l'institution qui porte le programme, et cette institution doit pouvoir vérifier ce qu'elle paie dans une unité qu'elle comprend. La transparence des coûts n'est pas un supplément de communication : c'est une exigence de financement, affichée sur la même page que les résultats."
        meta={
          <>
            <span>{SITE.status}</span>
            <span aria-hidden="true">·</span>
            <span>Gratuit pour les citoyens</span>
            <span aria-hidden="true">·</span>
            <span>Tarification fixée par convention de programme</span>
          </>
        }
      />

      <Section tone="white" eyebrow="Principes" title="Cinq règles qui ne se négocient pas">
        <Prose>
          <ol>
            <li>
              <strong>Le citoyen ne paie jamais.</strong> Pas de porte-monnaie, pas d&apos;abonnement, pas d&apos;offre supérieure, pas de publicité, aucune incitation commerciale dans une réponse.
            </li>
            <li>
              <strong>Aucune donnée n&apos;est vendue et aucun classement n&apos;est payant.</strong> Il n&apos;existe ni courtage de données, ni enrichissement commercial, ni mise en avant rémunérée d&apos;un produit, d&apos;un intrant ou d&apos;un établissement. Ces traitements n&apos;existent pas dans la plateforme et ne doivent jamais y être ajoutés.
            </li>
            <li>
              <strong>Le financeur paie ce que le programme consomme</strong>, et peut voir exactement ce que c&apos;est, dans une unité qu&apos;il peut auditer.
            </li>
            <li>
              <strong>Un plafond budgétaire dégrade le confort, jamais la sécurité.</strong> Au plafond, l&apos;IA non urgente passe en mode scripté&nbsp;; le moteur de protocoles, la détection des signes de danger, le message d&apos;urgence et le circuit d&apos;escalade ne s&apos;éteignent jamais.
            </li>
            <li>
              <strong>La téléphonie et la messagerie sont répercutées et rapportées à part</strong>, parce qu&apos;elles sont fixées par les opérateurs et non par la plateforme.
            </li>
          </ol>
        </Prose>
      </Section>

      <Section eyebrow="Qui paie quoi" title="Les flux de financement, sans zone grise" lead="Chaque flux a un payeur nommé, un objet précis et un mode de rapport. Les montants, eux, relèvent de la convention de programme : ils ne sont pas publiés ici et ne sont pas fixés par la plateforme.">
        <DataTable head={["Flux", "Qui paie", "Ce que cela couvre"]} rows={STREAMS.map((r) => [r[0], r[1], r[2]])} />
      </Section>

      <Section tone="white" eyebrow="L'unité de mesure" title="Une seule unité de consommation, pas cinq grilles de fournisseurs" lead="Une unité de calcul normalisée ramène tout le travail d'intelligence artificielle — écouter, comprendre, expliquer, regarder une photo, parler — à un seul chiffre. L'institution budgète et plafonne dans cette unité au lieu de suivre cinq tarifications distinctes.">
        <DataTable head={["Tâche", "Ce qui est mesuré", "Conversion par défaut"]} rows={ACU.map((r) => [r[0], r[1], r[2]])} caption="Table de conversion par défaut. Elle est une configuration versionnée, modifiable sans nouveau déploiement, et le calcul est une fonction pure couverte par des tests unitaires." />
        <div className="mt-6">
          <DataTable head={["Classe de modèle", "Poids appliqué"]} rows={WEIGHTS.map((r) => [r[0], r[1]])} caption="Poids par classe de modèle : un modèle de raisonnement lourd coûte quinze fois un modèle minimal pour le même volume de texte. C'est le premier levier d'optimisation du programme." />
        </div>
        <Prose>
          <p>
            Chaque appel d&apos;intelligence artificielle laisse une ligne dans un registre&nbsp;: tâche, unités brutes mesurées, unités normalisées, module, langue, canal, organisation et horodatage. Un bailleur qui finance une province à l&apos;intérieur d&apos;un programme national voit sa propre consommation, isolée, sans avoir besoin d&apos;un système séparé.
          </p>
          <p>
            Une valeur monétaire indicative par unité existe dans la configuration&nbsp;: elle sert uniquement au calcul du coût par interaction affiché dans les tableaux de bord. La facture réelle est rapprochée des relevés des fournisseurs, avec un objectif de concordance de l&apos;ordre de deux pour cent inscrit dans la spécification du programme.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Plafonds" title="Ce qui se passe quand le budget d'un programme s'épuise" lead="Un plafond mensuel est fixé par programme. La consommation est comparée au plafond en continu, et les alertes partent avant l'épuisement, pas après.">
        <KeyFacts
          items={[
            { value: "80 %", label: "Première alerte", note: "Alerte aux administrateurs de la plateforme, une seule fois par seuil et par mois" },
            { value: "95 %", label: "Deuxième alerte", note: "Le programme dispose encore d'une marge pour arbitrer ou relever le plafond" },
            { value: "100 %", label: "Mode scripté", note: "L'IA non urgente s'arrête ; le service continue sur le texte approuvé" },
            { value: "0", label: "Garde-fou désactivé", note: "Aucun, à aucun moment, quel que soit le niveau de consommation" },
          ]}
        />
        <Callout tone="ok" title="Ce qui continue au plafond">
          <p>
            Le raccourci d&apos;urgence, la détection des signes de danger dans les cinq langues, le moteur de protocoles, l&apos;ouverture d&apos;un cas, l&apos;alerte d&apos;un humain et le message d&apos;urgence continuent de fonctionner à l&apos;identique. Ces chemins ne contiennent aucun appel de modèle&nbsp;: ils ne dépendent d&apos;aucun budget d&apos;intelligence artificielle. L&apos;ordre de dégradation prévu est explicite&nbsp;: d&apos;abord les résumés et analyses facultatifs, ensuite la richesse des explications, ensuite l&apos;analyse d&apos;images — jamais un garde-fou.
          </p>
        </Callout>
      </Section>

      <Section tone="white" eyebrow="Postes de coût" title="Ce que finance concrètement une province" lead="Les prix ne figurent pas sur cette page : ils dépendent des accords avec les opérateurs, des volumes et de la convention de programme. Ce qui peut être publié, en revanche, ce sont les postes eux-mêmes et les leviers qui les font bouger.">
        <Cards>
          {DRIVERS.map((d) => (
            <InfoCard key={d.title} title={d.title} icon={d.icon}>
              {d.body}
            </InfoCard>
          ))}
        </Cards>
        <Note>
          Un programme se dimensionne par un plafond mensuel, un périmètre de provinces et de territoires, une liste de modules ouverts, les langues ayant franchi leurs seuils de qualité, les définitions de rapports et leurs destinataires, l&apos;engagement d&apos;effectifs d&apos;escalade et le calendrier de conservation des données. Le prix unitaire et l&apos;enveloppe de licence sont des décisions contractuelles ouvertes&nbsp;: le mécanisme de mesure, lui, est construit et vérifiable.
        </Note>
      </Section>

      <Section eyebrow="La bonne mesure" title="Coût par démarche aboutie, pas coût par message" lead="Le coût par message est une métrique d'ingénieur. Elle descend mécaniquement avec le volume et ne dit rien de l'utilité du service.">
        <Prose>
          <p>La mesure de référence du programme rapporte l&apos;ensemble des coûts au nombre de démarches réellement abouties&nbsp;:</p>
          <ul>
            <li>au numérateur&nbsp;: la consommation d&apos;intelligence artificielle, la téléphonie et la messagerie répercutées, et les minutes humaines de suivi&nbsp;;</li>
            <li>au dénominateur&nbsp;: les démarches abouties sur la période.</li>
          </ul>
          <p>
            Une démarche aboutie exige une preuve, pas une réponse&nbsp;: une confirmation de compréhension ou d&apos;action suivante, une escalade effectivement prise en charge par un humain, ou un suivi enregistré — une orientation de santé suivie d&apos;effet, une intervention agricole réalisée, une notion scolaire acquise et démontrée.
          </p>
          <p>
            Les cibles de coût inscrites dans la spécification du programme sont exprimées par interaction aboutie et décroissent avec le volume&nbsp;: elles supposent un routage vers des modèles légers, un usage de l&apos;USSD et du SMS là où la voix n&apos;est pas nécessaire, et une part croissante de reconnaissance vocale mise au point sur les langues nationales. Elles sont affichées en continu à côté des résultats plutôt qu&apos;affirmées une fois pour toutes. La consommation d&apos;intelligence artificielle est mesurée en direct&nbsp;; la répercussion téléphonie est rapprochée des factures des opérateurs&nbsp;; la comptabilisation des minutes humaines est un développement prévu en phase 3 et n&apos;est pas encore automatisée.
          </p>
        </Prose>
      </Section>

      <Section tone="navy" eyebrow="Souveraineté" title="Engagements de sortie : ce que l'institution garde si elle s'en va">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Toutes les données du programme sont exportables : interactions, cas, dossiers de domaine, journaux d'audit, registre de consommation, corpus linguistique vérifié.",
            "Les formats sont ouverts et lisibles sans la plateforme : CSV, tableur et documents ; la structure de la base et ses migrations sont dans le dépôt de code.",
            "Aucun enfermement technique : base de données relationnelle standard, stockage d'objets standard, exécution Node. Aucun composant propriétaire dans le chemin de sécurité.",
            "Les fournisseurs d'intelligence artificielle sont interchangeables derrière une passerelle unique : en changer est un paramètre et un adaptateur, pas une réécriture.",
            "Le programme peut fonctionner entièrement sans fournisseur d'IA, en mode règles : les protocoles, les menus, les rappels, les cas et les rapports continuent.",
            "Le corpus linguistique collecté appartient au programme qui l'a financé. La position proposée est explicite : un corpus national ne doit jamais être privatisé. La rédaction contractuelle reste une décision ouverte.",
            "Résidence des données : hébergement primaire hors du pays aujourd'hui, pour la latence, avec un chemin documenté vers un nœud hébergé à Kinshasa. Le calendrier est une décision de programme, pas une contrainte technique.",
            "Le même socle peut porter le programme d'un autre pays sous sa propre identité nationale : seules les données de référence, les protocoles approuvés et les comités changent.",
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

      <Section tone="white" eyebrow="Durabilité" title="Ce qu'il advient du service si le financement s'arrête">
        <Cards cols={2}>
          <InfoCard title="Le service ne s'éteint pas" icon={<IconDownload size={22} />}>
            Sans budget d&apos;intelligence artificielle, la plateforme fonctionne en mode règles&nbsp;: arbres de protocoles, menus guidés, rappels, gestion des cas et rapports continuent de fonctionner. La qualité de compréhension baisse&nbsp;; l&apos;orientation et la sécurité restent.
          </InfoCard>
          <InfoCard title="Les leviers restent dans les mains du programme" icon={<IconChart size={22} />}>
            Composition des canaux, choix des modèles, seuils de plafond, périmètre des provinces et durées de conservation sont des paramètres. Un choc de prix chez un fournisseur se traite par un changement de configuration, pas par un arrêt de service.
          </InfoCard>
        </Cards>
        <Note>
          Les rapports de consommation, la définition de chaque indicateur et la règle de suppression des petits effectifs sont publiés avec les chiffres. Voir{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance
          </Link>
          ,{" "}
          <Link href="/partenaires" className="link">
            les modalités de partenariat
          </Link>{" "}
          et{" "}
          <Link href="/programme" className="link">
            le programme
          </Link>
          .
        </Note>
      </Section>

      <CtaBand
        title="Vous financez un programme et devez justifier chaque unité dépensée ?"
        body="Le relevé mensuel de consommation, la ventilation par module, par langue et par canal, et le modèle de coût par démarche aboutie peuvent être présentés avant tout engagement."
        primary={{ href: "/contact", label: "Demander le modèle de coût" }}
        secondary={{ href: "/partenaires", label: "Devenir partenaire" }}
      />
    </>
  );
}
