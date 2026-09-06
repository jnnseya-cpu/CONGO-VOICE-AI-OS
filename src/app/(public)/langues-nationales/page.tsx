import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { DISCLAIMERS } from "@server/ai/safety";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, LangBlock, Steps, KeyFacts, Note, CtaBand } from "@client/components/public/ui";
import { IconAlert, IconCheck, IconLanguage, IconMic, IconUsers, IconVolume } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Nos langues",
  description:
    "Français, lingala, kikongo, kiswahili et tshiluba : l'état réel de chaque langue, les seuils de qualité avant ouverture, et comment un locuteur natif peut corriger.",
  alternates: { canonical: "/langues-nationales" },
  openGraph: {
    title: "Nos langues — CONGO VOICE AI OS",
    description: "Couverture honnête par langue, boucle d'apprentissage, seuils de qualité et relecture par des locuteurs natifs.",
    url: "/langues-nationales",
  },
};

const STATUS: Array<{ code: "fr" | "ln" | "kg" | "sw" | "lua"; label: string; native: string; state: string; tone: "plain" | "health" | "agri" | "edu" | "danger"; body: string }> = [
  {
    code: "fr",
    label: "Français",
    native: "Français",
    state: "Langue de référence",
    tone: "health",
    body: "Le français est la langue dans laquelle les protocoles, les documents approuvés et les règles de sécurité sont écrits. C'est aussi la langue pivot : tout message est traduit en français pour être traité, puis la réponse repart dans votre langue. C'est la langue la plus solide du service, à l'écoute comme à la parole.",
  },
  {
    code: "ln",
    label: "Lingala",
    native: "Lingála",
    state: "Utilisable, en amélioration",
    tone: "agri",
    body: "Le lingala est compris et parlé par le service, avec une qualité qui progresse à mesure que le corpus est relu. La transcription reste plus faible qu'en français : le service pose plus souvent une question de vérification, et il le dit. Les messages de sécurité sont des textes fixes, relus, jamais produits par un modèle.",
  },
  {
    code: "sw",
    label: "Kiswahili",
    native: "Kiswahili",
    state: "Utilisable, en amélioration",
    tone: "agri",
    body: "Le kiswahili tel qu'il est parlé en RDC bénéficie d'outils de transcription et d'une voix de synthèse plus mûrs que les autres langues nationales. Les tournures propres à l'est du pays sont, elles, apprises du corpus recueilli et du lexique vérifié.",
  },
  {
    code: "kg",
    label: "Kikongo",
    native: "Kikongo",
    state: "En construction",
    tone: "danger",
    body: "Le kikongo, y compris le kituba, est l'une des deux langues les moins dotées du service. Peu de données publiques existent : la reconnaissance est construite à partir du corpus recueilli auprès des citoyens et relu par des locuteurs natifs. Attendez-vous à ce que le service demande plus souvent confirmation, ou bascule en mode guidé.",
  },
  {
    code: "lua",
    label: "Tshiluba",
    native: "Tshilubà",
    state: "En construction",
    tone: "danger",
    body: "Le tshiluba est la seconde des deux langues les moins dotées. Comme pour le kikongo, la compréhension repose sur le corpus vérifié et sur un lexique enrichi par des relecteurs, avec des indications de prononciation. Le service y est délibérément plus prudent qu'ailleurs.",
  },
];

const MATRIX: Array<[string, string, string, string, string]> = [
  ["Français (fr-CD)", "Référence", "Solide", "Voix de synthèse disponible", "Référence : les protocoles et les documents sont écrits dans cette langue"],
  ["Lingala", "Traduits, à valider par des linguistes", "En amélioration ; audio de terrain plus difficile", "Voix de synthèse au mieux disponible, sinon voix de l'appareil", "Corpus vérifié et lexique local injectés à chaque demande"],
  ["Kiswahili (sw-CD)", "Traduits, à valider par des linguistes", "Bonne ; variantes de l'est apprises du corpus", "Voix de synthèse kiswahili disponible", "Corpus vérifié et lexique local injectés à chaque demande"],
  ["Kikongo / Kituba", "Traduits, à valider par des linguistes", "Construite à partir du corpus recueilli", "Voix de synthèse au mieux disponible, sinon voix de l'appareil", "Corpus vérifié et lexique local injectés à chaque demande"],
  ["Tshiluba", "Traduits, à valider par des linguistes", "Construite à partir du corpus recueilli", "Voix de synthèse au mieux disponible, sinon voix de l'appareil", "Corpus vérifié et lexique local injectés à chaque demande"],
];

