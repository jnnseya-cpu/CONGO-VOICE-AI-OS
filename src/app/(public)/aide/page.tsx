import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Faq, Callout, Note, CtaBand, AnchorNav } from "@client/components/public/ui";

export const metadata: Metadata = {
  title: "Questions fréquentes",
  description:
    "Le coût, les langues, les notes vocales, la vie privée, le pourcentage de confiance, le téléphone partagé, l'absence de réseau : les réponses au fonctionnement réel.",
  alternates: { canonical: "/aide" },
  openGraph: {
    title: "Questions fréquentes — CONGO VOICE AI OS",
    description: "Ce que les citoyens demandent le plus souvent sur le service, et les réponses exactes à ce qui est réellement mis en œuvre.",
    url: "/aide",
  },
};

/**
 * Single source for the visible FAQ and for the FAQPage structured data below:
 * both are built from this array, so an answer and its markup can never diverge.
 */
interface FaqItem {
  section: string;
  q: string;
  a: string;
  link?: { href: string; label: string };
}

const SECTIONS = [
  { id: "utiliser", label: "Utiliser le service" },
  { id: "sante", label: "Santé" },
  { id: "agriculture", label: "Agriculture" },
  { id: "education", label: "Éducation" },
  { id: "langues", label: "Langues" },
  { id: "donnees", label: "Données et vie privée" },
  { id: "cout", label: "Coût et accès" },
  { id: "problemes", label: "Problèmes" },
] as const;

