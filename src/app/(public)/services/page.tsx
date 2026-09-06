import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@shared/site";
import { PageIntro, Section, Cards, InfoCard, DataTable, Prose, Callout, LangBlock, Note, CtaBand, AnchorNav } from "@client/components/public/ui";
import { IconAlert, IconBook, IconGraduation, IconHeart, IconLeaf, IconShield, IconUsers } from "@client/components/icons";

export const metadata: Metadata = {
  title: "Les services",
  description:
    "Santé, agriculture et éducation : ce que vous pouvez demander dans votre langue, ce que le service répond, ce qu'il refuse de faire, les sources qu'il cite et qui reçoit l'alerte.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Les services — CONGO VOICE AI OS",
    description: "Ce que les trois services font, ce qu'ils ne font pas, leurs sources approuvées et leurs voies d'escalade vers un humain.",
    url: "/services",
  },
};

/** The seven parts of every answer, as composed by the orchestrator (FinalAnswer). */
const ANSWER_PARTS: Array<[string, string]> = [
  ["Ce qui a été dit", "Votre message tel qu'il a été entendu, transcrit et traduit en français si vous avez parlé une autre langue. Vous pouvez vérifier que le service n'a rien inventé."],
  ["Ce qui a été compris", "Une reformulation courte de votre situation, dans votre langue. Si elle est fausse, dites-le : la suite de la réponse est refaite à partir de la correction."],
  ["Le risque", "Un niveau de risque décidé par des règles écrites, pas par le modèle de langage : faible, moyen, élevé ou critique, avec les signaux qui l'ont déclenché."],
  ["L'action", "Ce qu'il faut faire, en premier, avec des mots simples : où aller, dans quel délai, quels gestes faire en attendant, ce qu'il ne faut surtout pas faire."],
  ["L'escalade", "Si un humain doit intervenir, le service le dit et nomme la personne concernée : agent de santé communautaire, agent agricole du secteur ou enseignant référent."],
  ["La confiance", "Un pourcentage de certitude. Sous le seuil, le service dit qu'il n'est pas sûr d'avoir bien compris et pose une question au lieu de trancher."],
  ["Le résumé enregistré", "Une ligne de résumé conservée avec l'échange, pour que la personne qui vous rappellera sache déjà de quoi il s'agit sans vous faire tout répéter."],
];

const SEVERITY: Array<[string, string, string, string]> = [
  ["0", "Soins à la maison", "Pas de déplacement nécessaire", "Repos, boisson, alimentation normale, surveillance"],
  ["1", "Surveiller à la maison", "Revoir sous 72 heures si rien ne change", "Signalement au relais communautaire si un signe apparaît"],
  ["2", "Centre de santé sous 24 heures", "Dans les 24 heures", "Consultation au centre de santé"],
  ["3", "Centre de santé aujourd'hui", "Le jour même", "Consultation au centre de santé le jour même"],
  ["4", "Urgence, partir maintenant", "Immédiatement", "Référence en urgence, relais communautaire alerté"],
];

const PROTOCOLS: Array<[string, string]> = [
  ["Fièvre chez l'enfant de moins de 5 ans", "Durée de la fièvre, âge en mois, test de paludisme, éruption, capacité à boire. Signes de danger vérifiés d'abord."],
  ["Fièvre chez l'adolescent et l'adulte", "Durée, grossesse, test de paludisme, yeux jaunes, sang dans les urines, maux de tête violents, toux de plus de deux semaines."],
  ["Toux et difficulté respiratoire", "Rythme respiratoire, tirage des côtes, durée de la toux, sifflement, fièvre associée."],
  ["Diarrhée et déshydratation", "Nombre de selles, sang dans les selles, capacité à boire, yeux enfoncés, pli cutané, préparation de la solution de réhydratation orale."],
  ["Signes de danger pendant la grossesse", "Saignement, douleur abdominale continue, maux de tête avec vision trouble, fièvre, perte des eaux, mouvements du bébé."],
  ["Signes de danger du nouveau-né (0 à 28 jours)", "Fièvre ou corps froid, refus de téter, gémissements, convulsions, nombril infecté, jaunisse des paumes et des plantes."],
  ["Blessures, saignements, brûlures et morsures", "Compression d'une plaie, brûlure étendue, morsure de serpent, corps étranger, statut vaccinal contre le tétanos."],
  ["Dépistage de la malnutrition aiguë", "Mesure du périmètre brachial, œdèmes des pieds, perte de poids, orientation vers le programme nutritionnel."],
  ["Calendrier vaccinal (PEV — RDC)", "Vaccins dus selon l'âge de l'enfant, retards à rattraper, où et quand se présenter."],
  ["Accueil et orientation santé (symptôme général)", "Entrée générale quand la plainte ne correspond encore à aucun protocole : elle oriente vers le bon protocole ou vers une consultation."],
];

