import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Prose, Callout, DataTable, Note, CtaBand } from "@client/components/public/ui";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description:
    "Ce que le service est et n'est pas, sa gratuité, l'absence de garantie de continuité, l'usage acceptable, les responsabilités de chacun et le droit applicable.",
  alternates: { canonical: "/conditions" },
  openGraph: {
    title: "Conditions d'utilisation — CONGO VOICE AI OS",
    description: "Conditions simples et numérotées : périmètre du service, gratuité, limites, usage acceptable, responsabilités, escalade humaine et droit applicable.",
    url: "/conditions",
  },
};

const LAST_UPDATED = "6 septembre 2026";

export default function ConditionsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Conditions"
        title="Conditions d'utilisation, en langage clair"
        lead="Ces conditions s'appliquent à toute personne qui utilise CONGO VOICE AI OS, quel que soit le canal : appel vocal, WhatsApp, USSD, SMS, application web ou guichet assisté. Elles sont écrites pour être comprises et lues à voix haute. En cas de doute sur un point, écrivez-nous : nous préférons expliquer plutôt qu'opposer un texte."
        meta={
          <>
            <span>Version 1.0</span>
            <span aria-hidden="true">·</span>
            <span>Dernière mise à jour&nbsp;: {LAST_UPDATED}</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.status}</span>
          </>
        }
      />

      <Section tone="white">
        <Callout tone="danger" title="Ce service n'est pas un service d'urgence">
          <p>
            Devant un signe de danger, ne perdez pas de temps à écrire ou à appeler le service&nbsp;: rendez-vous immédiatement au centre de santé le plus proche.{" "}
            <Link href="/urgence" className="link">
              Voir la liste des signes de danger
            </Link>
            .
          </p>
        </Callout>
      </Section>

      <Section eyebrow="Les règles" title="Douze articles">
        <Prose>
          <h3>1. Ce qu&apos;est le service</h3>
          <p>
            CONGO VOICE AI OS est un service public d&apos;information et d&apos;orientation, accessible par la parole, en français, lingala, kikongo, kiswahili et tshiluba. Il vous écoute, essaie de comprendre votre situation, vous explique la conduite à tenir dans votre langue, et transmet votre cas à une personne — relais communautaire, agent agricole ou enseignant — lorsque la situation le justifie. Il est exploité par {SITE.operator} pour le compte de l&apos;institution publique qui porte le programme.
          </p>

          <h3>2. Ce que le service n&apos;est pas</h3>
          <ul>
            <li>Ce n&apos;est pas un service d&apos;urgence. Il n&apos;envoie ni ambulance, ni secours.</li>
            <li>Il n&apos;établit aucun diagnostic médical et ne prescrit aucun traitement soumis à ordonnance.</li>
            <li>Il ne remplace ni un médecin, ni un agronome, ni un enseignant, ni un conseil juridique.</li>
            <li>Il ne prend aucune décision d&apos;éligibilité, d&apos;attribution, de sanction ou de surveillance concernant une personne.</li>
            <li>Il ne garantit aucun prix de marché&nbsp;: il indique une source, un marché et une date.</li>
            <li>Il ne recommande aucun produit chimique absent du registre des intrants autorisés.</li>
          </ul>

          <h3>3. Gratuité</h3>
          <p>
            L&apos;usage du service est gratuit pour le citoyen. Il n&apos;existe ni abonnement, ni offre payante, ni publicité, ni mise en avant rémunérée d&apos;un produit ou d&apos;un établissement. Les coûts de communication éventuellement facturés par votre opérateur — appel, données, SMS — relèvent de votre contrat avec lui&nbsp;; le programme négocie la gratuité pour l&apos;appelant, mais ne peut pas la garantir tant que les accords ne sont pas conclus.
          </p>

          <h3>4. Absence de garantie de continuité</h3>
          <p>
            Le service est fourni en l&apos;état, sans garantie de disponibilité permanente ni d&apos;exactitude de chaque réponse. Une panne de réseau, une coupure d&apos;électricité, l&apos;indisponibilité d&apos;un fournisseur technique ou une opération de maintenance peuvent l&apos;interrompre ou en dégrader la qualité. En cas d&apos;indisponibilité des composants d&apos;intelligence artificielle, le service continue dans un mode simplifié fondé sur des textes approuvés&nbsp;: les fonctions de sécurité restent actives, la richesse des réponses diminue.
          </p>

          <h3>5. Usage acceptable</h3>
          <p>En utilisant le service, vous vous engagez à ne pas&nbsp;:</p>
          <ul>
            <li>saturer ou détourner les files d&apos;attente humaines, notamment par des demandes d&apos;urgence fictives, qui retardent la prise en charge d&apos;une personne réellement en danger&nbsp;;</li>
            <li>envoyer des messages automatisés en masse, ni tenter d&apos;épuiser les ressources du service&nbsp;;</li>
            <li>transmettre les données d&apos;une autre personne à son insu&nbsp;; si vous agissez pour quelqu&apos;un, dites-le, le service enregistre ce contexte&nbsp;;</li>
            <li>tenter d&apos;accéder aux dossiers d&apos;autrui, aux consignes internes du système ou à ses composants techniques&nbsp;;</li>
            <li>transmettre des contenus illicites, haineux, ou destinés à nuire à une personne&nbsp;;</li>
            <li>utiliser le service pour obtenir des réponses d&apos;examen à la place d&apos;un apprenant&nbsp;: le module éducatif explique et fait chercher, il ne rend pas un devoir à la place de l&apos;enfant.</li>
          </ul>

          <h3>6. Ce dont vous êtes responsable</h3>
          <ul>
            <li>De la décision finale&nbsp;: le service oriente, vous décidez. Devant un signe de danger, partez au centre de santé sans attendre.</li>
            <li>De l&apos;exactitude de ce que vous décrivez&nbsp;: une description incomplète peut conduire à une orientation inadaptée.</li>
            <li>Du respect de la vie privée des tiers dont vous parlez ou dont vous envoyez une image.</li>
            <li>De la sécurité de votre téléphone, en particulier lorsqu&apos;il est partagé dans le ménage.</li>
          </ul>

          <h3>7. Ce dont le programme est responsable</h3>
          <ul>
            <li>Appliquer les règles de sécurité décrites publiquement&nbsp;: détection des signes de danger dans les cinq langues, gravité décidée par des règles versionnées et non par un modèle, obligation de citer une source approuvée, escalade vers un humain.</li>
            <li>Protéger vos données conformément à la notice de protection des données et répondre à vos demandes dans le délai légal de trente jours.</li>
            <li>Dire ce que le service ne sait pas plutôt que d&apos;inventer, et indiquer son degré de certitude.</li>
            <li>Publier ses limites, ses incidents de sécurité significatifs et l&apos;état réel de chaque canal et de chaque langue.</li>
            <li>Ne jamais vendre vos données, ne jamais afficher de publicité, ne jamais monnayer un classement.</li>
          </ul>

          <h3>8. Escalade et revue humaine</h3>
          <p>
            Certaines situations ouvrent automatiquement un cas confié à une personne&nbsp;: gravité élevée, doute du système sur ce qu&apos;il a compris, absence de source approuvée pour répondre, divulgation relevant de la protection des personnes, ou simple demande de votre part de parler à quelqu&apos;un. Chaque cas escaladé porte un délai de prise en charge suivi, et remonte automatiquement au niveau supérieur en cas de dépassement. Le programme s&apos;engage sur l&apos;existence et le suivi de ce circuit&nbsp;; il ne peut pas garantir la disponibilité individuelle d&apos;un agent à un instant donné, celle-ci relevant des institutions qui l&apos;emploient.
          </p>

          <h3>9. Contenus et licence sur le corpus</h3>
          <p>
            Vous conservez la propriété de ce que vous dites, écrivez et envoyez. Vous accordez au programme le droit d&apos;utiliser ces contenus pour vous répondre, pour transmettre votre cas à la personne compétente et pour tenir les registres exigés. L&apos;utilisation de vos échanges pour améliorer la compréhension des langues nationales relève d&apos;un consentement de recherche distinct, que vous pouvez refuser ou retirer sans perdre le service&nbsp;; dans ce cadre, les échantillons sont dé-identifiés et les exports sont tracés. Le corpus ainsi constitué appartient au programme public qui l&apos;a financé&nbsp;: il ne doit pas être privatisé. La rédaction contractuelle définitive de ce point est une décision ouverte du programme.
          </p>
          <p>
            Les textes de référence — protocoles approuvés, documents de connaissance, lexiques — restent la propriété de leurs autorités d&apos;origine. Les marques et signes distinctifs du programme et de son exploitant ne peuvent pas être utilisés sans autorisation écrite.
          </p>

          <h3>10. Suspension en cas d&apos;abus</h3>
          <p>
            Un usage qui met en danger la capacité du service à protéger d&apos;autres personnes — saturation des files, urgences fictives répétées, envois automatisés en masse, tentative d&apos;accès aux données d&apos;autrui — peut entraîner une limitation de débit, la suspension d&apos;un accès ou la fermeture d&apos;un compte institutionnel. Toute mesure est motivée, enregistrée dans le journal d&apos;audit et contestable en écrivant au programme. Les fonctions de sécurité en situation d&apos;urgence ne sont jamais coupées à titre de sanction.
          </p>

          <h3>11. Droit applicable et règlement des différends</h3>
          <p>
            Le service est fourni en République Démocratique du Congo et le droit congolais lui est applicable, notamment l&apos;Ordonnance-loi n°&nbsp;23/010 du 13&nbsp;mars 2023 portant Code du numérique en ce qui concerne les données à caractère personnel. Un différend est d&apos;abord porté au programme, qui répond dans un délai raisonnable. En matière de protection des données, vous pouvez saisir directement l&apos;autorité nationale compétente sans passer par le programme. La désignation de l&apos;institution publique responsable et la juridiction compétente sont fixées dans la convention de programme, qui doit être conclue avant l&apos;ouverture publique du service.
          </p>

          <h3>12. Évolution des conditions</h3>
          <p>
            Ces conditions portent un numéro de version et une date. Toute modification substantielle — périmètre du service, responsabilités, usage des contenus, conservation des données — est annoncée avant sa prise d&apos;effet sur cette page et, pour les personnes qui ont accepté de recevoir des messages, par le canal qu&apos;elles utilisent, dans leur langue. Continuer à utiliser le service après cette annonce vaut acceptation de la nouvelle version. Les versions antérieures restent communicables sur demande.
          </p>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Repères" title="L'essentiel en un tableau">
        <DataTable
          head={["Question", "Réponse"]}
          rows={[
            ["Le service coûte-t-il quelque chose ?", "Non pour le citoyen. Seuls les frais éventuels de votre opérateur s'appliquent."],
            ["Est-ce un service d'urgence ?", "Non. Devant un signe de danger, allez immédiatement au centre de santé le plus proche."],
            ["Le service peut-il me diagnostiquer ?", "Non. Il oriente, explique et alerte un humain ; il ne pose aucun diagnostic et ne prescrit rien."],
            ["Puis-je parler à une personne ?", "Oui, sur simple demande, sans justification."],
            ["Mes données sont-elles vendues ?", "Non. Aucune vente, aucun courtage, aucune publicité, aucun classement payant."],
            ["Puis-je faire effacer mes données ?", "Oui, dans un délai de trente jours. Le journal d'audit, qui ne contient pas de texte personnel, est conservé."],
            ["Le service fonctionne-t-il sans internet ?", "Oui, par appel vocal et par USSD, sur les téléphones les plus simples."],
            ["Que se passe-t-il si l'intelligence artificielle est indisponible ?", "Le service continue en mode simplifié sur des textes approuvés ; les fonctions de sécurité restent actives."],
          ]}
        />
        <Note>
          Version 1.0, publiée le {LAST_UPDATED}. Ces conditions seront complétées avant l&apos;ouverture publique par la désignation de l&apos;institution responsable et par les clauses de la convention de programme. Voir aussi{" "}
          <Link href="/confidentialite" className="link">
            la protection des données
          </Link>
          ,{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance et la sécurité
          </Link>{" "}
          et{" "}
          <Link href="/aide" className="link">
            les questions fréquentes
          </Link>
          .{!SITE.contactsActive && <> {SITE.contactsNote}</>}
        </Note>
      </Section>

      <CtaBand
        title="Une clause vous paraît obscure ou injuste ?"
        body="Ces conditions doivent pouvoir être lues à voix haute et comprises par la personne qu'elles engagent. Signalez-nous toute formulation qui ne l'est pas."
        primary={{ href: "/contact", label: "Écrire au programme" }}
        secondary={{ href: "/confidentialite", label: "Lire la notice de données" }}
      />
    </>
  );
}