const FAQ: FaqItem[] = [
  /* ── Utiliser le service ── */
  {
    section: "utiliser",
    q: "Faut-il créer un compte pour utiliser le service ?",
    a: "Non. Il n'y a ni compte, ni mot de passe, ni adresse électronique à fournir. Vous appelez, vous envoyez un message ou vous ouvrez la page web, et vous parlez. Une conversation est ouverte automatiquement et se referme quand vous avez fini.",
  },
  {
    section: "utiliser",
    q: "Comment le service sait-il qui je suis ?",
    a: "Il ne le sait pas, et il n'a pas besoin de le savoir. Une conversation est rattachée au canal que vous utilisez, pas à votre identité. Le service ne vous demande ni pièce d'identité, ni nom complet pour vous répondre. Il vous demande seulement, sur les canaux téléphoniques, si la question est pour vous ou pour quelqu'un d'autre, parce que la réponse n'est pas la même.",
  },
  {
    section: "utiliser",
    q: "Que devient une note vocale que j'envoie ?",
    a: "Elle est transcrite dans la langue où vous avez parlé, traduite en français pour être traitée, puis la réponse vous revient dans votre langue. L'enregistrement est conservé pendant quatre-vingt-dix jours par défaut, pour que l'agent qui vous rappellera puisse réécouter ce que vous avez dit exactement, et pour corriger le service quand il vous comprend mal. Passé ce délai, il est supprimé.",
    link: { href: "/confidentialite", label: "Ce qui est conservé, et combien de temps" },
  },
  {
    section: "utiliser",
    q: "Pourquoi le service pose-t-il parfois deux questions avant de répondre ?",
    a: "Parce que certaines orientations dépendent d'informations que vous n'avez pas forcément données : l'âge d'un enfant en mois, la durée d'une fièvre, la proportion du champ touchée. Le service pose au maximum deux questions de précision. Au-delà, il donne l'orientation la plus prudente et dit clairement ce qui reste incertain, plutôt que de continuer à interroger une personne inquiète.",
  },
  {
    section: "utiliser",
    q: "Que veut dire le pourcentage de confiance affiché avec la réponse ?",
    a: "C'est le degré de certitude du service sur ce qu'il a compris et sur ce qu'il propose. Il combine la qualité de la transcription, la certitude sur la langue reconnue, la clarté de l'intention, la solidité des indices et la couverture par les documents approuvés. Sous le seuil, le service le dit ouvertement, pose une question de plus, ou renvoie vers un humain. Un pourcentage bas n'est pas une panne : c'est une information honnête sur la limite du service.",
  },
  {
    section: "utiliser",
    q: "Puis-je reprendre une conversation plus tard ?",
    a: "Oui, pendant vingt-quatre heures depuis le même numéro ou le même appareil. Le service vous rappelle la dernière chose dont vous parliez et vous propose de continuer ou de poser une nouvelle question. Passé vingt-quatre heures, la conversation est close et vous repartez de zéro.",
  },
  {
    section: "utiliser",
    q: "Comment corriger le service quand il a mal compris ?",
    a: "Dites-le simplement, dans la conversation : « ce n'est pas ça », « je n'ai pas dit cela ». La réponse est refaite à partir de votre correction. Vous pouvez aussi signaler que le service ne vous a pas compris, et noter la voix qui vous répond. Ces deux signalements envoient votre échange à une file de relecture où des locuteurs natifs corrigent ce qui a été mal entendu.",
  },
  {
    section: "utiliser",
    q: "Puis-je parler à une vraie personne ?",
    a: "Oui. Demandez-le pendant la conversation, et le service ouvre un cas assigné à une personne nommée : agent de santé communautaire, agent agricole du secteur ou enseignant référent, selon le sujet. Le service escalade aussi de lui-même devant un signe de danger, un doute sérieux ou une maladie à déclaration obligatoire. Chaque cas a un délai de prise en charge suivi ; s'il est dépassé, le cas remonte automatiquement.",
    link: { href: "/acces", label: "Toutes les façons de joindre le service" },
  },

  /* ── Santé ── */
  {
    section: "sante",
    q: "Le service peut-il me dire de quelle maladie je souffre ?",
    a: "Non, jamais. Le service n'établit pas de diagnostic. Il vous dit ce qu'il a compris de votre situation, le niveau de risque, où aller et dans quel délai. Un filtre automatique supprime, avant qu'elle ne soit prononcée, toute phrase qui affirmerait une maladie. Nommer une maladie exige un examen et souvent un test, que seul un professionnel de santé peut faire.",
  },
  {
    section: "sante",
    q: "Pourquoi ne me donne-t-il pas un médicament et sa dose ?",
    a: "Parce qu'une dose dépend du poids, de l'âge, de la grossesse, des autres traitements et du diagnostic réel. Un conseil de dose donné à distance, sans examen, peut tuer un enfant. Le service supprime automatiquement toute phrase contenant un nombre de milligrammes, de millilitres ou de comprimés, et il ne conseille aucun médicament soumis à ordonnance.",
  },
  {
    section: "sante",
    q: "Que fait le service si je décris un signe de danger ?",
    a: "Il coupe court à la conversation et prononce immédiatement le message d'urgence dans votre langue : allez au centre de santé le plus proche maintenant, sans attendre. Il donne les gestes à faire pendant le trajet, indique la structure de soins connue la plus proche — ou dit franchement qu'il ne la connaît pas — et alerte un relais communautaire. Cette détection repose sur des mots-clés écrits dans les cinq langues, appliqués avant tout appel à l'intelligence artificielle : elle fonctionne même si les services d'intelligence artificielle sont en panne.",
    link: { href: "/urgence", label: "Les signes de danger, et quoi faire" },
  },
  {
    section: "sante",
    q: "Est-ce un service d'urgence ? Puis-je appeler une ambulance avec ?",
    a: "Non. Ce n'est pas un service d'urgence et il n'envoie aucun véhicule. Devant un danger, ne perdez pas de temps à appeler ou à écrire : partez immédiatement vers le centre de santé, l'hôpital général de référence ou le poste de santé le plus proche, et faites-vous accompagner.",
    link: { href: "/urgence", label: "En cas d'urgence" },
  },
  {
    section: "sante",
    q: "Sur quoi le service s'appuie-t-il pour répondre en santé ?",
    a: "Sur dix protocoles écrits, versionnés et relus, et sur une bibliothèque de documents approuvés issus de la prise en charge intégrée des maladies de l'enfant, du programme national de lutte contre le paludisme, du programme élargi de vaccination et de la surveillance intégrée de la maladie. Chaque réponse cite le protocole, sa version et au moins un document. Tous portent la mention « en attente du Comité de Revue Clinique » tant que le comité ne les a pas signés.",
    link: { href: "/services", label: "Les dix protocoles et l'échelle de gravité" },
  },

  /* ── Agriculture ── */
  {
    section: "agriculture",
    q: "Le service peut-il reconnaître une maladie sur une photo de ma plante ?",
    a: "Il propose au plus trois hypothèses classées, avec ce qui plaide pour et ce qui plaide contre chacune. Au-dessus de soixante pour cent de probabilité pour la première, il parle de « correspondance la plus probable, à confirmer sur le terrain ». En dessous, il parle de « correspondance possible » et demande une deuxième photo sous un autre angle. En dessous de quarante pour cent, il envoie le cas à un agent agricole. Une photo floue, sombre ou trop éloignée est refusée avant analyse, avec l'indication de ce qu'il faut refaire.",
  },
  {
    section: "agriculture",
    q: "Le service peut-il me conseiller un produit à acheter ?",
    a: "Seulement si le produit figure comme homologué dans le registre officiel des intrants. Dans ce cas, il donne obligatoirement le mode d'emploi de l'étiquette, l'équipement de protection à porter, le délai avant récolte ou consommation et le délai avant de retourner dans la parcelle. Sinon, le conseil est supprimé et remplacé par des actions non chimiques, avec cette consigne : n'achetez rien sur simple conseil, passez par l'agent agricole ou le vétérinaire de votre secteur.",
  },
  {
    section: "agriculture",
    q: "Pourquoi le service commence-t-il toujours par des solutions gratuites ?",
    a: "Parce qu'un ménage rural ne doit pas dépenser pour un diagnostic incertain. Les recommandations sont classées en trois niveaux, dans cet ordre : ce qu'on peut faire tout de suite sans dépense, ce qu'on peut faire avec de petits moyens locaux, et seulement en dernier ce qui demande un achat.",
  },
  {
    section: "agriculture",
    q: "Que se passe-t-il si plusieurs personnes signalent le même problème ?",
    a: "Quand au moins cinq signalements décrivent le même problème sur la même culture, dans le même territoire, sur une fenêtre glissante de quatorze jours, un foyer est ouvert avec le statut « non vérifié » et le réseau des agents agricoles est alerté. La plateforme ne déclare jamais une épidémie : seul un agent qualifié confirme ou rejette. Un foyer trop peu nombreux est publié sans son territoire, pour qu'une poignée d'exploitations ne puisse pas être reconnue.",
  },

  /* ── Éducation ── */
  {
    section: "education",
    q: "Le service va-t-il faire les devoirs de mon enfant à sa place ?",
    a: "Non. Devant un travail noté, il refuse de donner la réponse tant que l'élève n'a pas essayé. Il donne des indices, du plus léger au plus fort, puis un exemple résolu sur un exercice semblable — jamais sur celui de l'élève. Après l'essai, il dit ce qui est juste, nomme l'erreur, explique pourquoi elle est fréquente et donne le geste qui la corrige.",
  },
  {
    section: "education",
    q: "Mon enfant est en quelle classe ? Le service le devine-t-il ?",
    a: "Non, et c'est volontaire. Le service ne devine ni l'âge, ni la classe, ni la langue d'un enfant à partir de sa voix. Il pose la question. Tant que le profil n'est pas confirmé, il reste prudent et le dit. Chaque séance est ensuite rattachée à un objectif du programme national de la RDC, avec son code et son poids éventuel au TENAFEP ou à l'Examen d'État.",
  },
  {
    section: "education",
    q: "Je suis parent et je ne peux pas suivre le programme scolaire. Le service peut-il m'aider ?",
    a: "Oui. Le mode parent vous donne un résumé de ce que l'enfant réussit, de ce qu'il faut travailler, des activités à faire à la maison sans matériel, et un encouragement. Les mots mêmes de l'enfant n'y figurent jamais. Vous pouvez aussi demander une histoire à faire écouter puis raconter : douze histoires courtes ont été écrites pour ce programme, deux par langue, sur la vie congolaise ordinaire.",
  },
  {
    section: "education",
    q: "Le service prépare-t-il au TENAFEP et à l'Examen d'État ?",
    a: "Oui. Il produit un plan de révision par semaines, avec les points à travailler, les activités, un contrôle de fin de semaine et une routine quotidienne, et il peut envoyer des rappels si vous les acceptez. Les contenus s'appuient sur les documents du Ministère de l'EPST décrivant la structure des épreuves et la méthode de révision.",
  },

  /* ── Langues ── */
  {
    section: "langues",
    q: "Dans quelles langues puis-je parler ?",
    a: "En français, en lingala, en kikongo, en kiswahili et en tshiluba. Le français est la langue de référence et la plus solide. Le lingala et le kiswahili sont utilisables et s'améliorent. Le kikongo et le tshiluba sont les moins dotés et se construisent à partir du corpus recueilli : le service y est plus souvent prudent et pose plus de questions.",
    link: { href: "/langues-nationales", label: "L'état réel de chaque langue" },
  },
  {
    section: "langues",
    q: "Puis-je mélanger deux langues dans la même phrase ?",
    a: "Oui, et c'est prévu. Le service identifie la langue dominante du message et les autres langues qui s'y mêlent, puis répond dans votre langue dominante. Le mélange des langues est la manière normale de parler dans une grande partie du pays : le service ne vous demandera jamais de choisir.",
  },
  {
    section: "langues",
    q: "Que se passe-t-il si une langue n'est pas encore assez bonne ?",
    a: "La langue n'est pas ouverte dans un module tant qu'elle n'a pas franchi ses seuils de qualité, et une langue qui repasse sous le seuil est automatiquement ramenée à un mode guidé, avec des messages enregistrés par des locuteurs natifs et une navigation par touches. Un service qui comprend mal vaut moins qu'un menu simple qui marche.",
    link: { href: "/langues-nationales", label: "Les seuils de qualité par langue" },
  },

  /* ── Données et vie privée ── */
  {
    section: "donnees",
    q: "Qui peut voir ma conversation ?",
    a: "Vous, et les personnes habilitées qui doivent en connaître pour vous aider : l'agent de santé, l'agent agricole ou l'enseignant à qui votre cas est assigné. Les responsables du programme voient des chiffres agrégés, pas vos échanges. Une révélation relevant de la protection de l'enfance ou d'une personne en danger va dans un espace restreint, dont les notifications ordinaires ne portent aucun détail. Tout accès à un dossier est enregistré.",
    link: { href: "/gouvernance", label: "Qui accède à quoi, et comment c'est contrôlé" },
  },
  {
    section: "donnees",
    q: "Combien de temps mes enregistrements sont-ils gardés ?",
    a: "Par défaut : quatre-vingt-dix jours pour l'enregistrement de votre voix, douze mois pour les photos et vidéos agricoles, trente jours pour la voix de synthèse qui vous répond, douze mois pour les notifications. Les cas sont conservés cinq ans ou selon la politique du programme. Chaque durée est fixée par le programme et peut être raccourcie par l'autorité compétente ; aucune n'est laissée au hasard.",
    link: { href: "/confidentialite", label: "Le calendrier de conservation complet" },
  },
  {
    section: "donnees",
    q: "Comment demander la suppression de mes données ?",
    a: "Écrivez à donnees@congovoice.cd, ou demandez-le à un relais communautaire ou à un agent qui ouvrira la demande pour vous. Le programme répond dans les trente jours. La suppression efface les enregistrements et les photos, vide les textes qui vous concernent, et remplace votre identité par un identifiant sans retour possible. Deux choses subsistent : le journal d'audit, qui est la preuve de ce que le programme a fait et ne contient aucun texte personnel, et les statistiques anonymes déjà agrégées.",
  },
  {
    section: "donnees",
    q: "Mes données servent-elles à entraîner une intelligence artificielle ?",
    a: "Aucun identifiant de citoyen n'accompagne un appel à un modèle : le fournisseur reçoit un texte et rend une structure, et l'association avec une personne se fait uniquement à l'intérieur de la plateforme. Le programme n'entraîne aucun modèle tiers sur des données identifiables sans un consentement dédié. Les enregistrements vérifiés et corrigés par des relecteurs peuvent servir à améliorer la reconnaissance des langues nationales, ce qui est l'un des buts du programme.",
  },
  {
    section: "donnees",
    q: "Le téléphone de la maison est partagé. Que se passe-t-il ?",
    a: "Le service part du principe qu'un téléphone n'est pas une personne. Sur les canaux téléphoniques, il demande une fois par conversation si l'appareil est partagé et si la question est pour vous ou pour quelqu'un d'autre. Si vous répondez pour quelqu'un d'autre, l'échange est enregistré comme fait au nom d'un tiers, et il n'est pas rattaché à votre historique personnel.",
  },
  {
    section: "donnees",
    q: "Le service peut-il servir à me surveiller ou à me retirer une aide ?",
    a: "Non. Le service ne prend aucune décision d'éligibilité, de sanction ou de surveillance sur une personne. Ce qu'il produit pour les institutions, ce sont des tendances agrégées par province et par territoire, avec suppression des petits effectifs pour qu'un individu ou une poignée de ménages ne puisse pas être reconnu.",
  },

  /* ── Coût et accès ── */
  {
    section: "cout",
    q: "Combien cela me coûte-t-il ?",
    a: "Rien. Le service est gratuit pour les citoyens, sur tous les canaux. La gratuité de l'appel et du code court fait partie des conditions négociées avec les opérateurs. Le service ne vous demandera jamais d'argent, de crédit téléphonique, de code de retrait ou de numéro de compte, ni pour répondre, ni pour aller plus vite, ni pour parler à un humain.",
  },
  {
    section: "cout",
    q: "Quel est le numéro à appeler ?",
    a: "Le numéro court national, le numéro WhatsApp, le code USSD et le numéro court SMS ne sont pas encore attribués : la négociation avec les opérateurs est en cours. Le programme ne publiera aucun numéro tant qu'il n'aura pas été réellement attribué. Si vous voyez un numéro présenté comme celui du programme ailleurs que sur ce site, ce n'est pas le nôtre.",
    link: { href: "/acces", label: "Les canaux, et leur état d'ouverture" },
  },
  {
    section: "cout",
    q: "Faut-il un smartphone ?",
    a: "Non. L'appel vocal, l'USSD et le SMS fonctionnent sur n'importe quel téléphone, sans connexion internet. Le smartphone n'ouvre que deux possibilités de plus : envoyer une photo, et utiliser l'application web. Ce ne sont pas des versions supérieures du service, seulement des canaux différents.",
  },
  {
    section: "cout",
    q: "Faut-il savoir lire et écrire ?",
    a: "Non. Vous pouvez parler et écouter, du début à la fin. L'appel vocal, la note vocale WhatsApp et le micro de l'application web ne demandent aucune lecture. Le guichet assisté existe pour les personnes qui n'ont pas de téléphone ou qui préfèrent parler à quelqu'un.",
  },

  /* ── Problèmes ── */
  {
    section: "problemes",
    q: "Que faire quand il n'y a pas de réseau ?",
    a: "Si vous utilisez l'application web, continuez : une fois la page ouverte, vous pouvez enregistrer votre voix, prendre une photo et écrire sans connexion. Ce que vous avez enregistré est gardé dans le téléphone, dans l'ordre, et part tout seul dès que le réseau revient, même si vous avez fermé la page. Sinon, l'appel vocal, l'USSD et le SMS n'ont besoin d'aucune connexion internet.",
  },
  {
    section: "problemes",
    q: "Le service ne comprend pas ce que je dis. Que faire ?",
    a: "Répétez plus lentement, en une phrase courte, en approchant le téléphone de votre bouche et en vous éloignant du bruit. Si cela ne suffit pas, utilisez les touches : sur l'appel, 1 pour la santé, 2 pour l'agriculture, 3 pour l'école ; sur l'USSD, le menu à chiffres fait la même chose. Signalez ensuite que le service ne vous a pas compris : votre échange partira en relecture chez un locuteur natif.",
  },
  {
    section: "problemes",
    q: "La réponse est coupée en plein milieu. Est-ce normal ?",
    a: "Oui, sur les canaux courts. Un SMS ne peut porter que trois messages numérotés ; un écran USSD ne dépasse pas cent soixante caractères ; au téléphone, une réponse longue est lue par morceaux. Répondez CONTINUER par écrit, ou dites oui — ou appuyez sur 1 — au téléphone, pour entendre la suite.",
  },
  {
    section: "problemes",
    q: "Comment arrêter de recevoir des messages ?",
    a: "Répondez par un seul mot sur n'importe quel canal écrit : STOP, ARRÊT, ARRÊTER, TIKA, ACHA, SIMAMA, YAMBULA, LEKELA, DÉSABONNER ou UNSUBSCRIBE. Le service confirme dans votre langue et retire vos consentements pour le service, les rappels et les statistiques. Pour revenir, répondez START. Une phrase entière comme « il n'arrête pas de tousser » ne coupe rien : seul un mot seul compte.",
  },
  {
    section: "problemes",
    q: "Je pense que le service m'a donné un mauvais conseil. À qui le dire ?",
    a: "Écrivez à securite@congovoice.cd, ou dites-le à l'agent de santé, à l'agent agricole ou à l'enseignant qui vous rappelle. Les signalements de sécurité sont traités en priorité. Un agent de santé peut relever le niveau de gravité décidé par le système en indiquant un motif, qui est enregistré ; le système, lui, ne peut jamais abaisser une gravité décidée par les règles.",
  },
  {
    section: "problemes",
    q: "Le service est-il ouvert partout dans le pays ?",
    a: "Pas encore. Le programme est en phase pilote et ouvre province par province, derrière des seuils de qualité par langue et par module. Les provinces ouvertes, les langues disponibles dans chaque module et les horaires des guichets assistés seront publiés ici au fur et à mesure. Là où le service n'est pas encore ouvert, il n'y a pas de version dégradée : il n'y a pas de service.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  name: "Questions fréquentes — CONGO VOICE AI OS",
  inLanguage: "fr",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function AidePage() {
  return (
    <>
      <PageIntro
        eyebrow="Aide"
        title="Questions fréquentes"
        lead="Les réponses ci-dessous décrivent ce que le service fait réellement aujourd'hui, pas ce qu'il pourrait faire un jour. Quand une chose n'est pas encore décidée ou pas encore ouverte, c'est dit."
        meta={
          <>
            <span>{FAQ.length} questions</span>
            <span aria-hidden="true">·</span>
            <span>Gratuit pour les citoyens</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.status}</span>
          </>
        }
      />

      <Section tone="white">
        <Callout tone="danger" title="Si vous êtes devant un danger, ne lisez pas cette page">
          <p>
            Convulsions, perte de connaissance, saignement abondant, difficulté à respirer, nuque raide, saignement pendant la grossesse, nouveau-né qui refuse de téter&nbsp;: allez immédiatement au centre de santé le plus proche.{" "}
            <Link href="/urgence" className="link">
              Voir la conduite à tenir
            </Link>
            .
          </p>
        </Callout>
        <div className="mt-8">
          <AnchorNav items={SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.label }))} />
        </div>
      </Section>

      {SECTIONS.map((s, i) => (
        <Section key={s.id} id={s.id} tone={i % 2 === 0 ? "ground" : "white"} eyebrow="Questions fréquentes" title={s.label}>
          <Faq
            items={FAQ.filter((f) => f.section === s.id).map((f) => ({
              q: f.q,
              a: (
                <>
                  <p>{f.a}</p>
                  {f.link && (
                    <p>
                      <Link href={f.link.href} className="link">
                        {f.link.label}
                      </Link>
                    </p>
                  )}
                </>
              ),
            }))}
          />
        </Section>
      ))}

      <Section>
        <Note>
          Vous ne trouvez pas votre question&nbsp;? Écrivez à{" "}
          <a href={`mailto:${SITE.contact.general}`} className="link">
            {SITE.contact.general}
          </a>
          . Pour une question sur vos données, écrivez à{" "}
          <a href={`mailto:${SITE.contact.dataProtection}`} className="link">
            {SITE.contact.dataProtection}
          </a>
          . Pour signaler un risque de sécurité, écrivez à{" "}
          <a href={`mailto:${SITE.contact.safety}`} className="link">
            {SITE.contact.safety}
          </a>
          . Voir aussi{" "}
          <Link href="/confidentialite" className="link">
            la protection des données
          </Link>{" "}
          et{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance du programme
          </Link>
          .
        </Note>
      </Section>

      <CtaBand
        title="Vous savez maintenant comment cela marche"
        body="Choisissez le canal qui convient à votre téléphone, ou lisez ce que chaque service fait et refuse de faire."
        primary={{ href: "/acces", label: "Comment y accéder" }}
        secondary={{ href: "/services", label: "Les services en détail" }}
      />

      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
    </>
  );
}