const HEALTH_SOURCES: Array<[string, string]> = [
  ["KB-HE-FEVER-01, KB-HE-TRIAGE-01, KB-HE-PREV-01", "Ministère de la Santé Publique, Hygiène et Prévention — PCIME communautaire (OMS/UNICEF), Programme national de lutte contre le paludisme"],
  ["KB-HE-DIARR-01, KB-HE-WASH-01", "PCIME communautaire — diarrhée, déshydratation, solution de réhydratation orale, eau et hygiène"],
  ["KB-HE-PREG-01, KB-HE-NEWB-01", "PCIME communautaire — grossesse et nouveau-né"],
  ["KB-HE-NUTR-01, KB-HE-VACC-01", "Programme national de nutrition, Programme élargi de vaccination (PEV), RDC"],
  ["KB-HE-INJ-01, KB-HE-EMERG-01", "Premiers secours communautaires (OMS / Croix-Rouge), directives nationales sur les envenimations"],
  ["KB-HE-EPID-01, KB-HE-MEDS-01, KB-HE-MENTAL-01", "Surveillance intégrée de la maladie et riposte (SIMR), Direction de la Pharmacie et du Médicament"],
];

const NOTIFIABLE: Array<[string, string]> = [
  ["Chenille légionnaire d'automne", "Cultures — maïs principalement"],
  ["Mosaïque africaine du manioc", "Cultures — manioc"],
  ["Striure brune du manioc", "Cultures — manioc"],
  ["Bunchy top du bananier", "Cultures — bananier et plantain"],
  ["Invasion acridienne (criquets)", "Cultures — toutes"],
  ["Maladie de Newcastle", "Élevage — volailles"],
  ["Peste des petits ruminants", "Élevage — chèvres et moutons"],
  ["Peste porcine africaine", "Élevage — porcs"],
];

const AGRI_SOURCES: Array<[string, string]> = [
  ["KB-AG-001 à KB-AG-003", "INERA / FAO — mosaïque du manioc, striure brune, chenille légionnaire sur maïs"],
  ["KB-AG-004 à KB-AG-008", "INERA / FAO — maïs, arachide, riz, haricot, banane plantain"],
  ["KB-AG-009, KB-AG-010", "INERA / FAO — fertilité des sols, compost, rotation, stockage et pertes après récolte"],
  ["KB-AG-011, KB-AG-012", "Direction des productions animales / FAO — Newcastle, PPR, peste porcine africaine, petit élevage"],
  ["KB-AG-013", "SNSA / FAO — lire et utiliser les prix du marché"],
];

const EDU_STEPS: Array<[string, string]> = [
  ["Objectif", "La séance est rattachée à un objectif du programme national, avec son code, sa classe et son poids éventuel au TENAFEP ou à l'Examen d'État."],
  ["Vérification préalable", "Une question courte sur le pré-requis. Inutile d'expliquer les fractions à qui ne maîtrise pas encore le partage en parts égales."],
  ["Micro-explication", "Un seul concept, moins de quatre-vingt-dix secondes à voix haute. Le texte est coupé à la phrase si l'explication dépasse."],
  ["Exemple congolais", "Le marché, le manioc, les mangues, le franc congolais, la pirogue, le champ, l'école du village — pas un exemple abstrait."],
  ["Essai guidé", "L'élève essaie avec un indice disponible ; le service ne passe pas à la suite tant que l'essai n'a pas eu lieu."],
  ["Retour nommé", "Jamais « faux » tout court : l'erreur est nommée, expliquée comme une erreur fréquente, et corrigée par un geste précis."],
  ["Essai autonome", "Un second exercice, sans indice, pour voir si la notion tient sans appui."],
  ["Récapitulatif et suite", "Ce qui a été appris en une phrase, et la prochaine étape de travail."],
];

const EDU_SOURCES: Array<[string, string]> = [
  ["KB-ED-001 à KB-ED-003", "Ministère de l'EPST — fractions, division, tables de multiplication au primaire"],
  ["KB-ED-004 à KB-ED-006", "Ministère de l'EPST — lecture et compréhension, conjugaison française, sciences au primaire"],
  ["KB-ED-007, KB-ED-008", "Ministère de l'EPST — TENAFEP, Examen d'État : structure des épreuves et méthode de révision"],
  ["KB-ED-009", "Ministère de l'EPST — accompagner son enfant à la maison, guide pour les parents"],
];

