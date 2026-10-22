---
slug: independance-fournisseurs-ia
title: "Indépendance des fournisseurs d'IA : aucun n'est requis"
description: "L'indépendance des fournisseurs d'IA est une règle d'architecture : chaque capacité a une chaîne ordonnée, un basculement automatique et un repli sans inférence."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: passerelle d'intelligence artificielle et souveraineté technique
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des comportements de repli en santé
keywords: [indépendance des fournisseurs, passerelle d'intelligence artificielle, basculement automatique, souveraineté technique, repli sans inférence]
entities: [passerelle, chaîne ordonnée, délai de garde, fournisseur, clé d'accès, souveraineté, résidence des données, repli]
tags: [Gouvernance, Souveraineté, Continuité, Architecture, RDC]
imageAlt: "Chaînes de fournisseurs par capacité, avec le basculement automatique et le repli sans inférence"
takeaways:
  - "Chaque capacité dispose d'une chaîne ordonnée de fournisseurs, essayée dans l'ordre, avec basculement automatique en cas d'échec."
  - "Un seul endroit du code connaît les fournisseurs : leurs noms, leurs invites et leurs clés n'atteignent jamais le navigateur."
  - "La plateforme entière s'exécute sans aucune clé d'accès, ce qui permet d'auditer et de former sans dépendre d'un tiers commercial."
  - "Changer de fournisseur, ou en retirer un, est une variable d'environnement — pas une réécriture."
faq:
  - q: "Pourquoi ne pas choisir le meilleur fournisseur et s'y tenir ?"
  - a: "Parce qu'un service public ne choisit pas seulement une qualité, il choisit une dépendance. Un fournisseur peut changer ses conditions, ses prix, ses quotas, restreindre un pays, ou simplement tomber en panne. Pour un service de santé national, faire reposer la parole adressée à un citoyen sur une seule entreprise étrangère est un risque politique autant que technique."
  - q: "Le basculement d'un fournisseur à l'autre change-t-il la réponse ?"
  - a: "La formulation peut varier ; les décisions de sécurité, non. La détection des signes de danger, les seuils de confiance et les protocoles signés sont exécutés par la plateforme et ne dépendent d'aucun fournisseur. Ce qui bascule, c'est la rédaction de la réponse, pas la règle qui la borne."
  - q: "Que veut dire « un repli sans inférence » ?"
  - a: "Le dernier maillon de chaque chaîne est un composant qui ne fait aucune prédiction : il restitue des textes relus et applique des règles déterministes. Il est incapable d'inventer. C'est précisément la propriété recherchée lorsque tout le reste est indisponible, et c'est aussi ce qui permet de faire tourner la plateforme hors ligne."
  - q: "Les noms des fournisseurs sont-ils visibles par les citoyens ?"
  - a: "Non. Un seul module de la plateforme connaît les fournisseurs. Ni leurs noms, ni les invites utilisées, ni les clés ne sont transmis au navigateur ou aux applications. L'usager est en relation avec un service public, pas avec un prestataire."
  - q: "Cette architecture garantit-elle la souveraineté des données ?"
  - a: "Elle est une condition nécessaire et non suffisante. L'indépendance permet de changer de fournisseur et de déclarer la juridiction de chaque destination ; elle ne déplace pas à elle seule les traitements sur le territoire congolais. Le programme publie l'inventaire de ses destinations plutôt que d'affirmer une souveraineté qu'il n'a pas encore."
sources:
  - label: "NIST — AI Risk Management Framework"
  - url: "https://www.nist.gov/itl/ai-risk-management-framework"
  - label: "Union internationale des télécommunications — mesurer le développement numérique"
  - url: "https://www.itu.int/"
related: [mode-degrade-securite-sans-reseau, garde-fous-ia-service-public, journal-audit-chaine-verifiable]
---

Une question revient dans chaque réunion institutionnelle sur un service public fondé sur l'intelligence artificielle, et elle n'est jamais technique : que se passe-t-il si le fournisseur change d'avis ? L'**indépendance des fournisseurs** n'est pas, dans ce programme, une posture de négociation. C'est une contrainte d'architecture, vérifiable dans le code et testée automatiquement.

## Une chaîne ordonnée par capacité, et non un prestataire unique

La plateforme n'a pas « un fournisseur d'intelligence artificielle ». Elle a quatre capacités distinctes, et chacune dispose de sa propre liste ordonnée.

| Capacité | Ce qu'elle fait | Nombre de fournisseurs | Dernier maillon |
|---|---|---|---|
| Compréhension et rédaction | Comprendre la question, rédiger la réponse | Trois, essayés dans l'ordre | Repli sans inférence |
| Analyse d'image | Lire une photo de feuille ou de lésion | Trois, essayés dans l'ordre | Repli sans inférence |
| Reconnaissance de la parole | Transcrire un message vocal | Deux, dont un seul couvre les cinq langues | Repli sans inférence |
| Synthèse vocale | Prononcer la réponse | Deux | La voix du téléphone |

Chaque appel suit la chaîne dans l'ordre, avec un délai de garde. Un fournisseur lent est traité comme un fournisseur en panne, parce que, du point de vue d'une personne qui attend une réponse, la différence n'existe pas.

Ce basculement est automatique et enregistré : la réponse indique quel fournisseur l'a produite, ce qui alimente le [journal d'audit](/blog/journal-audit-chaine-verifiable) et permet de mesurer la fiabilité réelle de chacun plutôt que celle annoncée dans un contrat.

## Comment se déroule un basculement, concrètement

Une chaîne ordonnée ne vaut que par ce qui se passe à la seconde où le premier maillon ne répond pas. Le déroulé est volontairement ennuyeux, parce qu'un comportement d'urgence doit être prévisible plutôt qu'intelligent.

L'appel part vers le premier fournisseur de la chaîne avec un délai de garde. Si la réponse n'arrive pas dans ce délai, ou si elle arrive mais ne respecte pas le schéma attendu, elle est rejetée — une réponse mal formée est traitée comme une absence de réponse, et non comme une donnée à rattraper. La passerelle passe alors au maillon suivant, sans que le reste du code apprenne autre chose que le résultat final et le nom du fournisseur qui l'a produit.

Deux détails comptent plus que le mécanisme lui-même. Le premier : la validation de la sortie contre un schéma strict est ce qui rend le basculement sûr. Sans elle, un fournisseur dégradé renverrait du texte plausible mais inexploitable, et la chaîne s'arrêterait sur une mauvaise réponse au lieu de continuer vers une bonne. Le second : l'échec est enregistré avant la réussite. On sait donc, à la fin d'un mois, combien de fois chaque maillon a été sollicité, combien de fois il a échoué et avec quelle latence — une mesure faite chez soi, indépendante des engagements de niveau de service annoncés par les prestataires.

Le même mécanisme protège contre un cas moins spectaculaire mais plus fréquent que la panne : la lenteur partielle. Un fournisseur qui répond en vingt secondes au lieu de deux n'est pas en panne au sens de son tableau de bord ; pour une mère qui attend de savoir si elle doit partir au centre de santé, il l'est. Le délai de garde tranche cette question à la place de l'opérateur, et toujours dans le même sens.

## Un seul endroit du code connaît les fournisseurs

La règle la plus structurante de cette architecture est aussi la plus simple : **un seul module sait qu'il existe des fournisseurs.** Tout le reste de la plateforme demande « comprends cette phrase » ou « transcris cet audio » sans savoir qui l'exécute.

Les conséquences sont directes et cumulatives.

- **Changer de fournisseur ne réécrit rien.** L'ordre des chaînes est une variable d'environnement, pas une modification du code métier.
- **Aucun nom, aucune invite, aucune clé n'atteint le navigateur.** Un usager est en relation avec un service public, pas avec un prestataire.
- **Un fournisseur peut être retiré du jour au lendemain**, par exemple si ses conditions deviennent incompatibles avec la politique de résidence des données, sans chantier technique.
- **Les comportements de repli sont testables**, parce qu'ils passent tous par le même point.

Ce dernier point est ce qui rend l'indépendance démontrable plutôt que déclarative. La suite de tests du programme coupe délibérément les fournisseurs, un par un puis tous ensemble, et vérifie que la chaîne de sécurité continue de produire la même alerte et le même cas.

## Que reste-t-il quand tous les fournisseurs sont absents ?

C'est la question qui sépare une architecture de repli réelle d'une intention écrite dans un document.

Le dernier maillon de chaque chaîne n'est pas un modèle plus modeste : c'est un composant **sans aucune inférence**. Il restitue des textes relus et applique des règles déterministes. Il ne peut pas inventer, ce qui est exactement la propriété recherchée quand plus rien d'autre ne fonctionne.

Dans cette configuration, le service continue de reconnaître un signe de danger, de prononcer le message d'urgence dans les cinq langues, d'orienter vers une structure de santé et d'ouvrir un cas. Ce qu'il perd, c'est la conversation libre. Ce comportement est détaillé dans l'article sur le [mode dégradé](/blog/mode-degrade-securite-sans-reseau).

Un effet secondaire mérite d'être signalé aux institutions : la plateforme entière s'exécute **sans aucune clé d'accès**. On peut l'installer, la faire fonctionner, la former et l'auditer sans contrat avec un fournisseur et sans qu'aucune donnée ne sorte. Pour une évaluation indépendante ou une formation d'agents, c'est une propriété rare.

## L'indépendance suffit-elle à parler de souveraineté ?

Non, et il serait malhonnête de le laisser croire. Il faut distinguer trois niveaux, souvent confondus dans les discours.

1. **L'indépendance technique** : pouvoir changer de fournisseur sans réécrire le service. Le programme l'a.
2. **La transparence des destinations** : savoir quelles données sortent, vers qui et sous quelle juridiction. Le programme tient cet inventaire et le publie sur la [page de protection des données](/confidentialite).
3. **La souveraineté effective** : que les traitements s'exécutent sur le territoire, sous droit congolais. Le programme ne l'a pas, parce que les modèles nécessaires n'y sont pas hébergés aujourd'hui.

Affirmer le troisième niveau au motif qu'on dispose du premier serait exactement le genre de raccourci que ce programme s'interdit. Ce que l'indépendance garantit, c'est que le jour où un hébergement régional devient possible, le changement est une reconfiguration et non une reconstruction.

Le [cadre de gestion des risques de l'intelligence artificielle du NIST](https://www.nist.gov/itl/ai-risk-management-framework) traite cette dépendance comme un risque à part entière, à documenter et à mesurer, au même titre que la qualité des modèles. C'est le point de vue retenu ici.

## Ce que l'indépendance des fournisseurs change pour un financeur

Vue depuis un ministère ou un bailleur, cette propriété ne se juge pas sur l'élégance de l'architecture mais sur trois questions de risque, et c'est là que l'indépendance des fournisseurs produit un effet mesurable.

La première est la continuité du service en cas de rupture contractuelle. Un programme national dont la parole adressée aux citoyens dépend d'un contrat unique hérite de la durée de ce contrat comme horizon. Ici, une rupture dégrade la conversation libre sans interrompre les fonctions de sécurité, et sans ouvrir un chantier logiciel.

La deuxième est la réversibilité de l'investissement. Les financements publics et philanthropiques exigent de plus en plus que l'actif produit reste utilisable après la fin du projet. Une plateforme qui ne démarre pas sans clé d'accès commerciale n'est pas un actif transférable : c'est un abonnement. Celle-ci démarre, se forme et s'audite hors ligne, ce qui signifie qu'elle peut être remise à une institution congolaise sans la remettre en même temps à un prestataire.

La troisième est la négociation. Un acheteur capable de retirer un fournisseur en changeant une variable d'environnement ne discute pas les mêmes conditions qu'un acheteur captif. Cet argument n'est pas technique, il est budgétaire, et il se vérifie au premier renouvellement.

Il faut y ajouter une conséquence moins confortable : cette architecture rend visible ce qu'une dépendance unique masquait. Lorsque chaque appel enregistre son fournisseur, sa latence et son issue, on découvre des écarts de qualité entre langues et entre modules qu'aucun contrat ne mentionne. C'est désagréable, et c'est le but : une décision d'achat doit reposer sur des mesures faites chez soi plutôt que sur une plaquette.

## Ce que cette architecture coûte réellement

Trois coûts, qu'il vaut mieux énoncer que découvrir.

- **Chaque capacité doit être définie de façon neutre.** Le code ne peut pas s'appuyer sur une particularité d'un fournisseur donné, ce qui interdit certaines optimisations et oblige à valider les sorties contre un schéma strict.
- **Les comportements doivent être testés pour chaque fournisseur**, et pour leur absence. Le coût de test croît avec le nombre de maillons.
- **Le repli sans inférence est un second produit à maintenir.** Les scripts relus, les menus et les règles déterministes ne s'écrivent pas tout seuls, et ils doivent rester cohérents avec ce que dit le service en fonctionnement normal.

Ce dernier point est celui que les équipes sous-estiment. Un chemin de repli qui n'est pas exercé se dégrade silencieusement, et l'on découvre qu'il ne fonctionne plus le jour où l'on en a besoin — c'est-à-dire le pire jour possible.

Ces coûts ont une contrepartie que l'on constate à l'usage : la plateforme devient testable sans réseau et sans budget d'appels. Toute la suite de tests du programme s'exécute hors ligne, sur le repli sans inférence, ce qui veut dire qu'une erreur dans une règle de sécurité est découverte en quelques secondes sur le poste d'un développeur plutôt qu'en production, un dimanche, sur un cas réel. Une équipe qui dépend d'un fournisseur pour exécuter ses tests finit par en exécuter moins.

## Pourquoi la question se pose plus fortement en République démocratique du Congo

Les contraintes décrites par l'[Union internationale des télécommunications](https://www.itu.int/) pour l'Afrique subsaharienne — connectivité intermittente, coût des données, dépendance à des infrastructures situées hors du continent — rendent la dépendance à un fournisseur unique plus coûteuse qu'ailleurs.

À cela s'ajoute une asymétrie rarement nommée : aucun fournisseur mondial n'a d'engagement particulier envers les usagers congolais, ni d'intérêt commercial majeur sur ce marché. Les décisions qui affectent le service — un quota revu, un modèle retiré, une langue non prioritaire — sont prises ailleurs, pour d'autres raisons, et sans préavis utile.

Il y a enfin une dimension de calendrier. Les feuilles de route institutionnelles d'un service public se comptent en années, les cycles de vie des modèles d'intelligence artificielle en mois. Un modèle sur lequel un programme aurait bâti son unique chemin de réponse peut être déprécié avant la fin d'une phase pilote, et l'annonce arrive par courriel. L'indépendance des fournisseurs est donc moins une protection contre la panne qu'une protection contre l'obsolescence imposée : elle permet d'absorber le retrait d'un modèle comme un changement de configuration, pendant que les règles de sécurité, les protocoles relus et les scripts d'urgence — qui sont le véritable patrimoine du programme — restent inchangés.

Une architecture qui ne survit pas à ces décisions n'est pas un service public. Elle en est la façade.

## Ce que l'indépendance ne protège pas

Trois limites pour finir, afin que cette propriété ne soit pas sur-vendue.

- **Elle ne garantit pas la qualité.** Changer de fournisseur en urgence peut dégrader la reconnaissance d'une langue ; c'est le rôle des [seuils de qualité par langue](/blog/seuils-qualite-par-langue) de détecter cette dégradation plutôt que de la subir.
- **Elle ne réduit pas le coût.** Maintenir plusieurs intégrations coûte plus cher qu'une seule, et le repli ne se finance pas par l'usage.
- **Elle ne remplace pas un agent de santé.** Le service informe et oriente ; devant un signe de danger, la [conduite à tenir](/urgence) est de se rendre immédiatement à la structure la plus proche.

La promesse tient donc en une phrase vérifiable plutôt qu'en un engagement contractuel : **aucun fournisseur n'est indispensable au fonctionnement sûr de ce service**, et cette affirmation se teste en les coupant.
