import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, LangBlock, Steps, Note, CtaBand } from "@client/components/public/ui";
import { IconAlert, IconBriefcase, IconFile, IconMessage, IconShield, IconUsers } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Contact et presse",
  description:
    "Les cinq adresses du programme et leur objet, la voie humaine pour qui ne sait pas écrire, la demande de présentation, le dossier de presse et la sécurité.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact et presse — CONGO VOICE AI OS",
    description: "Écrire au programme, demander une présentation institutionnelle, obtenir le dossier de presse, signaler une faille ou exercer ses droits sur ses données.",
    url: "/contact",
  },
};

const ROUTES: Array<{ key: string; label: string; address: string; purpose: string; commitment: string }> = [
  {
    key: "general",
    label: "Questions générales",
    address: SITE.contact.general,
    purpose: "Toute question qui ne relève pas des quatre autres adresses : compréhension du service, signalement d'un obstacle d'accessibilité, remarque sur une réponse reçue, demande de documentation.",
    commitment: "Réponse sous 5 jours ouvrables.",
  },
  {
    key: "dataProtection",
    label: "Protection des données",
    address: SITE.contact.dataProtection,
    purpose: "Exercice de vos droits : copie de vos données, correction, effacement, opposition, retrait d'un consentement. Également : liste des catégories de sous-traitants activés et questions sur la notice.",
    commitment: "Accusé de réception sous 5 jours ouvrables ; traitement dans le délai légal de 30 jours suivi automatiquement par le système.",
  },
  {
    key: "safety",
    label: "Sécurité et signalements",
    address: SITE.contact.safety,
    purpose: "Erreur d'orientation, réponse dangereuse, faille de sécurité, fuite de données suspectée, comportement anormal du service. Les signalements de sécurité sont traités en priorité sur tout le reste.",
    commitment: "Accusé de réception sous 72 heures ; qualification et mesure de confinement immédiates si le signalement est confirmé.",
  },
  {
    key: "partnerships",
    label: "Partenariats et institutions",
    address: SITE.contact.partnerships,
    purpose: "Ministères, divisions provinciales, ONG, bailleurs, opérateurs mobiles, écoles, centres d'appel, universités et intégrateurs techniques : demande de présentation, d'intégration ou d'ouverture d'un périmètre.",
    commitment: "Réponse sous 5 jours ouvrables, avec une proposition de créneau de présentation.",
  },
  {
    key: "press",
    label: "Presse",
    address: SITE.contact.press,
    purpose: "Journalistes et rédactions : demande d'entretien, vérification d'une information, dossier de presse, captures d'écran, documentation technique.",
    commitment: "Réponse sous 2 jours ouvrables ; plus rapidement pour une demande de vérification urgente.",
  },
];

const BRIEFING: Array<[string, string]> = [
  ["Le problème et la réponse", "Ce que le programme cherche à corriger, les contraintes de terrain retenues et la manière dont chacune a été traduite en exigence technique."],
  ["Démonstration du parcours citoyen", "Un échange complet, dans une langue nationale, depuis la parole jusqu'à l'ouverture d'un cas et à l'alerte d'un agent."],
  ["Les garde-fous de sécurité", "La séparation entre règles déterministes et intelligence artificielle générative, l'échelle de gravité, l'obligation de citer une source approuvée et le circuit de protection des personnes."],
  ["Les tableaux de bord institutionnels", "Ce qu'une province, un ministère ou un bailleur voit réellement : demande, risques, délais de prise en charge, qualité par langue."],
  ["Le modèle de coût", "L'unité de consommation, la table de conversion, les plafonds et alertes, et la mesure du coût par démarche aboutie."],
  ["La gouvernance et les données", "Comités de revue, journal d'audit, consentements par finalité, durées de conservation et engagements de sortie."],
  ["Ce qui n'est pas prêt", "Les décisions ouvertes, les livrables de terrain manquants et les conditions de lancement non encore remplies. Cette partie n'est jamais retirée de la présentation."],
];