export default function ServicesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Les trois services"
        title="Santé, agriculture, éducation : ce que le service fait, et ce qu&apos;il refuse de faire"
        lead="Une seule conversation, trois services. Vous parlez de ce que vous vivez — un enfant qui a de la fièvre, un champ qui jaunit, une leçon que votre fille ne comprend pas — et le service répond toujours de la même manière : ce qu'il a entendu, ce qu'il a compris, le risque, ce qu'il faut faire, qui est prévenu, et à quel point il est sûr de lui."
        meta={
          <>
            <span>Gratuit pour les citoyens</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.languages.map((l) => l.label).join(" · ")}</span>
            <span aria-hidden="true">·</span>
            <span>{SITE.status}</span>
          </>
        }
      />

      <Section tone="white" eyebrow="La forme de la réponse" title="Sept parties, toujours les mêmes" lead="Quel que soit le service et quel que soit le canal, une réponse est composée de sept parties. Cette régularité est volontaire : une personne qui a entendu la réponse une fois sait ensuite où se trouve l'information qu'elle cherche.">
        <DataTable head={["Partie de la réponse", "Ce qu'elle contient"]} rows={ANSWER_PARTS.map(([a, b]) => [a, b])} />
        <Note>
          Le service ne pose jamais plus de deux questions de précision avant de répondre. S&apos;il manque encore une information après ces deux questions, il donne l&apos;orientation la plus prudente et dit ce qui reste incertain, plutôt que de continuer à interroger une personne inquiète.
        </Note>
      </Section>

      <Section>
        <AnchorNav
          items={[
            { href: "#sante", label: "Santé communautaire" },
            { href: "#agriculture", label: "Agriculture et élevage" },
            { href: "#education", label: "Éducation" },
          ]}
        />
      </Section>

      {/* ────────────────────────────── SANTÉ ────────────────────────────── */}

      <Section
        id="sante"
        tone="white"
        eyebrow="Service 1 — Santé communautaire"
        title="Une orientation, jamais un diagnostic"
        lead="Le service écoute une plainte de santé, vérifie d'abord les signes de danger, applique un protocole écrit et approuvé, puis dit où aller et dans quel délai. Il ne nomme pas de maladie, il ne prescrit rien, et il alerte un humain dès que la situation le demande."
      >
        <Cards cols={2}>
          <InfoCard title="Ce que vous pouvez demander" tone="health" icon={<IconHeart size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Une fièvre, une toux, une diarrhée, une blessure, une morsure.</li>
              <li>Une grossesse, un accouchement récent, un nouveau-né qui inquiète.</li>
              <li>La vaccination d&apos;un bébé et les vaccins en retard.</li>
              <li>L&apos;alimentation d&apos;un enfant qui maigrit.</li>
              <li>Un enfant qui ne va pas bien, sans savoir mettre un mot dessus.</li>
            </ul>
          </InfoCard>
          <InfoCard title="Ce que le service refuse de faire" tone="danger" icon={<IconAlert size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Dire « vous avez le paludisme » ou toute autre maladie affirmée.</li>
              <li>Donner une dose, un nombre de comprimés ou une durée de traitement.</li>
              <li>Conseiller un médicament soumis à ordonnance.</li>
              <li>Remplacer une consultation, un examen ou un test de laboratoire.</li>
              <li>Servir de numéro d&apos;urgence : devant un signe de danger, il vous dit de partir tout de suite.</li>
            </ul>
          </InfoCard>
        </Cards>

        <div className="mt-8">
          <h3 className="text-[17px] font-bold text-ink">Ce que des personnes disent réellement</h3>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">Ces phrases sont des exemples de messages tels qu&apos;ils arrivent, dans la langue et avec le mélange de langues du quotidien. Aucune n&apos;a besoin d&apos;être reformulée pour être traitée.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LangBlock lang="Français" native="Français">
              «&nbsp;Mon enfant de 3 ans a de la fièvre depuis deux jours et il vomit tout ce qu&apos;il boit.&nbsp;»
            </LangBlock>
            <LangBlock lang="Lingala" native="Lingála">
              «&nbsp;Mwana na ngai azali na fièvre makasi, azali kolela te mpe akoki komela te.&nbsp;»
            </LangBlock>
            <LangBlock lang="Kiswahili" native="Kiswahili">
              «&nbsp;Nina mimba ya miezi saba na nina damu nyingi tangu asubuhi.&nbsp;»
            </LangBlock>
            <LangBlock lang="Kikongo" native="Kikongo">
              «&nbsp;Mono kele na fièvre ti mpasi ya ntu banda kilumbu tatu.&nbsp;»
            </LangBlock>
            <LangBlock lang="Tshiluba" native="Tshilubà">
              «&nbsp;Muana wanyi udi ne tshibindu ne kabeela kadi katshiena umvua.&nbsp;»
            </LangBlock>
            <LangBlock lang="Français" native="Français">
              «&nbsp;Je suis enceinte de six mois, j&apos;ai des maux de tête très forts et je vois flou.&nbsp;»
            </LangBlock>
          </div>
        </div>
      </Section>

      <Section eyebrow="Santé — les règles" title="Dix protocoles écrits, et une échelle de gravité de 0 à 4" lead="La gravité n'est jamais décidée par un modèle de langage. Elle est décidée par un arbre de décision écrit en clair, versionné, relu et rejouable : les mêmes réponses donnent toujours la même gravité, hier comme demain, avec ou sans fournisseur d'intelligence artificielle disponible.">
        <DataTable head={["Protocole", "Ce qu'il examine"]} rows={PROTOCOLS.map(([a, b]) => [a, b])} caption="Les dix protocoles de santé actuellement chargés dans la plateforme, tous en version 1.0.0." />
        <div className="mt-6">
          <DataTable
            head={["Niveau", "Ce que cela veut dire", "Délai", "Destination"]}
            rows={SEVERITY.map(([a, b, c, d]) => [a, b, c, d])}
            caption="Échelle de gravité commune à tous les protocoles. Le niveau 4 est atteint dès qu'un seul signe de danger est reconnu, sans autre condition."
          />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Callout tone="danger" title="Les signes de danger passent avant tout">
            <p>
              Huit signes de danger — convulsions, inconscience, impossibilité de boire ou de téter, vomissements de tout, respiration très difficile, nuque raide, saignement abondant, corps très froid ou très chaud — sont reconnus par mots-clés dans les cinq langues, <strong>avant</strong> tout appel à l&apos;intelligence artificielle. Un seul suffit à faire passer la conversation en gravité maximale.
            </p>
            <p>
              <Link href="/urgence" className="link">
                Voir la liste complète et le message d&apos;urgence dans les cinq langues
              </Link>
            </p>
          </Callout>
          <Callout tone="warn" title="Un filtre de sortie, en plus des règles">
            <p>
              Avant d&apos;être prononcée, toute réponse de santé passe par un filtre qui supprime les phrases contenant une posologie, un nombre de comprimés, une affirmation de diagnostic ou la formule « je diagnostique ». Ce qui est supprimé est enregistré et compté : ce n&apos;est pas seulement effacé, c&apos;est signalé.
            </p>
          </Callout>
        </div>
      </Section>

      <Section tone="white" eyebrow="Santé — sources et escalade">
        <Cards cols={2}>
          <InfoCard title="Les sources citées" icon={<IconBook size={22} />}>
            <p>Chaque réponse cite au moins un document approuvé, par son identifiant, ainsi que le protocole et sa version. Vous pouvez demander de qui vient l&apos;information.</p>
          </InfoCard>
          <InfoCard title="Qui reçoit l&apos;escalade" tone="health" icon={<IconUsers size={22} />}>
            <p>
              L&apos;<strong>agent de santé communautaire</strong> du territoire, avec le résumé, l&apos;enregistrement d&apos;origine, la traduction, la gravité et les règles déclenchées. Un délai de prise en charge est suivi ; en cas de dépassement, le cas remonte au niveau supérieur. Pour les cas critiques, la coordination provinciale est prévenue en même temps.
            </p>
          </InfoCard>
        </Cards>
        <div className="mt-6">
          <DataTable head={["Documents", "Autorité et source"]} rows={HEALTH_SOURCES.map(([a, b]) => [a, b])} />
        </div>
        <Note>
          Tous les protocoles et tous les documents de santé portent la mention «&nbsp;En attente du Comité de Revue Clinique&nbsp;» tant que le comité ne les a pas signés. Cette mention n&apos;est pas décorative&nbsp;: elle est inscrite dans le contenu lui-même et s&apos;affiche partout où le document est cité. Voir{" "}
          <Link href="/gouvernance" className="link">
            la gouvernance clinique
          </Link>
          .
        </Note>
      </Section>

      {/* ─────────────────────────── AGRICULTURE ─────────────────────────── */}

      <Section
        id="agriculture"
        eyebrow="Service 2 — Agriculture et élevage"
        title="Des hypothèses honnêtes, des actions gratuites d&apos;abord, aucun produit chimique inventé"
        lead="Le service écoute une description, regarde une photo si vous pouvez en envoyer une, et propose au plus trois hypothèses classées, chacune avec ce qui plaide pour elle et ce qui plaide contre. Il commence toujours par ce que vous pouvez faire sans dépenser un franc."
      >
        <Cards cols={2}>
          <InfoCard title="Ce que vous pouvez demander" tone="agri" icon={<IconLeaf size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Des feuilles qui jaunissent, se tachent, se recroquevillent ou tombent.</li>
              <li>Des chenilles, des insectes, des trous dans les plants.</li>
              <li>Des animaux malades ou morts : chèvres, poules, porcs, bovins.</li>
              <li>Le bon moment pour semer, avec les pluies de votre province.</li>
              <li>Les prix relevés sur les marchés, le stockage, la fertilité du sol.</li>
            </ul>
          </InfoCard>
          <InfoCard title="Ce que le service refuse de faire" tone="danger" icon={<IconAlert size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Affirmer un diagnostic à distance comme s&apos;il était confirmé.</li>
              <li>Nommer un produit chimique ou vétérinaire absent du registre des intrants autorisés.</li>
              <li>Inventer un prix de marché, une date de semis ou une prévision météo.</li>
              <li>Conseiller un produit interdit en RDC, ou un produit réservé au vétérinaire.</li>
              <li>Déclarer une épidémie : seul un agent qualifié valide un foyer.</li>
            </ul>
          </InfoCard>
        </Cards>

        <div className="mt-8">
          <h3 className="text-[17px] font-bold text-ink">Ce que des cultivateurs et des éleveurs disent réellement</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LangBlock lang="Lingala" native="Lingála">
              «&nbsp;Bilanga na ngai ya manioc ezali na makasa ya jaune mpe ekomi kokufa, ezali kopanzana na bilanga mobimba.&nbsp;»
            </LangBlock>
            <LangBlock lang="Kiswahili" native="Kiswahili">
              «&nbsp;Mahindi yangu yana viwavi, majani yametobolewa na shamba lote linaathirika.&nbsp;»
            </LangBlock>
            <LangBlock lang="Kikongo" native="Kikongo">
              «&nbsp;Ntaba na mono ke na pulupulu, beto sala nki&nbsp;?&nbsp;»
            </LangBlock>
            <LangBlock lang="Français" native="Français">
              «&nbsp;Mes poules meurent une par une, elles ont le cou tordu.&nbsp;»
            </LangBlock>
            <LangBlock lang="Kiswahili" native="Kiswahili">
              «&nbsp;Bei ya mihogo sokoni Lubumbashi ni ngapi wiki hii&nbsp;?&nbsp;»
            </LangBlock>
            <LangBlock lang="Français" native="Français">
              «&nbsp;Quel est le bon moment pour planter le maïs avec les pluies qui commencent&nbsp;?&nbsp;»
            </LangBlock>
          </div>
        </div>
      </Section>

      <Section tone="white" eyebrow="Agriculture — comment la réponse est construite" title="Trois hypothèses, avec ce qui plaide pour et ce qui plaide contre">
        <Prose>
          <p>
            Le service ne dit pas «&nbsp;c&apos;est la mosaïque du manioc&nbsp;». Il classe au plus trois hypothèses, chacune avec une probabilité, les <strong>indices retenus</strong> et les <strong>indices contraires ou manquants</strong>. La formulation change selon la certitude&nbsp;:
          </p>
          <ul>
            <li>
              au-dessus de <strong>60&nbsp;%</strong> pour la première hypothèse&nbsp;: «&nbsp;correspondance la plus probable, à confirmer sur le terrain&nbsp;»&nbsp;;
            </li>
            <li>
              en dessous&nbsp;: «&nbsp;correspondance possible&nbsp;», et une deuxième photo est demandée, sous un autre angle — face inférieure des feuilles, ou l&apos;animal entier puis la partie atteinte&nbsp;;
            </li>
            <li>
              en dessous de <strong>40&nbsp;%</strong>&nbsp;: le cas part vers un agent agricole quelle que soit l&apos;urgence, parce qu&apos;un diagnostic à distance trop incertain ne doit engager aucune dépense.
            </li>
          </ul>
          <p>
            Une photo floue, sombre ou trop éloignée est refusée <em>avant</em> toute analyse, avec l&apos;indication de ce qu&apos;il faut refaire&nbsp;: photo nette de la partie atteinte, à la lumière du jour, à environ trente centimètres. Une vidéo est conservée comme preuve pour l&apos;agent agricole, mais elle n&apos;est pas analysée automatiquement, et le service vous le dit.
          </p>
          <h3>Trois niveaux d&apos;action, dans cet ordre</h3>
          <ol>
            <li>
              <strong>Sans dépense</strong> — retirer et détruire les plants ou parties atteints loin du champ, isoler les animaux malades, nettoyer l&apos;abreuvoir et la mangeoire à l&apos;eau savonneuse, noter la date, la parcelle et le nombre de plants ou d&apos;animaux touchés.
            </li>
            <li>
              <strong>Avec de petits moyens locaux</strong> — ce qui se trouve au village ou au marché voisin, sans achat de produit chimique.
            </li>
            <li>
              <strong>Si un achat s&apos;avère nécessaire</strong> — et seulement là, un produit homologué peut être nommé, sous conditions strictes.
            </li>
          </ol>
        </Prose>
      </Section>

      <Section eyebrow="Agriculture — la règle du registre" title="Aucun produit n&apos;est nommé s&apos;il n&apos;est pas homologué">
        <Cards cols={2}>
          <InfoCard title="La règle, telle qu&apos;elle est appliquée" tone="agri" icon={<IconShield size={22} />}>
            <p>
              Toute phrase qui mentionne un pesticide, un herbicide, un fongicide, un engrais minéral, un antibiotique, un vermifuge ou un vaccin est confrontée au registre officiel des intrants. Le produit n&apos;est conservé que si le registre le classe <strong>homologué</strong>. Dans ce cas, la réponse ajoute obligatoirement&nbsp;:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>le mode d&apos;emploi homologué, tel qu&apos;il figure sur l&apos;étiquette&nbsp;;</li>
              <li>l&apos;équipement de protection obligatoire&nbsp;;</li>
              <li>le délai avant récolte ou consommation&nbsp;;</li>
              <li>le délai avant de retourner dans la parcelle traitée.</li>
            </ul>
          </InfoCard>
          <InfoCard title="Ce qui se passe sinon" tone="danger" icon={<IconAlert size={22} />}>
            <p>
              Le conseil est supprimé et remplacé par des actions non chimiques et par une orientation&nbsp;: «&nbsp;n&apos;achetez rien sur simple conseil, passez par l&apos;agent agricole ou le vétérinaire de votre secteur&nbsp;». Un produit interdit en RDC est nommé pour être <em>déconseillé</em>. Un produit réservé au vétérinaire est signalé comme tel. En cas de doute entre deux entrées du registre, c&apos;est toujours la plus restrictive qui l&apos;emporte, donc le blocage plutôt que l&apos;autorisation.
            </p>
            <p className="mt-2">
              Le service ajoute alors&nbsp;: n&apos;achetez aucun produit conseillé de bouche à oreille ou reconditionné dans une bouteille sans étiquette.
            </p>
          </InfoCard>
        </Cards>
        <div className="mt-6">
          <Callout tone="info" title="Registre des intrants — source">
            <p>Service national de protection des végétaux (SNPV) et Direction des productions animales. Le registre est une donnée de la plateforme, tenue à jour et consultable&nbsp;; il n&apos;est jamais produit par un modèle de langage.</p>
          </Callout>
        </div>
      </Section>

      <Section tone="white" eyebrow="Agriculture — surveillance" title="Maladies et ravageurs à déclarer, et détection de foyers">
        <div className="grid gap-6 lg:grid-cols-2">
          <DataTable head={["À déclaration obligatoire", "Domaine"]} rows={NOTIFIABLE.map(([a, b]) => [a, b])} caption="Liste par défaut de la plateforme ; elle est modifiable par l'autorité agricole sans changer le code." />
          <Prose>
            <p>
              Quand l&apos;un de ces noms apparaît dans votre message, dans les hypothèses ou dans les symptômes décrits, trois choses se produisent en même temps&nbsp;: le service agricole de votre secteur est prévenu, le cas est marqué pour une vérification de terrain, et il vous est demandé de <strong>ne déplacer ni plants, ni boutures, ni animaux hors de la parcelle</strong> avant le passage de l&apos;agent.
            </p>
            <h3>Détection de foyers</h3>
            <p>
              Quand au moins <strong>cinq signalements</strong> décrivent le même problème sur la même culture, dans le même territoire — ou à défaut la même province — sur une fenêtre glissante de <strong>quatorze jours</strong>, un foyer est ouvert avec le statut «&nbsp;non vérifié&nbsp;» et le réseau des agents agricoles est alerté. La plateforme ne déclare jamais une épidémie&nbsp;: seul un agent qualifié confirme ou rejette. Un foyer dont le nombre de signalements reste sous le seuil de confidentialité est publié sans son territoire, pour qu&apos;une poignée d&apos;exploitations ne puisse pas être reconnue.
            </p>
            <h3>Signes qui touchent aussi les personnes</h3>
            <p>
              Rage, morsure de chien, charbon, avortements en série, lait cru, viande d&apos;un animal malade, mortalité brutale des poules, ou une personne malade dans le même foyer&nbsp;: la réponse ajoute une consigne d&apos;hygiène et vous demande d&apos;en parler au centre de santé, et l&apos;alerte part en priorité.
            </p>
          </Prose>
        </div>
      </Section>

      <Section eyebrow="Agriculture — sources et escalade">
        <Cards cols={2}>
          <InfoCard title="Les sources citées" icon={<IconBook size={22} />}>
            <p>Chaque recommandation cite au moins un document approuvé. Les prix, la météo et les calendriers culturaux viennent de données référencées, jamais du modèle&nbsp;: le marché, la date du relevé et la source sont dits avec le chiffre.</p>
          </InfoCard>
          <InfoCard title="Qui reçoit l&apos;escalade" tone="agri" icon={<IconUsers size={22} />}>
            <p>
              L&apos;<strong>agent agricole du secteur</strong>, avec le motif de l&apos;escalade&nbsp;: maladie ou ravageur à déclarer, signes pouvant concerner la santé humaine, plus de la moitié de la parcelle ou du troupeau touchée, propagation rapide ou mortalité, diagnostic trop incertain, ou produit évoqué sans correspondance homologuée.
            </p>
          </InfoCard>
        </Cards>
        <div className="mt-6">
          <DataTable head={["Documents", "Autorité et source"]} rows={AGRI_SOURCES.map(([a, b]) => [a, b])} />
        </div>
        <Note>
          Le calendrier cultural indicatif provient d&apos;INERA et de la FAO&nbsp;; les prix de marché du relevé hebdomadaire du Service national des statistiques agricoles (SNSA), avec la date et le marché. Le service ne garantit aucun prix&nbsp;: il indique ce qui a été relevé, où, et quand.
        </Note>
      </Section>

      {/* ──────────────────────────── ÉDUCATION ──────────────────────────── */}

      <Section
        id="education"
        tone="white"
        eyebrow="Service 3 — Éducation"
        title="Enseigner, vérifier, adapter — à l&apos;oral, sans manuel"
        lead="Le service accompagne des élèves, des parents et des enseignants, presque toujours à l'oral, souvent sans cahier ni livre à la maison. Il enseigne une notion à la fois, vérifie qu'elle est comprise, et change d'approche quand elle ne l'est pas."
      >
        <Cards cols={2}>
          <InfoCard title="Ce que vous pouvez demander" tone="edu" icon={<IconGraduation size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Une notion à réexpliquer&nbsp;: fractions, division, tables, conjugaison, sciences.</li>
              <li>Une interrogation orale pour vérifier ce qui est acquis.</li>
              <li>De l&apos;aide sur un devoir — sous forme d&apos;indices, pas de corrigé.</li>
              <li>Un plan de révision pour le TENAFEP ou l&apos;Examen d&apos;État.</li>
              <li>Une histoire à lire à voix haute, avec des questions de compréhension.</li>
              <li>Comment aider son enfant à la maison quand on ne peut pas suivre le programme.</li>
            </ul>
          </InfoCard>
          <InfoCard title="Ce que le service refuse de faire" tone="danger" icon={<IconAlert size={22} />}>
            <ul className="list-disc space-y-1 pl-4">
              <li>Donner la réponse finale d&apos;un travail noté avant que l&apos;élève ait essayé.</li>
              <li>Deviner l&apos;âge, la classe ou la langue d&apos;un enfant&nbsp;: il pose la question.</li>
              <li>Coller une étiquette sur un enfant. Une trace d&apos;apprentissage décrit un moment, pas une personne.</li>
              <li>Répéter les mots mêmes de l&apos;enfant dans un résumé destiné à un parent.</li>
              <li>Faire de la publicité, citer une marque ou pousser à acheter quoi que ce soit.</li>
            </ul>
          </InfoCard>
        </Cards>

        <div className="mt-8">
          <h3 className="text-[17px] font-bold text-ink">Ce que des élèves et des parents disent réellement</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LangBlock lang="Français" native="Français">
              «&nbsp;Je ne comprends pas les fractions, mon professeur dit que 2/4 c&apos;est pareil que 1/2.&nbsp;»
            </LangBlock>
            <LangBlock lang="Lingala et français" native="Lingála">
              «&nbsp;Nalingi koyekola division, 36 divisé par 4 c&apos;est combien et pourquoi&nbsp;?&nbsp;»
            </LangBlock>
            <LangBlock lang="Kiswahili" native="Kiswahili">
              «&nbsp;Nataka msaada wa somo la hesabu, sielewi kugawanya.&nbsp;»
            </LangBlock>
            <LangBlock lang="Tshiluba" native="Tshilubà">
              «&nbsp;Ndi musue kulonga bualu bua fractions, tshiena mumvue.&nbsp;»
            </LangBlock>
            <LangBlock lang="Français" native="Français">
              «&nbsp;Mon fils de 10 ans a du mal à lire, comment l&apos;aider à la maison&nbsp;?&nbsp;»
            </LangBlock>
            <LangBlock lang="Français" native="Français">
              «&nbsp;Je prépare l&apos;examen d&apos;État, comment organiser mes révisions&nbsp;?&nbsp;»
            </LangBlock>
          </div>
          <Note>
            Le deuxième exemple mélange le lingala et le français dans une même phrase. C&apos;est la manière normale de parler dans une grande partie du pays, et le service la traite sans demander de choisir une langue.
          </Note>
        </div>
      </Section>

      <Section eyebrow="Éducation — la boucle" title="Enseigner, vérifier, adapter">
        <DataTable head={["Étape", "Ce qui se passe"]} rows={EDU_STEPS.map(([a, b]) => [a, b])} />
      </Section>

      <Section tone="white" eyebrow="Éducation — les usages" title="Six manières d&apos;utiliser le service scolaire">
        <Cards>
          <InfoCard title="Expliquer" tone="edu" icon={<IconGraduation size={22} />}>
            Une micro-explication d&apos;une notion, quatre-vingt-dix secondes maximum, un seul concept, avec un exemple pris dans la vie congolaise.
          </InfoCard>
          <InfoCard title="Interroger à l&apos;oral" tone="edu" icon={<IconGraduation size={22} />}>
            Jusqu&apos;à trois questions de vérification. En cas d&apos;erreur, le service nomme l&apos;erreur, explique pourquoi elle est fréquente et donne le geste qui la corrige. Jamais un simple «&nbsp;faux&nbsp;».
          </InfoCard>
          <InfoCard title="Aider sur un devoir" tone="edu" icon={<IconGraduation size={22} />}>
            Des indices du plus léger au plus fort, puis un exemple résolu sur un exercice <em>semblable</em> — jamais sur le vôtre. La réponse arrive après votre essai, avec ce qui est juste et ce qu&apos;il faut corriger.
          </InfoCard>
          <InfoCard title="Préparer un examen" tone="edu" icon={<IconBook size={22} />}>
            Plan de révision pour le TENAFEP en fin de primaire et pour l&apos;Examen d&apos;État en fin de secondaire&nbsp;: semaines, points à travailler, activités, contrôle de fin de semaine, routine quotidienne, et rappels si vous les acceptez.
          </InfoCard>
          <InfoCard title="Mode parent" tone="edu" icon={<IconUsers size={22} />}>
            Un résumé pour la maison&nbsp;: ce que l&apos;enfant réussit, ce qu&apos;il faut travailler, des activités à faire sans matériel, et un encouragement. Les mots mêmes de l&apos;enfant n&apos;y figurent pas.
          </InfoCard>
          <InfoCard title="Mode enseignant" tone="edu" icon={<IconUsers size={22} />}>
            Les points faibles observés dans la zone sur trente jours, avec le taux de réussite et le nombre d&apos;apprenants — agrégés, jamais nominatifs, et accompagnés d&apos;un avertissement sur ce que ces chiffres ne disent pas.
          </InfoCard>
        </Cards>
      </Section>

      <Section eyebrow="Éducation — lecture à voix haute" title="Douze histoires écrites pour ce programme">
        <Prose>
          <p>
            La bibliothèque de lecture contient douze histoires courtes originales — <strong>deux par langue du programme</strong>, niveau primaire, de cent cinquante à deux cent cinquante mots, situées dans la vie congolaise ordinaire&nbsp;: le marché, la pirogue, le champ, le puits du village, la classe. Chaque histoire est suivie de trois questions de compréhension.
          </p>
          <p>
            Ces textes n&apos;appartiennent à aucun tiers. Ils appartiennent au programme national et peuvent être lus, imprimés et enregistrés librement par les écoles.
          </p>
          <p>
            Le mode lecture sert à deux choses&nbsp;: entraîner la lecture à voix haute d&apos;un enfant, et donner à un parent qui ne lit pas lui-même un texte qu&apos;il peut faire écouter puis faire raconter.
          </p>
        </Prose>
      </Section>

      <Section tone="white" eyebrow="Éducation — sources, protection et escalade">
        <Cards cols={2}>
          <InfoCard title="Protection de l&apos;enfance" tone="danger" icon={<IconShield size={22} />}>
            <p>
              Un dépistage de sécurité passe <strong>avant</strong> tout enseignement. Si un enfant évoque des violences, une exploitation, un mariage forcé, une négligence ou l&apos;envie de se faire du mal, le service ne pose aucune question sur les détails&nbsp;: il répond avec bienveillance, ne promet pas le secret, et ouvre un dossier protégé accessible aux seules personnes habilitées. Les notifications ordinaires n&apos;en portent aucun détail.
            </p>
          </InfoCard>
          <InfoCard title="Qui reçoit l&apos;escalade" tone="edu" icon={<IconUsers size={22} />}>
            <p>
              L&apos;<strong>enseignant référent</strong> pour les difficultés d&apos;apprentissage. Pour une révélation relevant de la protection de l&apos;enfance, c&apos;est le dispositif de protection qui prend le relais, par une voie séparée et restreinte.
            </p>
          </InfoCard>
        </Cards>
        <div className="mt-6">
          <DataTable head={["Documents", "Autorité et source"]} rows={EDU_SOURCES.map(([a, b]) => [a, b])} />
        </div>
        <Note>
          Chaque séance est rattachée à un objectif du programme national de la RDC, identifié par un code, avec sa classe, ses pré-requis et son poids éventuel au TENAFEP ou à l&apos;Examen d&apos;État. Le progrès est exprimé par rapport au programme, jamais comme un jugement sur un enfant. Voir{" "}
          <Link href="/confidentialite" className="link">
            ce qui est conservé et pourquoi
          </Link>
          .
        </Note>
      </Section>

      <Section tone="navy" eyebrow="Commun aux trois services" title="Ce qui ne change jamais, quel que soit le service">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "La détection des signes de danger précède tout appel à l'intelligence artificielle et fonctionne même si les fournisseurs sont indisponibles.",
            "Une réponse cite ses sources : identifiants des documents approuvés, protocole et version, marché et date pour un prix.",
            "Deux questions de précision au maximum avant de répondre.",
            "Un pourcentage de confiance est donné, et l'incertitude est dite plutôt que masquée.",
            "Un humain nommé reçoit l'escalade, avec un délai de prise en charge suivi.",
            "Le service ne prend aucune décision d'éligibilité, de sanction ou de surveillance sur une personne.",
            "Aucun identifiant de citoyen n'accompagne un appel à un modèle : l'association avec une personne se fait uniquement à l'intérieur de la plateforme.",
            "Vous pouvez dire que le service s'est trompé ; le signalement est traité et sert à corriger.",
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

      <CtaBand
        title="Prêt à poser votre question ?"
        body="Le service est gratuit et fonctionne depuis n'importe quel téléphone. Choisissez le canal qui vous convient, ou lisez d'abord les questions fréquentes."
        primary={{ href: "/acces", label: "Comment y accéder" }}
        secondary={{ href: "/aide", label: "Questions fréquentes" }}
      />
    </>
  );
}
