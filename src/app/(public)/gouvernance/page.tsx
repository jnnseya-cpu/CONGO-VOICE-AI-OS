import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, Steps, Note, CtaBand } from "@client/components/public/ui";
import { IconAlert, IconCheck, IconFile, IconShield, IconSparkle, IconUsers } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Sécurité et gouvernance",
  description:
    "Règles déterministes versionnées, gravité décidée hors du modèle, sources approuvées obligatoires, supervision humaine, comités de revue et journal d'audit vérifié.",
  alternates: { canonical: "/gouvernance" },
  openGraph: {
    title: "Sécurité et gouvernance — CONGO VOICE AI OS",
    description: "Règles déterministes, revue clinique, supervision humaine, ancrage documentaire et journal d'audit vérifiable.",
    url: "/gouvernance",
  },
};

const DECISIONS: Array<[string, string, string]> = [
  [
    "Niveau de gravité 0 à 4 d'une situation de santé",
    "Le moteur de protocoles : un arbre de décision versionné, écrit en JSON, relu et rejoué à l'identique. Aucun modèle de langage n'intervient.",
    "Identifiant et version du protocole, réponses collectées, identifiants des règles déclenchées, niveau retenu, délai d'action.",
  ],
  [
    "Abaisser une gravité déjà décidée",
    "Uniquement une personne habilitée. Le système, lui, ne peut jamais abaisser : les autres signaux ne font que relever le niveau.",
    "Valeur proposée par le système, valeur retenue par la personne, motif écrit obligatoire, auteur, horodatage, ligne d'audit chaînée.",
  ],
  [
    "Escalader vers un humain",
    "Des règles de risque déterministes : gravité, confiance basse sur un cas de santé, absence de source, divulgation de violence, demande explicite du citoyen.",
    "Cas ouvert, file d'attente responsable, motif d'escalade, horloge de prise en charge.",
  ],
  [
    "Contenu d'un conseil de santé ou d'agriculture",
    "Les documents de référence approuvés, sélectionnés avant la génération. Le modèle explique, il n'invente pas la recommandation.",
    "Identifiants des documents cités ; en l'absence de source approuvée, un événement de violation de contrat et le texte de repli servi à la place.",
  ],
  [
    "Message d'urgence prononcé au citoyen",
    "Un texte fixe, écrit et traduit à l'avance dans les cinq langues. Il ne passe par aucun modèle.",
    "Interaction, langue, heure, alerte envoyée au relais communautaire, cas de gravité maximale.",
  ],
  [
    "Ouverture d'un dossier de protection",
    "Des règles de détection dans les cinq langues, complétées par le signalement d'un agent. Le dossier est restreint dès son ouverture.",
    "Catégorie, caractère mineur ou non, rôle propriétaire, statut, notes en accès restreint. Aucun détail ne circule dans les notifications ordinaires.",
  ],
  [
    "Consommation d'intelligence artificielle",
    "La passerelle IA, seul point du système qui appelle un fournisseur.",
    "Tâche, unités mesurées, unités de calcul normalisées, module, langue, canal, organisation, horodatage.",
  ],
  [
    "Accord ou retrait d'un consentement",
    "La personne concernée, ou l'agent qui l'assiste et qui doit le déclarer comme tel.",
    "Finalité, sens de la décision, version du script lu, langue, méthode, contexte de représentation, horodatage.",
  ],
  [
    "Effacement des données d'une personne",
    "La personne demande ; un administrateur exécute, dans le délai légal de trente jours.",
    "Demande, échéance, exécution, jeton de remplacement non réversible. Le journal d'audit, lui, est conservé : il prouve ce que le programme a fait.",
  ],
];

const SEVERITY: Array<[string, string, string]> = [
  ["0 — auto-prise en charge", "Conseils à domicile, aucune consultation nécessaire", "Pas d'horloge"],
  ["1 — surveillance à domicile", "Surveiller, revenir si les signes changent", "72 heures"],
  ["2 — centre de santé sous 24 heures", "Consultation dans la journée qui suit", "24 heures"],
  ["3 — centre de santé aujourd'hui", "Consultation le jour même", "4 heures"],
  ["4 — urgence immédiate", "Départ immédiat, message d'urgence, alerte d'un relais", "15 minutes"],
];