export default function ContactPage() {
  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="À qui écrire, pour quoi, et sous quel délai"
        lead="Le programme n'utilise aucun formulaire qui n'aboutit nulle part : chaque demande arrive dans une boîte relevée par une personne identifiée. Cette page indique l'adresse correspondant à chaque type de demande, l'engagement de réponse associé, et la manière dont une personne qui ne sait pas écrire peut joindre un humain sans passer par un courrier électronique."
        meta={
          <>
            <span>{SITE.operator}</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.country}</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.status}</span>
          </>
        }
      />

      {!SITE.contactsActive && (
        <Section tone="white">
          <Callout tone="warn" title="Adresses en cours d'activation">
            <p>{SITE.contactsNote}</p>
            <p>
              Le domaine <strong>congovoice.cd</strong> et les adresses ci-dessous sont les adresses prévues du programme&nbsp;: elles sont activées avec l&apos;hébergement et l&apos;enregistrement du domaine, et ne doivent pas être considérées comme joignables aujourd&apos;hui. Une institution qui souhaite entrer en contact dès maintenant passe par son canal officiel habituel auprès du programme.
            </p>
          </Callout>
        </Section>
      )}

      <Section eyebrow="Les cinq adresses" title="Une adresse par type de demande" lead="Écrire à la bonne adresse fait gagner plusieurs jours : chaque boîte a son responsable et son engagement de réponse.">
        <div className="grid gap-4 lg:grid-cols-2">
          {ROUTES.map((r) => (
            <article key={r.key} className="card flex flex-col p-5">
              <h3 className="text-[16px] font-bold text-ink">{r.label}</h3>
              <p className="mt-1.5 text-[14px] font-semibold">
                <a href={`mailto:${r.address}`} className="link">
                  {r.address}
                </a>
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{r.purpose}</p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{r.commitment}</p>
            </article>
          ))}
        </div>
        {!SITE.contactsActive && <Note>{SITE.contactsNote}</Note>}
      </Section>

      <Section tone="white" eyebrow="Sans savoir écrire" title="Comment joindre un humain quand on ne peut pas envoyer de courrier" lead="La plupart des personnes que le programme sert n'écriront jamais un courrier électronique. Aucune démarche essentielle — poser une question, demander un humain, exercer un droit sur ses données — n'exige de savoir écrire.">
        <Steps
          items={[
            { title: "Par le service lui-même", body: "Dites-le pendant un appel ou dans une note vocale : demander à parler à quelqu'un suffit, sans justification. Un cas est ouvert et confié à une file d'attente avec un délai de prise en charge suivi." },
            { title: "Par un agent de proximité", body: "Un relais communautaire, un agent agricole ou un enseignant référent peut ouvrir la démarche pour vous, en déclarant qu'il agit pour votre compte. C'est la voie recommandée tant que les adresses du programme ne sont pas activées." },
            { title: "Par SMS ou par USSD", body: "Depuis un téléphone simple, sans internet : une demande d'accès ou d'effacement de vos données peut être ouverte par ce canal comme par n'importe quel autre." },
          ]}
        />
        <Callout tone="danger" title="En cas de danger, ne passez par aucun de ces canaux">
          <p>
            Rendez-vous immédiatement au centre de santé le plus proche.{" "}
            <Link href="/urgence" className="link">
              Voir la conduite à tenir et les signes de danger
            </Link>
            .
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Institutions" title="Demander une présentation du programme" lead="Un ministère, une division provinciale, un bailleur, une ONG ou un opérateur peut demander une présentation complète, en présentiel à Kinshasa ou à distance.">
        <Prose>
          <p>
            La demande se fait à{" "}
            <a href={`mailto:${SITE.contact.partnerships}`} className="link">
              {SITE.contact.partnerships}
            </a>{" "}
            en indiquant l&apos;institution, les provinces concernées, les modules qui vous intéressent et le nombre de participants. Une présentation dure environ quatre-vingt-dix minutes, dont un tiers de questions.
          </p>
        </Prose>
        <div className="mt-6">
          <DataTable head={["Ce que couvre une présentation", "Contenu"]} rows={BRIEFING.map((r) => [r[0], r[1]])} />
        </div>
        <Note>
          Sur demande&nbsp;: le relevé de consommation type, les définitions d&apos;indicateurs, la structure de la base de données, la liste des points d&apos;interface et la spécification complète du programme.
        </Note>
      </Section>

      <Section tone="white" eyebrow="Presse" title="Dossier de presse et texte de référence" lead="Les journalistes peuvent demander le dossier de presse à l'adresse presse. Le paragraphe ci-dessous est le texte de référence du programme : il peut être cité tel quel, en français ou en anglais.">
        <div className="grid gap-4 lg:grid-cols-2">
          <LangBlock native="Français" lang="texte de référence">
            {SITE.name} est une plateforme nationale d&apos;inclusion numérique vocale destinée à la {SITE.country}. Elle permet à toute personne d&apos;obtenir une orientation en santé, un conseil agricole et un appui scolaire en parlant dans sa langue — français, lingala, kikongo, kiswahili ou tshiluba —, depuis n&apos;importe quel téléphone, sans savoir lire ni écrire. Les décisions de sécurité y reposent sur des règles versionnées et vérifiables, non sur un modèle génératif, et toute situation sérieuse est transmise à un agent humain avec un délai de prise en charge suivi. Le service est gratuit pour les citoyens et financé par les institutions. Le programme est exploité par {SITE.operator}. Statut&nbsp;: {SITE.status.toLowerCase()}.
          </LangBlock>
          <LangBlock native="English" lang="reference text">
            {SITE.name} is a national voice-first digital inclusion platform for the Democratic Republic of the Congo. It lets anyone obtain health guidance, agricultural advice and school support by speaking in their own language — French, Lingala, Kikongo, Kiswahili or Tshiluba — from any telephone, without being able to read or write. Safety decisions rest on versioned, reviewable rules rather than on a generative model, and any serious situation is routed to a human worker under a tracked response clock. The service is free for citizens and funded by institutions. It is operated by {SITE.operator}. Status: pilot, preparing national deployment.
          </LangBlock>
        </div>
        <div className="mt-6">
          <Cards>
            <InfoCard title="Identité du programme" icon={<IconFile size={22} />}>
              Nom&nbsp;: {SITE.name}. Description courte&nbsp;: {SITE.shortDescription}. Exploitant&nbsp;: {SITE.operator}. Pays&nbsp;: {SITE.country}. Statut&nbsp;: {SITE.status}.
            </InfoCard>
            <InfoCard title="Langues servies" icon={<IconMessage size={22} />}>
              {SITE.languages.map((l) => l.native).join(", ")}. Chaque langue est ouverte module par module, uniquement après avoir franchi ses seuils de qualité, et peut être ramenée à un mode guidé si elle repasse sous ces seuils.
            </InfoCard>
            <InfoCard title="Sur demande" icon={<IconBriefcase size={22} />}>
              Captures d&apos;écran des interfaces citoyennes et institutionnelles, spécification complète du programme, documentation d&apos;architecture et de déploiement, et entretien avec un responsable. Aucune image de citoyen réel, aucun dossier réel et aucune donnée de santé ne sont fournis.
            </InfoCard>
          </Cards>
        </div>
        <Note>
          Le programme demande une seule chose aux rédactions&nbsp;: ne pas présenter le service comme un outil de diagnostic médical ni comme un service d&apos;urgence. Il ne l&apos;est pas, et le laisser croire mettrait des personnes en danger.{" "}
          <Link href="/gouvernance" className="link">
            Les limites du service sont documentées ici
          </Link>
          .
        </Note>
      </Section>

      <Section eyebrow="Sécurité" title="Signaler une faille ou un comportement dangereux">
        <Cards cols={2}>
          <InfoCard title="Divulgation responsable" tone="danger" icon={<IconShield size={22} />}>
            <p>
              Les signalements de sécurité vont à{" "}
              <a href={`mailto:${SITE.contact.safety}`} className="link">
                {SITE.contact.safety}
              </a>
              . Le programme s&apos;engage à accuser réception sous 72 heures, à qualifier le signalement, à tenir la personne informée jusqu&apos;à la correction et à ne pas engager de poursuite contre un chercheur agissant de bonne foi.
            </p>
          </InfoCard>
          <InfoCard title="Ce que nous demandons en retour" tone="danger" icon={<IconAlert size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Ne pas accéder à des données de citoyens, ne pas les extraire, ne pas les conserver et ne pas les diffuser.</li>
              <li>Ne pas dégrader le service ni saturer les files d&apos;attente humaines pendant les tests.</li>
              <li>Laisser un délai raisonnable de correction avant toute publication, et accepter d&apos;en discuter le calendrier.</li>
              <li>Signaler immédiatement, sans attendre, toute exposition de données réelles constatée.</li>
            </ul>
          </InfoCard>
        </Cards>
        <Prose>
          <p>
            Un signalement de sécurité couvre aussi bien une faille technique qu&apos;une <strong>erreur d&apos;orientation dangereuse</strong>&nbsp;: une réponse qui rassure à tort devant un signe de danger est traitée comme un défaut critique, au même titre qu&apos;une fuite de données. Ce type de cas est ajouté à la suite de tests adverses du programme afin qu&apos;il ne puisse pas réapparaître.
          </p>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Vos données" title="Exercer un droit sur vos données">
        <Cards cols={2}>
          <InfoCard title="Par écrit" icon={<IconFile size={22} />}>
            À{" "}
            <a href={`mailto:${SITE.contact.dataProtection}`} className="link">
              {SITE.contact.dataProtection}
            </a>
            &nbsp;: copie de vos données, correction, effacement, opposition, retrait d&apos;un consentement. Chaque demande ouvre un dossier avec une échéance de trente jours, suivie automatiquement.
          </InfoCard>
          <InfoCard title="Sans écrire" icon={<IconUsers size={22} />}>
            Par la voix pendant un appel, par SMS, par USSD, ou par l&apos;intermédiaire d&apos;un relais communautaire, d&apos;un agent agricole ou d&apos;un enseignant référent. La demande a exactement la même valeur.{" "}
            <Link href="/confidentialite" className="link">
              Voir la notice de protection des données
            </Link>
            .
          </InfoCard>
        </Cards>
        <Note>
          Voir aussi{" "}
          <Link href="/partenaires" className="link">
            les modalités de partenariat
          </Link>
          ,{" "}
          <Link href="/financement" className="link">
            le modèle de financement
          </Link>
          ,{" "}
          <Link href="/accessibilite" className="link">
            la déclaration d&apos;accessibilité
          </Link>{" "}
          et{" "}
          <Link href="/aide" className="link">
            les questions fréquentes
          </Link>
          .{!SITE.contactsActive && <> {SITE.contactsNote}</>}
        </Note>
      </Section>

      <CtaBand
        title="Une question qui n'entre dans aucune de ces cases ?"
        body="Écrivez à l'adresse générale : la demande sera réorientée vers la bonne équipe et vous en serez informé."
        primary={{ href: "/programme", label: "Découvrir le programme" }}
        secondary={{ href: "/acces", label: "Comment joindre le service" }}
      />
    </>
  );
}
