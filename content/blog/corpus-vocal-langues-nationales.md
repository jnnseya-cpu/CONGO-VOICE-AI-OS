---
slug: corpus-vocal-langues-nationales
title: "Corpus vocal en langues nationales : méthode et éthique"
description: "Constituer un corpus vocal en langues nationales sans abuser des locuteurs : consentement parlé, finalités, propriété, dé-identification, équilibrage et relecture."
lang: fr
category: Langues et parole
cluster: langues-peu-dotees
pillar: false
publishedAt: 2026-08-31
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: collecte de données et gouvernance du corpus
reviewer: Comité d'inclusion linguistique
reviewerRole: relecture par des locuteurs natifs des cinq langues
keywords: [corpus vocal en langues nationales, consentement par la voix, dé-identification des enregistrements, lexique de prononciation, jeu de données pour affinage, équilibrage par genre et par âge]
entities: [corpus vocal, consentement éclairé, dé-identification, lexique local, file de relecture, jeu de données, lingala, kikongo, kiswahili, tshiluba, province]
tags: [Langues, Corpus, Protection des données, Gouvernance, RDC]
imageAlt: "Tableau de suivi de collecte d'un corpus vocal par langue, province, genre et tranche d'âge"
takeaways:
  - "Un consentement qui suppose de savoir lire n'est pas un consentement : il doit être demandé à voix haute, dans la langue de la personne, et pouvoir être retiré de la même manière."
  - "La finalité doit être bornée avant la collecte : améliorer l'écoute et la parole du service, et rien d'autre — pas de revente, pas d'entraînement tiers sans accord dédié."
  - "La propriété du corpus est une décision de programme qui n'est pas prise à ce jour ; l'annoncer clairement vaut mieux que de la laisser se décider par défaut."
  - "Deux cents heures par langue ne servent à rien si elles viennent d'une seule province, d'un seul genre et d'une seule tranche d'âge."
faq:
  - q: "Combien d'heures faut-il par langue pour être utile ?"
    a: "L'ordre de grandeur retenu par le programme est de deux cents heures transcrites par langue peu dotée, réparties sur plusieurs provinces, plus un jeu d'évaluation annoté d'environ deux mille énoncés par langue et par domaine. C'est un objectif de travail, pas un seuil scientifique universel."
  - q: "Comment obtenir un consentement d'une personne qui ne lit pas ?"
    a: "En le demandant à voix haute, dans sa langue, en une phrase courte qui dit ce qui est enregistré, pourquoi, pour combien de temps et comment revenir en arrière. La réponse parlée est horodatée et conservée avec l'échantillon."
  - q: "À qui appartiennent les enregistrements collectés ?"
    a: "Ce n'est pas décidé. Les options en discussion vont de la détention publique par l'État à une licence ouverte encadrée, en passant par une garde partagée avec des institutions académiques congolaises. Tant que ce n'est pas tranché, le corpus n'est cédé à personne."
  - q: "Que devient un enregistrement si la personne change d'avis ?"
    a: "Le retrait est possible par la voix comme par message, et il retire l'échantillon des jeux de données exportables. Un modèle déjà entraîné ne peut pas oublier un exemple : c'est une limite réelle, et elle est dite avant la collecte, pas après."
  - q: "Le corpus contient-il des données de santé ?"
    a: "Il contient ce que les gens disent, y compris des symptômes. C'est précisément pourquoi la dé-identification, la limitation de finalité et la conservation bornée sont traitées avant l'ambition technique."
sources:
  - label: "Mozilla Common Voice — collecte ouverte de corpus vocaux sous consentement"
    url: "https://commonvoice.mozilla.org/"
  - label: "Meta AI — Massively Multilingual Speech, couverture de plus de mille langues"
    url: "https://ai.meta.com/blog/multilingual-model-speech-recognition/"
  - label: "UNESCO — multilinguisme et langues dans l'espace numérique"
    url: "https://www.unesco.org/"
  - label: "Union africaine — cadre continental sur la protection des données à caractère personnel"
    url: "https://au.int/"