const GATES: Array<[string, string, string]> = [
  ["Taux d'erreur de transcription — audio propre", "≤ 20 %", "Un mot sur cinq mal transcrit au maximum, dans de bonnes conditions d'enregistrement"],
  ["Taux d'erreur de transcription — audio de terrain", "≤ 30 %", "Mesuré sur des enregistrements réels : bruit de marché, vent, ligne 2G, haut-parleur"],
  ["Exactitude de l'intention — santé", "≥ 90 %", "Neuf messages de santé sur dix doivent être rattachés au bon protocole"],
  ["Exactitude de l'intention — agriculture et éducation", "≥ 85 %", "Seuil plus bas qu'en santé, parce que la conséquence d'une erreur y est moins grave"],
  ["Rappel des situations d'urgence", "≥ 98 %", "Le seuil le plus haut, et le seul qui ne se négocie pas : rater un signe de danger est inacceptable"],
  ["Intelligibilité de la voix de synthèse", "≥ 3,8 MOS", "Note moyenne donnée par des auditeurs natifs à la voix qui lit la réponse"],
  ["Identification de la langue", "≥ 95 %", "Reconnaître la langue dominante d'un message, y compris quand plusieurs langues se mêlent"],
];

const LOOP = [
  { title: "Chaque conversation devient un échantillon", body: "Ce qui a été entendu, le sens en français, l'audio, la province, l'intention, le module et le degré de certitude du service sont enregistrés ensemble. Les échantillons dont la certitude est faible partent directement en relecture." },
  { title: "Vous signalez ce qui n'a pas marché", body: "Vous pouvez dire « le système ne m'a pas compris », et noter de un à cinq la qualité de la voix qui vous a répondu. Un signalement remet l'échantillon en tête de la file de relecture." },
  { title: "Des locuteurs natifs vérifient et corrigent", body: "Des relecteurs de la langue examinent la file : ils valident, corrigent la transcription, le sens ou la langue reconnue, ou rejettent l'échantillon. Chaque décision est journalisée avec son auteur." },
  { title: "Le lexique s'enrichit", body: "Un relecteur ajoute les mots et tournures locales rencontrés, avec leur sens en français, leur domaine, leur région et une indication de prononciation. Ce lexique est la mémoire locale du service." },
  { title: "Les exemples vérifiés servent tout de suite", body: "À chaque nouvelle demande, les exemples vérifiés et les entrées de lexique proches du message sont retrouvés et fournis au service. La compréhension s'améliore immédiatement, sans réentraîner quoi que ce soit." },
  { title: "Les paires audio-texte partent en apprentissage", body: "Les paires audio et transcription vérifiées sont exportables comme jeux de données pour affiner les modèles de reconnaissance et les voix de synthèse. C'est le chemin vers une écoute et une parole de niveau natif." },
];

