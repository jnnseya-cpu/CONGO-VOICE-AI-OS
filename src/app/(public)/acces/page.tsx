import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SITE } from "@shared/site";
import { t as channelText } from "@server/channels/strings";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, LangBlock, Note, CtaBand, Steps } from "@client/components/public/ui";
import { IconAlert, IconClock, IconGlobe, IconGrid, IconMessage, IconMic, IconPhone, IconUsers, IconX } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Comment y accéder",
  description:
    "Six façons de joindre le service : appel vocal, WhatsApp, USSD, SMS, application web et guichet assisté. Ce qu'il faut faire, ce que cela coûte, comment arrêter.",
  alternates: { canonical: "/acces" },
  openGraph: {
    title: "Comment y accéder — CONGO VOICE AI OS",
    description: "Appel, WhatsApp, USSD, SMS, web et guichet assisté : ce qu'il faut, ce que cela coûte, et comment joindre un humain.",
    url: "/acces",
  },
};

const PENDING_NOTE = "En cours d'attribution avec les opérateurs : le numéro sera publié ici et annoncé sur les radios communautaires dès qu'il sera attribué.";

interface ChannelCard {
  key: string;
  label: string;
  value: string;
  pending: boolean;
  note: string;
  icon: ReactNode;
  what: string[];
  needs: string;
  carries: string;
}

const CHANNELS: ChannelCard[] = [
  {
    key: "voice",
    label: SITE.channels.voice.label,
    value: SITE.channels.voice.value,
    pending: SITE.channels.voice.pending,
    note: SITE.channels.voice.note,
    icon: <IconPhone size={22} />,
    what: [
      "Composez le numéro court national et laissez sonner.",
      "Une voix vous salue dans une langue et vous propose les autres : dites votre langue, ou appuyez sur 1 pour le français, 2 lingala, 3 kikongo, 4 kiswahili, 5 tshiluba.",
      "Dites en quelques mots ce dont vous avez besoin, après le bip, puis restez silencieux un instant.",
      "Si vous préférez les touches : 1 pour la santé, 2 pour l'agriculture, 3 pour l'école.",
      "La réponse est lue à voix haute. Si elle est longue, on vous demande « voulez-vous que je continue ? ».",
    ],
    needs: "N'importe quel téléphone, même le plus simple. Aucune connexion internet.",
    carries: "Voix et touches du clavier.",
  },
  {
    key: "whatsapp",
    label: SITE.channels.whatsapp.label,
    value: SITE.channels.whatsapp.value,
    pending: SITE.channels.whatsapp.pending,
    note: SITE.channels.whatsapp.note,
    icon: <IconMessage size={22} />,
    what: [
      "Enregistrez le numéro WhatsApp du programme et envoyez un premier message, écrit ou vocal.",
      "Vous pouvez envoyer une note vocale dans votre langue : c'est la manière la plus simple si vous n'aimez pas écrire.",
      "Vous pouvez envoyer une photo — une feuille malade, un animal, un cahier d'exercice — avec ou sans texte.",
      "Une courte vidéo est acceptée comme preuve pour l'agent agricole ; elle n'est pas analysée automatiquement.",
      "La réponse arrive en texte et, quand c'est utile, en note vocale.",
    ],
    needs: "Un smartphone avec WhatsApp et un peu de connexion, même en 2G.",
    carries: "Voix, photo, courte vidéo, texte, boutons de choix, position.",
  },
  {
    key: "ussd",
    label: SITE.channels.ussd.label,
    value: SITE.channels.ussd.value,
    pending: SITE.channels.ussd.pending,
    note: SITE.channels.ussd.note,
    icon: <IconGrid size={22} />,
    what: [
      "Composez le code court USSD comme vous composeriez un code de crédit.",
      "Un menu court s'affiche : 1 Santé, 2 Agriculture, 3 Éducation.",
      "Choisissez ensuite l'une des cinq questions les plus fréquentes de ce thème, ou tapez 0 pour poser une autre question par SMS.",
      "Le menu ne dépasse jamais deux niveaux, et un écran ne dépasse jamais cent soixante caractères.",
      "Si vous restez trop longtemps sans répondre, la session se ferme : recomposez le code pour recommencer.",
    ],
    needs: "N'importe quel téléphone. Aucune connexion internet, aucun crédit de données.",
    carries: "Chiffres du clavier seulement. La réponse détaillée arrive par SMS.",
  },
  {
    key: "sms",
    label: SITE.channels.sms.label,
    value: SITE.channels.sms.value,
    pending: SITE.channels.sms.pending,
    note: SITE.channels.sms.note,
    icon: <IconMessage size={22} />,
    what: [
      "Écrivez votre question en message simple, dans votre langue.",
      "La réponse arrive en trois messages au maximum, numérotés (1/3, 2/3, 3/3).",
      "Répondez CONTINUER si vous voulez la suite d'une réponse coupée.",
      "Les rappels que vous acceptez — un vaccin, une date de semis, une révision — arrivent aussi par ce canal.",
      "Répondez STOP à tout moment pour ne plus rien recevoir.",
    ],
    needs: "N'importe quel téléphone. Aucune connexion internet.",
    carries: "Texte seulement, en messages courts.",
  },
  {
    key: "web",
    label: SITE.channels.web.label,
    value: SITE.channels.web.value,
    pending: SITE.channels.web.pending,
    note: SITE.channels.web.note,
    icon: <IconGlobe size={22} />,
    what: [
      "Ouvrez congovoice.cd dans le navigateur du téléphone ou de l'ordinateur.",
      "Appuyez sur le bouton du micro et parlez : vous n'avez rien à écrire.",
      "Vous pouvez aussi joindre une photo, écrire, ou faire lire la réponse à voix haute.",
      "Une fois la page ouverte, elle continue de fonctionner sans réseau.",
      "Ajoutez-la à l'écran d'accueil pour la rouvrir comme une application.",
    ],
    needs: "Un smartphone ou un ordinateur, et une connexion au moins une fois pour ouvrir la page.",
    carries: "Voix, photo, courte vidéo, texte, lecture à voix haute.",
  },
  {
    key: "assisted",
    label: "Guichet assisté",
    value: "Relais communautaires, agents agricoles, enseignants et points d'accueil partenaires",
    pending: true,
    note: "Les lieux et les horaires seront publiés province par province à l'ouverture du pilote.",
    icon: <IconUsers size={22} />,
    what: [
      "Une personne formée pose la question à votre place, sur son propre téléphone.",
      "Elle vous lit la réponse à voix haute, dans votre langue.",
      "Elle indique au service qu'elle agit pour quelqu'un d'autre : l'échange est enregistré comme tel.",
      "C'est la voie prévue pour les personnes qui n'ont pas de téléphone, ou qui préfèrent parler à quelqu'un.",
    ],
    needs: "Rien. Vous n'avez besoin ni de téléphone, ni de savoir lire.",
    carries: "Tout ce que la personne qui vous aide peut envoyer depuis son téléphone.",
  },
];