related: [ia-vocale-langues-congolaises, reconnaissance-vocale-lingala, code-switching-francais-lingala, voice-ai-digital-inclusion-drc, garde-fous-ia-service-public]
---

On ne construit pas un service vocal en langues peu dotées sans données, et on ne collecte pas des données de la voix des gens sans règles. Ce texte décrit comment le programme constitue un **corpus vocal en langues nationales** — lingala, kikongo, kiswahili, tshiluba — en partant du consentement plutôt que du volume : ce qui est demandé avant d'enregistrer, ce qui est retiré avant de stocker, qui relit, qui décide, et ce qui n'est pas encore décidé.

## Pourquoi deux cents heures par langue, et pas dix mille

L'objectif de travail du programme est de deux cents heures transcrites par langue peu dotée, plus un jeu d'évaluation annoté d'environ deux mille énoncés par langue et par domaine. Ce n'est pas un seuil scientifique : c'est l'ordre de grandeur qui permet d'adapter un modèle existant à un usage borné — santé communautaire, agriculture, appui scolaire — plutôt que d'entraîner un modèle général à partir de rien.

Deux cents heures bien réparties valent mieux que deux mille heures d'une seule province. La raison est simple : un modèle apprend la distribution qu'on lui donne. Un corpus recueilli auprès d'hommes adultes de la capitale, sur une bonne ligne, produira un service qui comprend les hommes adultes de la capitale sur une bonne ligne. Or les personnes que le service doit rejoindre en priorité sont exactement celles qui parlent depuis un village, sur un téléphone partagé, avec du vent, et souvent avec la voix d'une femme âgée ou d'un enfant.

Le volume n'est donc pas la première variable. Les premières variables sont la finalité, le consentement et l'équilibre.

## Le consentement par la voix, avant le premier enregistrement

Un formulaire écrit exclut d'emblée une partie des personnes que le programme dit vouloir servir. Le consentement est donc demandé à voix haute, dans la langue de la personne, avec quatre informations et rien de plus : ce qui est enregistré, à quoi cela sert, combien de temps c'est conservé, comment revenir en arrière.

- **La formulation est fixe.** Elle est écrite en français, traduite et relue dans les cinq langues, puis figée. Elle n'est jamais produite par un modèle, pour la même raison que les messages d'urgence : une phrase de consentement mal traduite invalide tout ce qui suit.
- **La réponse est conservée avec l'échantillon.** Horodatée, attachée à la session, consultable. Un consentement qu'on ne peut pas retrouver n'existe pas.
- **Le retrait passe par le même canal.** Dire « je retire mon accord » doit fonctionner aussi bien que répondre à un message. Le retrait sort l'échantillon des jeux de données exportables.
- **Le refus ne coûte rien.** Une personne qui refuse l'usage de son enregistrement pour l'amélioration du service reçoit exactement la même réponse, avec la même qualité. Conditionner le service au don de données serait une contrepartie déguisée.

La limitation de finalité est la contrepartie de cette simplicité. Ce que le programme annonce, il doit s'y tenir : le corpus sert à améliorer l'écoute, la compréhension et la parole du service public, dans les langues concernées. Il ne sert pas à la publicité, pas au ciblage, pas à l'évaluation individuelle d'une personne, et il n'est pas cédé à un tiers pour entraîner un modèle commercial sans accord dédié et explicite. Ce que le service collecte et pour combien de temps est décrit sur la page consacrée à [la protection des données personnelles](/confidentialite).