const DEGRADED: Array<[string, string]> = [
  ["Un fournisseur d'IA tombe", "La passerelle passe au suivant dans la chaîne, avec la même requête. Le citoyen ne voit rien."],
  ["Tous les fournisseurs d'IA tombent", "Le fournisseur de règles hors ligne prend le relais : les arbres de protocoles tournent, les explications viennent du texte approuvé, chaque réponse porte un signal de confiance basse."],
  ["La reconnaissance vocale est indisponible", "Passage au mode écrit ou au menu guidé par touches, sur USSD ou par serveur vocal."],
  ["Le plafond mensuel d'un programme est atteint", "L'IA non urgente bascule en mode scripté. Les garde-fous ne s'éteignent jamais."],
  ["Le téléphone du citoyen est hors ligne", "Les notes vocales et les photos attendent dans le téléphone et repartent seules, sans doublon, au retour du réseau."],
  ["Un canal de notification tombe", "Bascule WhatsApp vers SMS puis vers appel vocal, avec relances et événements de livraison."],
];

const BOARDS = [
  { title: "Comité de revue clinique", body: "Approuve chaque version de protocole, chaque script d'urgence, chaque document de santé et chaque consigne de rédaction. Aucun contenu de santé ne part en production sans sa validation." },
  { title: "Comité de protection de l'enfance et d'éducation", body: "Approuve les filtres de contenu destinés aux enfants, le circuit de protection et les résumés transmis aux parents et aux enseignants." },
  { title: "Comité de contenu agricole", body: "Valide les calendriers culturaux, le registre des intrants autorisés, la liste des maladies à déclaration et les seuils d'alerte de propagation." },
  { title: "Comité d'inclusion linguistique", body: "Fixe les seuils de qualité par langue et par canal, valide les corrections des locuteurs natifs et peut ramener une langue en mode guidé." },
  { title: "Comité d'éthique des données", body: "Examine les finalités, les durées de conservation, les règles d'agrégation et tout nouveau flux de données sortant de la plateforme." },
  { title: "Comité de risque modèle", body: "Suit le taux de violations de contrat, le taux de correction humaine, les résultats des campagnes adverses et peut exiger un retour arrière." },
];