const COMPARISON: Array<[string, string, string, string]> = [
  ["Appel vocal", "Téléphone simple, sans internet", "Voix, touches", "Gratuit pour vous"],
  ["WhatsApp", "Smartphone, un peu de réseau", "Voix, photo, vidéo, texte, boutons", "Gratuit pour vous"],
  ["USSD", "Téléphone simple, sans internet", "Chiffres du clavier", "Gratuit pour vous"],
  ["SMS", "Téléphone simple, sans internet", "Texte court", "Gratuit pour vous"],
  ["Application web", "Smartphone ou ordinateur", "Voix, photo, vidéo, texte", "Gratuit pour vous"],
  ["Guichet assisté", "Rien", "Tout, par l'intermédiaire d'une personne", "Gratuit pour vous"],
];

export default function AccesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Utiliser le service"
        title="Six façons de poser votre question, sans rien payer"
        lead="Vous n'avez besoin ni de compte, ni d'adresse électronique, ni de savoir lire, ni d'un téléphone récent. Choisissez la façon la plus simple pour vous : appeler, envoyer une note vocale, composer un code, écrire un message, ouvrir la page web, ou demander à une personne formée près de chez vous."
        meta={
          <>
            <span>Gratuit pour les citoyens</span>
            <span aria-hidden="true">·</span>
            <span>Aucun compte à créer</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.languages.map((l) => l.label).join(" · ")}</span>
          </>
        }
      />

      <Section tone="white">
        <Callout tone="danger" title="Avant tout : en cas de danger, n'utilisez pas ce service">
          <p>
            Convulsions, perte de connaissance, saignement abondant, difficulté à respirer, nuque raide, saignement pendant la grossesse, nouveau-né qui refuse de téter&nbsp;: partez immédiatement au centre de santé le plus proche. Ne perdez pas de temps à appeler ou à écrire.{" "}
            <Link href="/urgence" className="link">
              Voir la liste complète des signes de danger
            </Link>
            .
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Les canaux" title="Ce qu'il faut faire, canal par canal" lead="Chaque canal fait la même chose : il vous permet de poser une question et d'obtenir une réponse. Ils diffèrent seulement par ce que votre téléphone sait faire.">
        <Cards cols={2}>
          {CHANNELS.map((c) => (
            <InfoCard key={c.key} title={c.label} icon={c.icon}>
              <p className="font-semibold text-ink">
                {c.value}
                {c.pending && <span className="ml-2 rounded-md bg-warn-soft px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-warn">En cours d&apos;attribution</span>}
              </p>
              <p className="mt-1 text-[13px] text-muted">{c.pending ? PENDING_NOTE : c.note}</p>
              <ul className="mt-3 list-disc space-y-1 pl-4">
                {c.what.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <p className="mt-3">
                <strong className="text-ink">Ce qu&apos;il vous faut&nbsp;:</strong> {c.needs}
              </p>
              <p className="mt-1">
                <strong className="text-ink">Ce que ce canal transporte&nbsp;:</strong> {c.carries}
              </p>
              <p className="mt-1">
                <strong className="text-ink">Ce que cela vous coûte&nbsp;:</strong> rien.
              </p>
            </InfoCard>
          ))}
        </Cards>
        <Note>
          Le numéro court national, le numéro WhatsApp, le code USSD et le numéro court SMS ne sont pas encore attribués&nbsp;: la négociation avec les opérateurs est en cours et fait partie de la phase de préparation. Le programme ne publiera aucun numéro tant qu&apos;il n&apos;aura pas été réellement attribué. Si vous voyez un numéro présenté comme celui de CONGO VOICE AI OS ailleurs qu&apos;ici, ce n&apos;est pas le nôtre&nbsp;: signalez-le à{" "}
          <a href={`mailto:${SITE.contact.safety}`} className="link">
            {SITE.contact.safety}
          </a>
          .
        </Note>
      </Section>

      <Section tone="white" eyebrow="Comparer" title="Choisir selon le téléphone que vous avez">
        <DataTable
          head={["Canal", "Ce qu'il vous faut", "Ce qu'il transporte", "Ce que cela vous coûte"]}
          rows={COMPARISON.map(([a, b, c, d]) => [a, b, c, d])}
          caption="La gratuité pour l'appelant fait partie des conditions négociées avec les opérateurs ; elle est une exigence du programme, pas une promesse commerciale."
        />
      </Section>

      <Section eyebrow="Dans votre langue" title="Ce que vous entendez, et ce que vous pouvez dire pour commencer" lead="Vous n'avez pas besoin de connaître une formule particulière. Dites simplement ce qui vous arrive, comme vous le diriez à un voisin. Voici l'accueil tel qu'il est prononcé ou écrit dans chaque langue.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE.languages.map((l) => (
            <LangBlock key={l.code} lang={l.label} native={l.native}>
              <p>{channelText("welcomeText", l.code)}</p>
              <p className="mt-3 text-[13.5px] text-ink-2">{channelText("openQuestion", l.code)}</p>
            </LangBlock>
          ))}
        </div>
        <Note>
          Vous pouvez mélanger les langues dans une même phrase, comme on le fait tous les jours&nbsp;: le service ne vous demandera pas de choisir. Voir{" "}
          <Link href="/langues-nationales" className="link">
            la couverture réelle de chaque langue
          </Link>
          .
        </Note>
      </Section>

      <Section tone="white" eyebrow="Ce que le service vous demande" title="Trois choses, et rien de plus">
        <Steps
          items={[
            {
              title: "À qui est cette question ?",
              body: "Sur les canaux téléphoniques, le service demande une fois par conversation si le téléphone est partagé, et si la question est pour vous ou pour une autre personne. Un téléphone n'est pas une identité : dans beaucoup de ménages, un seul appareil sert à tout le monde.",
            },
            {
              title: "Voulez-vous reprendre où vous en étiez ?",
              body: "Si vous revenez dans les 24 heures, le service vous rappelle la dernière chose dont vous parliez et vous propose de continuer, ou de poser une nouvelle question. Passé ce délai, la conversation repart de zéro.",
            },
            {
              title: "Deux questions de précision, au maximum",
              body: "Pour la santé surtout, le service a parfois besoin de deux informations avant de répondre — l'âge en mois, la durée d'une fièvre. Il ne vous en demandera jamais plus de deux : au-delà, il donne l'orientation la plus prudente et dit ce qui reste incertain.",
            },
          ]}
        />
      </Section>

      <Section eyebrow="Ce que vous recevez" title="À quoi ressemble une réponse" lead="Quel que soit le canal, une réponse a toujours la même forme. Sur un canal court — SMS, USSD, appel — elle est raccourcie, mais l'ordre ne change pas.">
        <Cards cols={3}>
          <InfoCard title="Ce qui a été compris" icon={<IconMic size={22} />}>
            Le service redit votre situation en une phrase, dans votre langue. C&apos;est le moment de le corriger s&apos;il s&apos;est trompé&nbsp;: dites simplement «&nbsp;ce n&apos;est pas ça&nbsp;».
          </InfoCard>
          <InfoCard title="Ce qu'il faut faire" tone="health" icon={<IconAlert size={22} />}>
            Le niveau de risque, puis l&apos;action&nbsp;: où aller, dans quel délai, quels gestes faire en attendant, et ce qu&apos;il ne faut surtout pas faire.
          </InfoCard>
          <InfoCard title="Qui est prévenu, et à quel point c'est sûr" icon={<IconUsers size={22} />}>
            Si un humain doit intervenir, le service le nomme. Il donne aussi son degré de certitude&nbsp;: sous le seuil, il dit qu&apos;il n&apos;est pas sûr plutôt que de trancher.
          </InfoCard>
        </Cards>
        <Note>
          Le détail de ce que chaque service fait et refuse de faire est décrit dans{" "}
          <Link href="/services" className="link">
            les services
          </Link>
          .
        </Note>
      </Section>

      <Section eyebrow="Arrêter, reprendre, corriger" title="Vous gardez la main">
        <Cards cols={2}>
          <InfoCard title="Arrêter de recevoir des messages" tone="danger" icon={<IconX size={22} />}>
            <p>
              Répondez par un seul mot, sur n&apos;importe quel canal écrit&nbsp;:
            </p>
            <p className="mt-2 font-semibold text-ink">STOP · ARRÊT · ARRÊTER · TIKA · ACHA · SIMAMA · YAMBULA · LEKELA · DÉSABONNER · UNSUBSCRIBE</p>
            <p className="mt-2">
              Le service confirme dans votre langue&nbsp;: «&nbsp;c&apos;est noté, vous ne recevrez plus de messages&nbsp;». Vos consentements pour le service, les rappels et les statistiques sont retirés en même temps.
            </p>
            <p className="mt-2">
              Pour revenir plus tard, répondez <strong>START</strong> (ou OUI, REPRENDRE, ANZA, YANTIKA, TUADIJA).
            </p>
            <p className="mt-2 text-[13px] text-muted">
              Seul un mot seul, ou deux mots, comptent comme un arrêt&nbsp;: une phrase comme «&nbsp;il n&apos;arrête pas de tousser&nbsp;» ne coupe rien.
            </p>
          </InfoCard>
          <InfoCard title="Reprendre une conversation" icon={<IconClock size={22} />}>
            <p>
              Une conversation reste reprenable <strong>24 heures</strong> depuis le même numéro ou le même appareil. Le service vous dit&nbsp;: «&nbsp;la dernière fois, nous parlions de…&nbsp;», et vous choisissez de continuer ou de recommencer.
            </p>
            <p className="mt-2">
              C&apos;est fait pour les coupures de courant, les crédits épuisés et les réseaux qui tombent&nbsp;: vous ne recommencez pas depuis le début parce que la communication a été coupée.
            </p>
            <p className="mt-2">Une conversation laissée sans réponse pendant 24 heures est simplement close.</p>
          </InfoCard>
          <InfoCard title="Dire que le service s'est trompé" icon={<IconAlert size={22} />}>
            <p>
              Vous pouvez signaler que le service ne vous a pas compris, et noter la qualité de la voix qui vous répond. Ces deux signalements ne servent pas à faire des statistiques&nbsp;: ils envoient votre échange à une file de relecture où des locuteurs natifs corrigent ce qui a été mal entendu.
            </p>
            <p className="mt-2">
              Un problème de sécurité — une orientation dangereuse, un produit conseillé à tort — se signale à{" "}
              <a href={`mailto:${SITE.contact.safety}`} className="link">
                {SITE.contact.safety}
              </a>
              . Ces signalements passent en priorité.
            </p>
          </InfoCard>
          <InfoCard title="Parler à un humain" tone="health" icon={<IconUsers size={22} />}>
            <p>Il y a trois façons d&apos;arriver à une personne&nbsp;:</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>demandez-le, simplement, pendant la conversation&nbsp;;</li>
              <li>laissez le service escalader lui-même — c&apos;est automatique devant un signe de danger, un doute sérieux ou une maladie à déclarer&nbsp;;</li>
              <li>passez par un guichet assisté&nbsp;: relais communautaire, agent agricole ou enseignant.</li>
            </ul>
            <p className="mt-2">
              Une escalade est assignée à une personne nommée, avec un délai de prise en charge suivi. Si le délai est dépassé, le cas remonte automatiquement.
            </p>
          </InfoCard>
        </Cards>
      </Section>

      <Section tone="white" eyebrow="Sans réseau" title="Ce qui se passe quand la connexion tombe">
        <Prose>
          <p>
            L&apos;application web est conçue pour un pays où le réseau va et vient. Une fois la page ouverte une première fois, elle reste utilisable&nbsp;: vous pouvez enregistrer votre note vocale, prendre votre photo et écrire votre question <strong>sans aucune connexion</strong>.
          </p>
          <p>
            Ce que vous avez enregistré est gardé dans le téléphone, dans l&apos;ordre où vous l&apos;avez dit. Dès que le réseau revient, l&apos;envoi part tout seul, même si vous avez fermé la page entre-temps. Chaque envoi porte sa propre marque, ce qui garantit qu&apos;un renvoi ne crée jamais deux fois la même demande.
          </p>
          <p>
            Les canaux téléphoniques — appel, USSD, SMS — ne demandent aucune connexion internet du tout. C&apos;est pour cela qu&apos;ils font partie du service, et non d&apos;une version dégradée&nbsp;: dans la plupart des ménages ruraux, ce sont les seuls canaux qui marchent tous les jours.
          </p>
        </Prose>
      </Section>

      <Section tone="navy" eyebrow="Ce que le service ne vous demandera jamais">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "De l'argent, du crédit téléphonique ou une unité de transfert.",
            "Un mot de passe, un code de retrait mobile ou un code reçu par SMS.",
            "Un numéro de carte, un compte bancaire ou un compte de monnaie électronique.",
            "Une pièce d'identité pour poser une question de santé, d'agriculture ou d'école.",
            "Une adresse électronique ou la création d'un compte.",
            "De payer pour aller plus vite, ou pour parler à un humain.",
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
        <Cards cols={3}>
          <InfoCard title="Questions fréquentes" icon={<IconMessage size={22} />} href="/aide">
            Ce que les citoyens demandent le plus souvent&nbsp;: le coût, les enregistrements, la confidentialité, ce qu&apos;il faut faire quand le service ne comprend pas.
          </InfoCard>
          <InfoCard title="Ce qui est conservé" icon={<IconMic size={22} />} href="/confidentialite">
            Ce qui est collecté, pourquoi, combien de temps, qui peut le voir, et comment demander la suppression de vos données.
          </InfoCard>
          <InfoCard title="Les services en détail" icon={<IconGrid size={22} />} href="/services">
            Santé, agriculture, éducation&nbsp;: ce que chaque service fait, ce qu&apos;il refuse de faire, ses sources et son escalade.
          </InfoCard>
        </Cards>
      </Section>

      <CtaBand
        title="Vous voulez ouvrir un guichet assisté dans votre communauté ?"
        body="Relais communautaires, agents agricoles, enseignants, écoles, radios et organisations locales peuvent devenir des points d'accès."
        primary={{ href: "/contact", label: "Écrire au programme" }}
        secondary={{ href: "/gouvernance", label: "Sécurité et gouvernance" }}
      />
    </>
  );
}
