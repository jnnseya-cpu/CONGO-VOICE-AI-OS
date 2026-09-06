import type { Metadata } from "next";
import { commandStats } from "@server/ai/agents/reporting";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, KeyFacts, DataTable, Prose, CtaBand, Steps, Note } from "@client/components/public/ui";
import { IconGraduation, IconHeart, IconLeaf, IconMic, IconShield, IconUsers } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Le programme",
  description:
    "Pourquoi une infrastructure vocale nationale : le problème d'exclusion numérique en RDC, la réponse en cinq couches, la couverture linguistique, les résultats attendus et la feuille de route.",
  alternates: { canonical: "/programme" },
  openGraph: { title: "Le programme — CONGO VOICE AI OS", description: "Le problème, la réponse, la couverture et les résultats attendus du programme national d'inclusion numérique vocale.", url: "/programme" },
};

export const dynamic = "force-dynamic";

const CONSTRAINTS: Array<[string, string]> = [
  ["La majorité des ménages ruraux utilise un téléphone simple", "L'appel vocal et l'USSD sont obligatoires, pas optionnels"],
  ["Couverture 2G fréquente, 3G/4G irrégulière", "Audio compressé, application qui fonctionne hors ligne, file d'attente locale"],
  ["Électricité intermittente", "Sessions reprises là où elles se sont arrêtées, réponses courtes"],
  ["Faible littératie et faible confiance numérique", "La voix est l'interface principale ; aucun menu au-delà de deux niveaux"],
  ["Le mélange des langues est la norme", "Le traitement gère une phrase qui passe du lingala au français"],
  ["Les téléphones sont partagés dans le ménage", "L'identité n'est pas le numéro ; confirmation légère à chaque session"],
];

const LAYERS = [
  { title: "Couche canaux", body: "Appel vocal, WhatsApp, USSD, SMS, application web et guichet assisté. Une seule identité citoyenne quel que soit le canal." },
  { title: "Couche langue", body: "Détection de la langue, transcription, traduction, simplification et synthèse vocale pour cinq langues, y compris la parole mélangée." },
  { title: "Couche agents", body: "Des agents spécialisés — langue, santé, agriculture, éducation, risque, workflow, rapports, personnalisation — coordonnés par un orchestrateur déterministe." },
  { title: "Couche cas et suivi", body: "Escalade vers les relais communautaires, les agents agricoles et les enseignants, avec délais de prise en charge et relances." },
  { title: "Couche intelligence", body: "Tendances régionales, alerte précoce sur les épidémies et les ravageurs, lacunes d'apprentissage, tableaux de bord pour l'État et les ONG." },
];