export default function GouvernancePage() {
  return (
    <>
      <PageIntro
        eyebrow="Gouvernance"
        title="La sécurité n'est pas confiée au modèle : elle est écrite dans le code"
        lead="Un service public qui parle de santé à des millions de personnes ne peut pas reposer sur la bonne volonté d'un modèle génératif. Dans CONGO VOICE AI OS, ce qui protège une personne — la détection des signes de danger, le niveau de gravité, le déclenchement d'une escalade, le texte d'urgence — relève de règles écrites, versionnées, testées et rejouables. Le modèle sert à comprendre, à expliquer et à résumer. Il ne décide pas."
        meta={
          <>
            <span>{SITE.status}</span>
            <span aria-hidden="true">·</span>
            <span>Comités de revue en cours de constitution</span>
            <span aria-hidden="true">·</span>
            <span>Journal d&apos;audit vérifié chaque jour</span>
          </>
        }
      />

      <Section tone="white" eyebrow="Principe de séparation" title="Deux systèmes, deux rôles, aucune confusion" lead="La distinction n'est pas rhétorique : elle correspond à deux parties distinctes du logiciel, écrites, testées et déployées séparément.">
        <Cards cols={2}>
          <InfoCard title="Ce que décident les règles" tone="health" icon={<IconShield size={22} />}>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>La détection des signes de danger, par mots-clés, dans les cinq langues, avant tout appel à un modèle.</li>
              <li>Le niveau de gravité de 0 à 4, calculé par un arbre de décision versionné à partir des réponses recueillies.</li>
              <li>Le déclenchement d&apos;un drapeau rouge, qui interrompt l&apos;arbre et impose immédiatement la gravité maximale.</li>
              <li>L&apos;obligation d&apos;escalader, la file d&apos;attente destinataire et le délai de prise en charge.</li>
              <li>Le texte d&apos;urgence et les consignes de route, fixes et traduits à l&apos;avance.</li>
              <li>Le refus de toute formulation de diagnostic ou de posologie dans la réponse finale.</li>
            </ul>
          </InfoCard>
          <InfoCard title="Ce que fait l'intelligence artificielle générative" tone="edu" icon={<IconSparkle size={22} />}>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Transcrire la parole, reconnaître la langue et gérer les phrases qui mélangent deux langues.</li>
              <li>Extraire ce qui a été dit — symptômes, durées, âge — pour alimenter l&apos;arbre de décision.</li>
              <li>Expliquer, dans la langue de la personne, une décision qui est déjà prise et figée.</li>
              <li>Résumer l&apos;échange pour l&apos;agent qui rappellera.</li>
              <li>Décrire ce qu&apos;une photo de culture ou d&apos;animal montre, à charge pour les règles d&apos;en tirer les conséquences.</li>
            </ul>
          </InfoCard>
        </Cards>
        <Callout tone="warn" title="La règle la plus importante du système">
          <p>
            Le modèle ne peut <strong>jamais</strong> abaisser une gravité décidée par les règles. Les autres signaux — grossesse, nourrisson, confiance basse, divulgation de violence, absence de source — ne peuvent que la relever. Seule une personne habilitée peut abaisser un niveau, et uniquement en écrivant un motif, qui est enregistré avec la valeur d&apos;origine, son nom et l&apos;heure.
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Chaîne de responsabilité" title="Qui décide quoi, et ce qui en reste" lead="Chaque décision du système a un responsable désigné et une trace. Ce tableau est la référence utilisée pour les revues et les audits.">
        <DataTable head={["Décision", "Qui décide", "Ce qui est enregistré"]} rows={DECISIONS.map((r) => [r[0], r[1], r[2]])} />
      </Section>

      <Section tone="white" eyebrow="Échelle de gravité" title="Cinq niveaux, une conduite à tenir, une horloge" lead="Le niveau est calculé par le moteur de protocoles. Il détermine ce qui est dit au citoyen, la file d'attente saisie et le délai dans lequel un humain doit avoir pris le cas en charge.">
        <DataTable head={["Niveau", "Conduite à tenir", "Délai de prise en charge"]} rows={SEVERITY.map((r) => [r[0], r[1], r[2]])} />
        <Note>
          Les listes de signes de danger et la conduite à tenir sont publiées côté citoyen sur{" "}
          <Link href="/urgence" className="link">
            la page urgence
          </Link>
          , dans les cinq langues et dans les mots exacts que le service prononce.
        </Note>
      </Section>

      <Section eyebrow="Ancrage documentaire" title="Aucun conseil sans source approuvée">
        <Prose>
          <p>
            Toute recommandation de santé ou d&apos;agriculture doit citer au moins un document de la base de connaissances approuvée, ou l&apos;identifiant du protocole dont elle découle. Les documents sont des fichiers versionnés portant leur autorité d&apos;origine, leur version, leur zone géographique, leur niveau de preuve, leur approbateur et leur date de revue ; ils sont chargés avec une empreinte, et seuls ceux dont le statut est «&nbsp;approuvé&nbsp;» peuvent être retrouvés par le service.
          </p>
          <p>
            La recherche documentaire s&apos;exécute <strong>avant</strong> la rédaction, et elle est orientée vers les documents sur lesquels le protocole lui-même est bâti. Les identifiants annoncés par le modèle sont ensuite revérifiés en base&nbsp;: un identifiant qui n&apos;existe pas ou qui n&apos;est pas approuvé est écarté.
          </p>
          <p>
            Si, après cette vérification, il ne reste aucune source&nbsp;:
          </p>
          <ul>
            <li>la réponse rédigée est remplacée par un texte de repli, qui oriente vers le centre de santé et n&apos;affirme rien&nbsp;;</li>
            <li>un événement de violation de contrat est enregistré avec le protocole, sa version, le niveau de gravité et les identifiants revendiqués&nbsp;;</li>
            <li>la revue humaine devient obligatoire et le niveau de gravité ne peut pas rester en dessous du seuil de consultation.</li>
          </ul>
          <p>
            Le même filet existe pour les formulations interdites&nbsp;: toute phrase qui pose un diagnostic ou qui donne une posologie chiffrée est retirée de la réponse, et la coupure est enregistrée.
          </p>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Protection des personnes" title="Ce qui se passe quand quelqu'un révèle des violences" lead="Violences physiques ou sexuelles, exploitation, négligence, pensées suicidaires, foyer dangereux, mariage forcé : ces divulgations suivent un circuit distinct, restreint, qui ne passe pas par les files d'attente ordinaires.">
        <Steps
          items={[
            { title: "La divulgation est reconnue", body: "Des listes de formulations dans les cinq langues, volontairement larges, complétées par le signalement du modèle. La détection ne dépend d'aucun fournisseur." },
            { title: "La réponse est écrite d'avance", body: "Le service croit la personne, ne promet jamais le secret, ne demande aucun détail, et nomme l'aide qui existe. Le texte est fixe, traduit et relu ; il n'est jamais généré." },
            { title: "Le dossier est restreint dès l'ouverture", body: "Catégorie, caractère mineur, rôle propriétaire et notes protégées. Les notifications ordinaires ne portent qu'une mention neutre, sans aucun détail." },
          ]}
        />
        <Prose>
          <p>
            Une divulgation impose une revue humaine quelle que soit la gravité clinique, et relève le niveau de risque au minimum au seuil «&nbsp;consultation le jour même&nbsp;». Les catégories de danger immédiat — auto-agression, violence sexuelle, foyer dangereux — sont traitées comme une urgence de santé et déclenchent le circuit d&apos;urgence complet.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Supervision humaine" title="Ce qui amène systématiquement une personne dans la boucle">
        <Cards>
          <InfoCard title="La gravité" icon={<IconAlert size={22} />} tone="danger">
            Tout cas de niveau 2 ou plus ouvre un cas assigné à une file d&apos;attente responsable, avec une horloge de prise en charge et une remontée automatique en cas de dépassement.
          </InfoCard>
          <InfoCard title="Le doute" icon={<IconUsers size={22} />}>
            Une confiance basse sur un échange de santé ne reste jamais classée en risque faible&nbsp;: elle est relevée et un humain regarde. Un cas de santé mal compris est un cas à revoir, pas un cas à clore.
          </InfoCard>
          <InfoCard title="Le blocage" icon={<IconShield size={22} />}>
            Absence de source approuvée, contenu interdit filtré, sortie qui ne respecte pas le contrat attendu&nbsp;: la réponse rédigée n&apos;est pas servie telle quelle et la revue humaine est exigée.
          </InfoCard>
          <InfoCard title="La demande du citoyen" icon={<IconCheck size={22} />}>
            Demander à parler à quelqu&apos;un suffit. Aucune justification n&apos;est requise, aucun parcours de rétention n&apos;est opposé.
          </InfoCard>
          <InfoCard title="La maladie à déclaration" icon={<IconFile size={22} />} tone="health">
            Certaines situations de santé ou d&apos;élevage figurent sur une liste à déclaration obligatoire&nbsp;: elles sont remontées même si le niveau de gravité individuel est bas.
          </InfoCard>
          <InfoCard title="La protection" icon={<IconAlert size={22} />} tone="danger">
            Toute divulgation relevant de la protection des personnes ouvre un dossier restreint et appelle une personne formée, indépendamment de l&apos;évaluation clinique.
          </InfoCard>
        </Cards>
      </Section>

      <Section tone="white" eyebrow="Incertitude" title="Un vecteur de confiance, pas un score opaque" lead="Un chiffre unique donne l'illusion de la précision et cache l'endroit où le système a réellement douté.">
        <Prose>
          <p>
            Chaque échange conserve plusieurs dimensions de confiance distinctes plutôt qu&apos;une note globale&nbsp;: la qualité de la transcription, l&apos;identification de la langue, la reconnaissance de l&apos;intention, la solidité des éléments recueillis et la couverture documentaire de la question posée. Elles sont stockées avec l&apos;interaction et visibles par l&apos;agent qui reprend le cas.
          </p>
          <p>
            C&apos;est la dimension la plus faible, et non la moyenne, qui gouverne le comportement du système. Une transcription douteuse suffit à faire relever le risque d&apos;un échange de santé, même si tout le reste semble clair. Aucune de ces valeurs n&apos;est jamais présentée au citoyen comme une probabilité clinique&nbsp;: le service dit ce qu&apos;il a compris et à quel point il en est sûr, pas ce dont la personne souffre.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Comités de revue" title="Six comités, et rien de médical sans validation clinique" lead="La structure de données qui enregistre leurs décisions existe déjà — statuts de cycle de vie, approbateur nommé, date d'approbation, version. La constitution des comités est une tâche de programme, préalable au lancement public.">
        <Cards>
          {BOARDS.map((b) => (
            <InfoCard key={b.title} title={b.title}>
              {b.body}
            </InfoCard>
          ))}
        </Cards>
        <Callout tone="warn" title="État réel aujourd'hui">
          <p>
            Les versions de protocoles enregistrées portent la mention d&apos;un approbateur en attente, et non le nom d&apos;une personne. Aucun protocole de santé ne doit atteindre la production tant qu&apos;un responsable clinique nommé ne figure pas dans cette colonne. C&apos;est l&apos;une des conditions de lancement du programme, au même titre que la désignation d&apos;un responsable de traitement, d&apos;un référent protection de l&apos;enfance et d&apos;une autorité de contenu agricole.
          </p>
        </Callout>
      </Section>

      <Section tone="white" eyebrow="Publication" title="Ce qu'il faut franchir pour changer une règle, une consigne ou un modèle">
        <Prose>
          <ol>
            <li>
              <strong>Évaluation hors ligne</strong> — la suite de tests complète s&apos;exécute sans aucune clé d&apos;interface, sur une base de données réelle en mémoire, avec le fournisseur de règles hors ligne. La couverture des règles de sécurité est intégrale&nbsp;: chaque question atteignable, chaque branche parcourue, chaque drapeau rouge menant bien à la gravité maximale.
            </li>
            <li>
              <strong>Régression de sécurité et campagnes adverses</strong> — demandes d&apos;automédication dangereuse, mésusage de pesticides, fausse réassurance devant une urgence, sources fabriquées, injection de consignes, contenus inappropriés pour un enfant. Un manqué sur un cas de gravité maximale bloque la publication.
            </li>
            <li>
              <strong>Validation par un relecteur de langue</strong> — un locuteur natif valide les formulations avant toute mise en service dans sa langue.
            </li>
            <li>
              <strong>Coût, latence et revue de vie privée</strong> — la revue de vie privée est obligatoire dès qu&apos;un flux de données change.
            </li>
            <li>
              <strong>Déploiement progressif puis retour arrière</strong> — mise en service par paliers avec surveillance des garde-fous et possibilité de revenir en arrière.
            </li>
          </ol>
          <p>
            Les statuts de cycle de vie et l&apos;enregistrement des campagnes d&apos;évaluation sont en place&nbsp;; un protocole en brouillon ou retiré est refusé au chargement. Le déploiement par paliers automatisé et le retour arrière automatique sont prévus en phase 3&nbsp;: aujourd&apos;hui, ces deux étapes sont opérées manuellement.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Fournisseurs d'IA" title="Interchangeables, invisibles, sans accès à l'identité des citoyens">
        <Prose>
          <ul>
            <li>
              <strong>Un seul point de passage.</strong> Une passerelle unique est le seul endroit du système qui sait quel fournisseur est utilisé. Le reste de la plateforme demande une capacité — transcrire, comprendre, expliquer, décrire une image, synthétiser une voix — et ignore qui l&apos;exécute.
            </li>
            <li>
              <strong>Des chaînes de repli configurables.</strong> Chaque capacité dispose d&apos;un ordre de fournisseurs modifiable par configuration, terminé par un fournisseur de règles hors ligne. Changer de fournisseur est un paramètre, pas une réécriture.
            </li>
            <li>
              <strong>Rien ne fuit vers le client.</strong> Ni nom de fournisseur, ni consigne système, ni clé d&apos;interface n&apos;atteint jamais un navigateur ou un téléphone. Les messages d&apos;erreur ne contiennent aucune trace de fournisseur, aucune requête de base de données et aucun secret.
            </li>
            <li>
              <strong>Aucun identifiant n&apos;accompagne un appel.</strong> Le fournisseur reçoit le contenu strictement nécessaire — un extrait audio, un texte pseudonymisé, une photo dont les métadonnées ont été retirées — jamais un nom, un numéro de téléphone ou un identifiant de dossier. Le lien avec une personne n&apos;est fait qu&apos;à l&apos;intérieur de la plateforme.
            </li>
            <li>
              <strong>Aucun entraînement par défaut.</strong> Les données des citoyens ne servent pas à entraîner les modèles de tiers. Les échantillons de corpus linguistique ne sont exportables que dé-identifiés, sous consentement de recherche, avec un export tracé&nbsp;; aucun ajustement de modèle n&apos;est automatique.
            </li>
            <li>
              <strong>Tout appel est mesuré.</strong> Capacité, clé interne du fournisseur, durée, succès ou échec, unités consommées&nbsp;: chaque appel laisse une ligne, ce qui rend la dépendance à un fournisseur visible et chiffrable.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Modes dégradés" title="Ce qui continue de fonctionner quand quelque chose tombe" lead="La question n'est pas si un fournisseur tombera, mais ce que le citoyen reçoit ce jour-là. Les chemins de sécurité ne contiennent aucun appel de modèle : ils survivent par construction.">
        <DataTable head={["Panne", "Comportement du service"]} rows={DEGRADED.map((r) => [r[0], r[1]])} />
        <Note>
          Sans aucun fournisseur configuré, la plateforme fonctionne en mode règles&nbsp;: arbres de protocoles, menus, scripts d&apos;urgence, rappels, cas et rapports continuent. La qualité du service se dégrade&nbsp;; le service ne s&apos;arrête pas.
        </Note>
      </Section>

      <Section eyebrow="Journal d'audit" title="Une trace qu'on ne peut pas réécrire sans que cela se voie">
        <Prose>
          <p>
            Toute action privilégiée et tout changement significatif d&apos;un cas écrivent une ligne d&apos;audit contenant l&apos;auteur, son rôle, l&apos;entité concernée, l&apos;état avant, l&apos;état après, la finalité, l&apos;identifiant de trace, l&apos;organisation et l&apos;adresse d&apos;origine. Cette ligne est ensuite chaînée&nbsp;: son empreinte est calculée à partir de l&apos;empreinte de la ligne précédente et de son propre contenu, une chaîne par journée civile.
          </p>
          <p>
            Une vérification quotidienne recalcule la chaîne de la veille et détecte trois choses&nbsp;: une ligne modifiée, une ligne supprimée et une ligne insérée après coup. Une rupture déclenche une alerte à accusé de réception obligatoire. La consultation du journal est elle-même journalisée, et le journal survit à un effacement&nbsp;: il ne contient aucune donnée personnelle en texte libre, il constitue la preuve de ce que le programme a fait.
          </p>
          <p>
            À côté du journal, un registre d&apos;événements en écriture seule enregistre chaque changement d&apos;état notable avec une enveloppe standard&nbsp;: type, agrégat, auteur, trace, classification, contenu. C&apos;est de ce registre que dérivent la reprise de session, les projections analytiques et les rejeux.
          </p>
        </Prose>
      </Section>

      <Section tone="navy" eyebrow="Transparence" title="Ce qui n'est pas encore en place">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Les six comités de revue ne sont pas constitués : les protocoles portent un approbateur en attente, pas un nom.",
            "Le cloisonnement au niveau des lignes de la base de données est prévu en phase 3 ; aujourd'hui il est appliqué par l'application, pas par le moteur de base de données. C'est le point de sécurité ouvert le plus important.",
            "Les corpus annotés et les jeux d'évaluation de référence par langue sont des livrables de terrain, pas des tâches de code : sans eux, aucun seuil de qualité par langue ne peut être mesuré.",
            "Le corpus adverse multilingue complet reste à constituer ; les garde-fous déterministes ont chacun leurs tests ciblés.",
            "Le déploiement par paliers et le retour arrière automatiques sont prévus en phase 3 ; ces étapes sont manuelles aujourd'hui.",
            "L'audit d'accessibilité par un tiers indépendant n'a pas encore eu lieu.",
            "La règle de suppression des petits effectifs sous le niveau de la zone de santé est appliquée dans les rapports ; son câblage complet dans les tableaux de bord de santé reste à finir.",
            "L'export quotidien du journal d'audit vers un stockage froid est prévu en phase 3.",
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
        <Note>
          Une erreur de compréhension, une orientation dangereuse ou une faille peuvent être signalées à{" "}
          <a href={`mailto:${SITE.contact.safety}`} className="link">
            {SITE.contact.safety}
          </a>
          . Les questions de protection des données vont à{" "}
          <a href={`mailto:${SITE.contact.dataProtection}`} className="link">
            {SITE.contact.dataProtection}
          </a>
          . Voir aussi{" "}
          <Link href="/confidentialite" className="link">
            la notice de protection des données
          </Link>{" "}
          et{" "}
          <Link href="/financement" className="link">
            le modèle de financement
          </Link>
          .{!SITE.contactsActive && <> {SITE.contactsNote}</>}
        </Note>
      </Section>

      <CtaBand
        title="Vous devez auditer ce service avant de l'ouvrir dans votre province ?"
        body="Les protocoles, les jeux de tests, le journal d'audit et le registre des traitements peuvent être présentés à une autorité de tutelle, à un comité d'éthique ou à un évaluateur indépendant."
        primary={{ href: "/contact", label: "Demander une revue" }}
        secondary={{ href: "/programme", label: "Comprendre le programme" }}
      />
    </>
  );
}