export default function LanguesNationalesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Nos langues"
        title="Cinq langues, cinq niveaux de maturité — dits honnêtement"
        lead="Un service public vocal qui prétendrait maîtriser également cinq langues mentirait. Le français est la référence. Le lingala et le kiswahili sont utilisables et progressent. Le kikongo et le tshiluba sont les moins dotés et se construisent, conversation après conversation, avec les personnes qui les parlent."
        meta={
          <>
            <span>{SITE.languages.length} langues</span>
            <span aria-hidden="true">·</span>
            <span>Corpus relu par des locuteurs natifs</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.status}</span>
          </>
        }
      />

      <Section tone="white">
        <KeyFacts
          items={[
            { value: "1", label: "Langue de référence", note: "Le français, langue des protocoles et des documents approuvés" },
            { value: "2", label: "Langues utilisables", note: "Lingala et kiswahili, en amélioration continue" },
            { value: "2", label: "Langues en construction", note: "Kikongo et tshiluba, bâties à partir du corpus" },
            { value: "98 %", label: "Rappel d'urgence exigé", note: "Le seuil qui ne se négocie pas, dans toutes les langues" },
          ]}
        />
      </Section>

      <Section eyebrow="État par langue" title="Où en est chaque langue, aujourd'hui">
        <Cards>
          {STATUS.map((s) => (
            <InfoCard key={s.code} title={`${s.native} — ${s.state}`} tone={s.tone} icon={<IconLanguage size={22} />}>
              {s.body}
            </InfoCard>
          ))}
        </Cards>
        <Note>
          «&nbsp;En construction&nbsp;» ne veut pas dire inutilisable&nbsp;: cela veut dire que le service pose plus de questions, se déclare moins sûr plus souvent, et bascule plus vite vers un menu guidé ou vers un humain. C&apos;est un choix de sécurité, pas un défaut d&apos;attention.
        </Note>
      </Section>

      <Section tone="white" eyebrow="Couverture" title="Ce que chaque langue couvre, poste par poste">
        <DataTable
          head={["Langue", "Textes de l'application", "Écoute (transcription)", "Parole (synthèse vocale)", "Compréhension et traduction"]}
          rows={MATRIX.map(([a, b, c, d, e]) => [a, b, c, d, e])}
          caption="Les textes d'interface en lingala, kikongo, kiswahili et tshiluba ont été rédigés pour la première version et doivent être relus par les linguistes du programme avant l'ouverture du pilote."
        />
      </Section>

      <Section eyebrow="Sécurité linguistique" title="Ce qui n'est jamais traduit par une machine" lead="Certains textes ne peuvent pas se permettre une erreur de traduction : le message d'urgence, l'avertissement de non-substitution, la réponse à une révélation de violence, les menus vocaux et les consignes à suivre pendant le trajet vers l'hôpital.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE.languages.map((l) => (
            <LangBlock key={l.code} lang={l.label} native={l.native}>
              {DISCLAIMERS[l.code]}
            </LangBlock>
          ))}
        </div>
        <Note>
          Ce sont des textes fixes, rédigés et relus dans chacune des cinq langues, puis figés dans le service. Ils sont prononcés à l&apos;identique quel que soit l&apos;état des fournisseurs d&apos;intelligence artificielle. Voir aussi{" "}
          <Link href="/urgence" className="link">
            le message d&apos;urgence dans les cinq langues
          </Link>
          .
        </Note>
      </Section>

      <Section tone="white" eyebrow="La boucle d'apprentissage" title="Comment le service apprend vos langues" lead="Rien n'est acheté sur étagère : les langues nationales de la RDC sont peu dotées, et aucun fournisseur ne les sert correctement. La qualité se construit ici, avec les personnes qui les parlent.">
        <Steps items={LOOP} />
        <Note>
          Une conséquence directe&nbsp;: plus le service est utilisé dans une langue, plus il devient bon dans cette langue. Une province qui parle peu au service reste servie moins bien&nbsp;— c&apos;est pourquoi la relecture est organisée et rémunérée, et non laissée au hasard des volumes.
        </Note>
      </Section>

      <Section eyebrow="Les seuils" title="Une langue n'est pas ouverte tant qu'elle n'a pas franchi ses seuils">
        <DataTable
          head={["Mesure", "Seuil", "Ce que cela veut dire"]}
          rows={GATES.map(([a, b, c]) => [a, b, c])}
          caption="Les seuils s'appliquent par langue et par module : une langue peut être ouverte en agriculture et rester fermée en santé."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Callout tone="warn" title="Ce qui se passe si une langue repasse sous le seuil">
            <p>
              Elle est automatiquement ramenée à un <strong>mode guidé</strong>&nbsp;: des messages enregistrés par des locuteurs natifs, une navigation par touches, et les cinq questions les plus fréquentes de chaque thème. La conversation libre n&apos;est pas proposée tant que la mesure n&apos;est pas revenue au-dessus du seuil.
            </p>
            <p>Un menu simple qui marche vaut mieux qu&apos;une conversation qui comprend de travers.</p>
          </Callout>
          <Callout tone="danger" title="Le seuil qui ne se négocie pas">
            <p>
              Le rappel des situations d&apos;urgence, à <strong>98 %</strong>, est le seul seuil qu&apos;aucune considération de calendrier ou de couverture ne peut abaisser. Manquer un signe de danger parce que la langue n&apos;était pas prête est un accident, pas une limite acceptable.
            </p>
            <p>
              C&apos;est aussi pourquoi la détection des signes de danger repose sur des listes de mots écrites dans les cinq langues, appliquées avant tout appel à l&apos;intelligence artificielle&nbsp;: elle ne dépend pas de la maturité du modèle dans cette langue.
            </p>
          </Callout>
        </div>
      </Section>

      <Section tone="white" eyebrow="Parler comme on parle" title="Le mélange des langues n'est pas une erreur à corriger">
        <Prose>
          <p>
            Dans une grande partie du pays, une phrase ordinaire passe du lingala au français et revient&nbsp;: «&nbsp;Nalingi koyekola division, 36 divisé par 4 c&apos;est combien&nbsp;?&nbsp;» Un service qui exigerait de choisir une langue avant de parler exclurait la manière normale de s&apos;exprimer de millions de personnes.
          </p>
          <p>Le service traite cela en trois temps&nbsp;:</p>
          <ul>
            <li>il identifie la <strong>langue dominante</strong> du message, et note les autres langues qui s&apos;y mêlent&nbsp;;</li>
            <li>il traduit fidèlement l&apos;ensemble en français pour le traitement, sans effacer les termes locaux&nbsp;;</li>
            <li>il répond dans votre langue dominante, en gardant en français les mots médicaux ou techniques qui n&apos;ont pas d&apos;équivalent courant, entre parenthèses.</li>
          </ul>
          <p>
            Il en va de même de l&apos;accueil téléphonique&nbsp;: la langue du premier message tourne d&apos;un appel à l&apos;autre, pour qu&apos;un appelant inconnu n&apos;entende pas systématiquement le français en premier.
          </p>
        </Prose>
      </Section>

      <Section eyebrow="Contribuer" title="Vous parlez l'une de ces langues ? Le programme a besoin de vous">
        <Cards cols={3}>
          <InfoCard title="Relire et corriger le corpus" tone="agri" icon={<IconCheck size={22} />}>
            Écouter des enregistrements réels, valider ou corriger la transcription, le sens en français et la langue reconnue. C&apos;est le travail qui fait le plus progresser une langue peu dotée.
          </InfoCard>
          <InfoCard title="Enrichir le lexique" icon={<IconLanguage size={22} />}>
            Ajouter les mots du quotidien, les noms de plantes, de maladies, d&apos;outils et de gestes, avec leur sens, leur région et leur prononciation. Ce lexique est réutilisé à chaque nouvelle demande.
          </InfoCard>
          <InfoCard title="Prêter votre voix" tone="edu" icon={<IconVolume size={22} />}>
            Enregistrer les messages fixes du mode guidé&nbsp;: accueil, menus, message d&apos;urgence, consignes de trajet. Ces enregistrements sont ceux que le service utilise quand la synthèse vocale n&apos;est pas assez bonne.
          </InfoCard>
          <InfoCard title="Valider les textes de l'interface" icon={<IconMic size={22} />}>
            Les textes en lingala, kikongo, kiswahili et tshiluba ont été rédigés pour la première version et attendent la relecture de linguistes de la langue avant l&apos;ouverture du pilote.
          </InfoCard>
          <InfoCard title="Signaler une erreur, en tant qu'usager" tone="danger" icon={<IconAlert size={22} />}>
            Vous n&apos;avez pas besoin d&apos;être relecteur pour aider&nbsp;: dire «&nbsp;le système ne m&apos;a pas compris&nbsp;» et noter la voix suffit à envoyer votre échange en relecture.
          </InfoCard>
          <InfoCard title="Écrire au programme" tone="health" icon={<IconUsers size={22} />}>
            Les relecteurs sont recrutés par langue, par province et par domaine. Écrivez à{" "}
            <a href={`mailto:${SITE.contact.partnerships}`} className="link">
              {SITE.contact.partnerships}
            </a>{" "}
            en indiquant votre langue, votre province et ce que vous pouvez faire.
          </InfoCard>
        </Cards>
      </Section>

      <Section tone="navy" eyebrow="Mesure continue" title="Ce que le programme suit, langue par langue">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Le nombre d'échantillons recueillis et la part relue sur les trente derniers jours.",
            "La part d'échantillons validés sans correction de transcription — l'écoute.",
            "La part d'échantillons validés moins les signalements d'incompréhension — la compréhension.",
            "La note moyenne donnée par les citoyens à la voix qui leur répond — la parole.",
            "La taille du lexique vérifié et le nombre de fois où chaque entrée a servi.",
            "Le niveau global atteint par la langue : débutant, intermédiaire, avancé, natif.",
          ].map((item) => (
            <li key={item} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[13.5px] leading-relaxed text-white/85">
              <span className="mt-0.5 flex-none text-white/40" aria-hidden="true">
                —
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[70ch] text-[13.5px] leading-relaxed text-white/70">
          Ces mesures ne sont pas encore publiées&nbsp;: elles le seront, langue par langue et module par module, dès l&apos;ouverture des provinces pilotes, avec leur définition, leur période et le nombre d&apos;échantillons sur lequel elles reposent.
        </p>
      </Section>

      <Section tone="white">
        <Note>
          Les langues du programme sont celles retenues pour la première phase&nbsp;: {SITE.languages.map((l) => l.label).join(", ")}. L&apos;ajout d&apos;autres langues et variantes parlées en RDC n&apos;est pas encore décidé&nbsp;; il dépendra de la demande observée, de la disponibilité de relecteurs et des mêmes seuils de qualité que ceux appliqués ici. Voir{" "}
          <Link href="/programme" className="link">
            le déploiement par étapes
          </Link>
          ,{" "}
          <Link href="/services" className="link">
            les services
          </Link>{" "}
          et{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance
          </Link>
          . Ce que deviennent vos enregistrements est décrit dans{" "}
          <Link href="/confidentialite" className="link">
            la protection des données
          </Link>
          , et les questions les plus courantes sur les langues figurent dans{" "}
          <Link href="/aide" className="link">
            les questions fréquentes
          </Link>
          .
        </Note>
      </Section>

      <CtaBand
        title="Vous voulez faire progresser votre langue ?"
        body="Le programme recrute des relectrices et relecteurs natifs par langue et par province, et cherche des partenaires linguistiques et académiques."
        primary={{ href: "/contact", label: "Écrire au programme" }}
        secondary={{ href: "/acces", label: "Utiliser le service" }}
      />
    </>
  );
}