export default async function ProgrammePage() {
  const stats = await commandStats().catch(() => null);
  const totalInteractions = stats?.totals.interactions ?? 0;
  const provinces = stats?.provinces.length ?? 0;

  return (
    <>
      <PageIntro
        eyebrow="Programme national"
        title="Un service public qui écoute, comprend et agit — dans la langue du citoyen"
        lead="Les services publics numériques supposent que le citoyen sait lire, écrire, chercher en ligne, utiliser une application et comprendre le français administratif. Des millions de Congolaises et de Congolais ne remplissent pas une ou plusieurs de ces conditions. CONGO VOICE AI OS inverse le modèle : le citoyen parle, le système comprend, oriente, escalade vers un humain, enregistre et apprend."
        meta={
          <>
            <span>{SITE.status}</span>
            <span aria-hidden="true">·</span>
            <span>Gratuit pour les citoyens</span>
            <span aria-hidden="true">·</span>
            <span>Financé par l&apos;État, les bailleurs et les ONG</span>
          </>
        }
      />

      <Section tone="white" eyebrow="Le problème" title="Trois services essentiels, hors de portée de ceux qui en ont le plus besoin" lead="La santé, l'agriculture et l'éducation sont les trois domaines où l'appui change le plus la vie d'un ménage. Ce sont aussi ceux dont l'accès numérique est le plus inégal. Chaque contrainte de terrain a été traduite en exigence technique.">
        <DataTable head={["Réalité de terrain", "Conséquence pour la conception"]} rows={CONSTRAINTS.map(([a, b]) => [a, b])} />
      </Section>

      <Section eyebrow="La réponse" title="Une infrastructure en cinq couches, pas une application de plus" lead="Le service n'est pas un agent conversationnel. C'est un système d'exploitation de service public : il écoute, comprend, classe, oriente, escalade, enregistre, apprend et donne aux institutions de quoi décider.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {LAYERS.map((l, i) => (
            <article key={l.title} className="card flex flex-col p-5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-brand">0{i + 1}</span>
              <h3 className="mt-2 text-[15px] font-bold text-ink">{l.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{l.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="white" eyebrow="Le parcours" title="Ce qui se passe quand une personne appelle">
        <Steps
          items={[
            { title: "Elle parle dans sa langue", body: "Aucun formulaire, aucun menu long. La personne décrit sa situation comme elle le dirait à un voisin, en lingala, kikongo, kiswahili, tshiluba ou français, même en mélangeant." },
            { title: "Le système comprend et répond", body: "La demande est transcrite, comprise et traitée par le service concerné. La réponse dit ce qui a été compris, le niveau de risque, ce qu'il faut faire, et le degré de certitude du système." },
            { title: "Un humain prend le relais si nécessaire", body: "Un signe de danger, un doute ou une demande explicite ouvre un cas assigné à un relais communautaire, un agent agricole ou un enseignant, avec un délai de prise en charge suivi." },
          ]}
        />
      </Section>

      <Section eyebrow="Chiffres de la plateforme" title="Ce que la plateforme a traité à ce jour" lead="Chiffres issus de l'environnement de démonstration en cours de préparation du pilote. Ils seront remplacés par les volumes réels dès l'ouverture dans les provinces pilotes, et publiés avec leur définition et leur dénominateur.">
        <KeyFacts
          items={[
            { value: String(totalInteractions), label: "Échanges traités", note: "Toutes langues et tous canaux confondus" },
            { value: String(provinces), label: "Provinces actives", note: "Sur les 26 provinces du pays" },
            { value: "5", label: "Langues servies", note: "Français, lingala, kikongo, kiswahili, tshiluba" },
            { value: "3", label: "Services", note: "Santé, agriculture, éducation" },
          ]}
        />
        <Note>
          Le programme publie ses indicateurs avec leur définition, leur période et leur règle de suppression des petits effectifs. La mesure de référence n&apos;est pas le nombre de messages, mais le nombre de démarches abouties&nbsp;: une orientation comprise, une escalade prise en charge, une action agricole engagée, une notion scolaire acquise.
        </Note>
      </Section>

      <Section tone="white" eyebrow="Les trois services" title="Santé, agriculture, éducation">
        <Cards>
          <InfoCard title="Santé communautaire" tone="health" icon={<IconHeart size={22} />} href="/services#sante">
            Orientation devant des symptômes, une grossesse, une maladie d&apos;enfant, la nutrition ou la vaccination. Détection des signes de danger et alerte d&apos;un relais communautaire. Le service n&apos;établit aucun diagnostic.
          </InfoCard>
          <InfoCard title="Agriculture et élevage" tone="agri" icon={<IconLeaf size={22} />} href="/services#agriculture">
            Diagnostic probable à partir d&apos;une description ou d&apos;une photo, actions gratuites ou peu coûteuses d&apos;abord, calendriers culturaux, météo, prix de marché et alerte des agents agricoles en cas de propagation.
          </InfoCard>
          <InfoCard title="Éducation" tone="edu" icon={<IconGraduation size={22} />} href="/services#education">
            Explications adaptées à la classe, lecture d&apos;histoires, exercices oraux, préparation du TENAFEP et de l&apos;Examen d&apos;État, et appui aux parents qui ne peuvent pas suivre les devoirs.
          </InfoCard>
        </Cards>
      </Section>

      <Section tone="navy" eyebrow="Limites assumées" title="Ce que le service ne fait pas" lead="Un service public doit être aussi clair sur ses limites que sur ses promesses. Ces limites sont inscrites dans le code, pas seulement dans la communication.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Il n'établit pas de diagnostic et ne prescrit aucun traitement soumis à ordonnance.",
            "Il ne remplace ni un médecin, ni un agronome, ni un enseignant.",
            "Ce n'est pas un service d'urgence : il oriente vers la structure de soins la plus proche.",
            "Il ne garantit aucun prix de marché : il indique la source, le marché et la date.",
            "Il ne recommande aucun produit chimique absent du registre des intrants autorisés.",
            "Il ne prend aucune décision d'éligibilité, de sanction ou de surveillance sur une personne.",
            "Il n'entraîne aucun modèle tiers sur des données identifiables sans consentement dédié.",
            "Il n'exige ni adresse e-mail, ni smartphone, ni lecture, ni connexion permanente.",
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

      <Section eyebrow="Bénéfices" title="Ce que le programme change, pour chacun">
        <Cards>
          <InfoCard title="Pour le citoyen" icon={<IconMic size={22} />}>
            Une réponse pratique dans sa langue, en quelques minutes, depuis n&apos;importe quel téléphone. Un humain joignable quand la situation est sérieuse. Aucun frais.
          </InfoCard>
          <InfoCard title="Pour les agents de terrain" icon={<IconUsers size={22} />}>
            Des cas qui arrivent avec le résumé, l&apos;enregistrement d&apos;origine, la traduction, le niveau de risque et l&apos;historique — au lieu d&apos;un appel sans contexte.
          </InfoCard>
          <InfoCard title="Pour les institutions" icon={<IconShield size={22} />}>
            Une vision par province de la demande réelle, des risques qui montent et des délais de prise en charge, avec des exports vérifiables pour les rapports de programme.
          </InfoCard>
        </Cards>
      </Section>

      <Section tone="white" eyebrow="Déploiement" title="Une montée en charge par étapes, derrière des seuils de qualité">
        <Prose>
          <p>
            Aucune langue n&apos;est ouverte dans un module tant qu&apos;elle n&apos;a pas franchi ses seuils de qualité — taux d&apos;erreur de transcription, exactitude d&apos;intention, et surtout rappel des situations d&apos;urgence en santé, où un faux négatif est inacceptable. Une langue qui repasse sous le seuil est automatiquement ramenée à un mode guidé, avec des messages enregistrés par des locuteurs natifs.
          </p>
          <ol>
            <li>
              <strong>Fondations</strong> — identité, sessions, journal d&apos;événements, passerelle IA, français et une langue nationale, WhatsApp et appel vocal.
            </li>
            <li>
              <strong>Modules et pilote</strong> — protocoles de santé, agriculture avec analyse d&apos;image, éducation, gestion des cas, escalade, tableau de bord national, dans deux provinces.
            </li>
            <li>
              <strong>Intelligence</strong> — score de risque, détection de foyers, moteur de rapports, boucle d&apos;apprentissage des langues, reconnaissance vocale adaptée aux langues peu dotées.
            </li>
            <li>
              <strong>Couche institutionnelle</strong> — accès multi-organisations, exports, USSD et SMS, suivi provincial étendu.
            </li>
            <li>
              <strong>Échelle nationale</strong> — hors ligne approfondi, intégration télécom, transfert vers centre d&apos;appel, interopérabilité santé, nœud de données hébergé au pays.
            </li>
          </ol>
        </Prose>
      </Section>

      <CtaBand
        title="Vous représentez un ministère, un bailleur ou une ONG ?"
        body="Le programme peut être présenté avec ses tableaux de bord, ses garde-fous de sécurité et son modèle de coût par interaction."
        primary={{ href: "/contact", label: "Demander une présentation" }}
        secondary={{ href: "/gouvernance", label: "Voir la gouvernance" }}
      />
    </>
  );
}