Cette exigence n'a rien d'exotique : la collecte communautaire sous consentement pratiquée par [le projet Common Voice de Mozilla](https://commonvoice.mozilla.org/) a montré qu'un corpus vocal peut se constituer sans opacité. La différence est qu'ici les personnes ne sont pas des contributrices volontaires venues d'un site web, mais des citoyennes et citoyens qui appellent un service public parce qu'un enfant est malade. L'asymétrie est plus forte, donc les règles doivent l'être aussi.

## À qui appartient le corpus vocal en langues nationales ?

C'est la question la plus importante du sujet, et elle **n'est pas tranchée**. La dire ouverte est plus honnête que de la laisser se décider par défaut, ce qui arrive toujours au bénéfice de celui qui héberge les fichiers.

Trois options sont sur la table, avec leurs conséquences.

| Option | Ce qu'elle donne | Ce qu'elle coûte |
|---|---|---|
| Détention publique par l'État congolais | Un bien commun national, réutilisable par l'école et la recherche du pays | Dépend de la capacité d'archivage et de la stabilité institutionnelle |
| Licence ouverte encadrée, avec restrictions d'usage | Réutilisation par la recherche mondiale, effet d'entraînement pour les langues concernées | Perte de contrôle sur les usages commerciaux en aval |
| Garde partagée avec des institutions académiques congolaises | Compétence locale, continuité scientifique, relecture experte | Gouvernance plus lourde, décision plus lente |

Aucune de ces options n'est retenue à ce jour. Ce qui est décidé, en revanche, tient en trois points : le corpus n'est cédé à personne tant que la question n'est pas tranchée ; les locuteurs qui ont donné leur voix doivent être informés de l'issue ; et l'arbitrage relève de la gouvernance du programme, pas de l'équipe technique. Les principes du cadre continental de protection des données portés par [l'Union africaine](https://au.int/) servent de référence minimale, sans que ce texte prétende décrire l'état des ratifications.

## Ce qu'on retire avant de stocker : la dé-identification

Un enregistrement de voix est une donnée personnelle par nature : la voix identifie. La dé-identification ne peut donc pas être totale, et prétendre le contraire serait faux. Ce qui est possible, c'est de réduire méthodiquement ce qui rattache un échantillon à une personne nommée.

1. **Les identifiants directs sortent du texte.** Numéros de téléphone, noms propres de personnes, adresses précises sont remplacés par des marqueurs dans la transcription, avant relecture.
2. **La localisation est ramenée à la province.** Le village n'entre pas dans le corpus ; la province suffit à mesurer les écarts régionaux et à équilibrer la collecte.
3. **L'échantillon est détaché du dossier.** Un enregistrement versé au corpus est relié à la session, pas au profil de santé de la personne, et aucune inférence de santé n'est rattachée au numéro appelant — d'autant qu'un téléphone est souvent partagé dans le ménage.
4. **La conservation est bornée et écrite.** Une durée annoncée, une suppression effective, et une trace de la suppression.
5. **Ce qui n'est pas réductible est dit.** L'audio reste identifiable pour qui connaît la personne. C'est pour cette raison que l'accès au corpus est nominatif, journalisé, et limité aux relecteurs et aux personnes chargées de l'évaluation.

Il existe une limite technique qu'il faut énoncer avant la collecte et non après : un modèle déjà entraîné ne peut pas oublier proprement un exemple. Un retrait de consentement sort l'échantillon des exports et des jeux futurs ; il ne défait pas un entraînement passé. Cette limite est dite dans la formule de consentement.

## Équilibrer les voix : genre, âge, province, canal

L'équilibrage n'est pas une préoccupation morale ajoutée après coup : c'est ce qui détermine pour qui le service fonctionne. Les quotas suivis par langue sont les suivants.

| Dimension | Ce qui est suivi | Pourquoi cela change la sortie du modèle |
|---|---|---|
| Genre | Part de voix de femmes et d'hommes | Les corpus déséquilibrés dégradent la reconnaissance des voix sous-représentées |
| Âge | Enfants, adultes, personnes âgées | La voix âgée et la voix d'enfant sont les plus mal servies par les modèles génériques |
| Province | Répartition sur les provinces couvertes | Le lingala de Kinshasa n'est pas celui de l'Équateur ; le kikongo varie de même |
| Canal | Appel vocal, note vocale, guichet assisté | Un appel en 8 kHz et une note vocale n'ont pas la même signature acoustique |
| Domaine | Santé, agriculture, éducation | Le vocabulaire décisif diffère : signes de danger, ravageurs, notions scolaires |

Le suivi est publié par langue au fur et à mesure, avec le nombre d'heures relues et non pas seulement collectées. La distinction compte : une heure non relue n'est pas une donnée d'entraînement, c'est une intention.

## La file de relecture et le lexique de prononciation

Tout échantillon entre dans une file, ordonnée par priorité : d'abord ce que le citoyen a signalé comme incompris, ensuite ce sur quoi le système s'est déclaré peu sûr, ensuite le reste par ancienneté. Des relecteurs qui parlent la langue traitent la file et prennent l'une de trois décisions : valider, corriger, rejeter. Une correction porte sur la transcription, sur le sens en français, ou sur la langue reconnue — trois erreurs différentes qu'il serait absurde de confondre dans un seul champ.

Le lexique est le produit dérivé le plus utile de cette relecture. Chaque entrée porte le terme, son sens en français, son domaine, sa région et une indication de prononciation. Ce sont les noms de maladies, de plantes, d'outils, de gestes et de symptômes qu'aucun modèle générique ne connaît. Les entrées vérifiées sont retrouvées et fournies au traitement à chaque nouvelle demande, ce qui améliore la compréhension immédiatement, sans réentraîner quoi que ce soit. C'est le même mécanisme que celui décrit pour [l'adaptation des modèles de parole au lingala](/blog/reconnaissance-vocale-lingala).

Deux points de méthode, souvent négligés :

- **La relecture est un métier, et elle est rémunérée.** Fonder la qualité d'une langue sur le bénévolat revient à la faire dépendre du temps libre des gens, ce qui reproduit exactement les inégalités qu'on prétend corriger.
- **Le jeu d'évaluation est annoté à part.** Par d'autres relecteurs, et jamais réinjecté dans l'entraînement. Sans cette séparation, les scores publiés mesurent la mémoire du modèle, pas sa compétence.

## Exporter un jeu de données pour l'affinage

Les paires audio et transcription validées sont exportables sous une forme simple, ligne par ligne : identifiant, langue, référence de l'audio, texte, traduction française, province, intention, module. C'est le format attendu par les chaînes d'affinage des modèles de parole et des voix de synthèse ; les travaux publiés par [Meta AI sur la reconnaissance vocale massivement multilingue](https://ai.meta.com/blog/multilingual-model-speech-recognition/) décrivent bien ce que ce type de données permet, et à quelles conditions.

L'export obéit aux mêmes règles que le reste : seuls les échantillons validés ou corrigés y entrent, les retraits de consentement en sortent, l'accès est nominatif et journalisé. À ce stade du programme, l'export est outillé et l'affinage reste à réaliser — le dire évite de laisser croire qu'un modèle congolais existe déjà.

## Ce qui n'est pas décidé, et qui doit l'être

Un **corpus vocal en langues nationales** engage des personnes qui n'ont ni le temps ni les moyens de négocier. Les points ouverts sont donc annoncés :

- **La propriété et la licence du corpus** ne sont pas arrêtées. C'est la décision la plus structurante du sujet.
- **La durée de conservation définitive** des audios bruts, par opposition aux transcriptions, reste à fixer avec le comité de gouvernance.
- **La contrepartie due aux relecteurs et aux communautés** dont la langue progresse grâce à ce travail n'est pas formalisée au-delà de la rémunération de la relecture.
- **L'ouverture à la recherche externe**, sous quelles conditions et avec quelles restrictions d'usage, n'est pas décidée.
- **Les textes d'interface** dans les quatre langues nationales restent des versions de travail, en attente de validation par des linguistes.

La couverture réelle de chaque langue, avec ses seuils de qualité et son état d'avancement, est publiée sur [la page des langues nationales](/langues-nationales), et le cadre général dans lequel s'inscrit cette collecte est décrit dans la présentation [du programme](/programme). Une règle demeure au-dessus des autres : personne ne doit découvrir après coup ce que sa voix est devenue.
