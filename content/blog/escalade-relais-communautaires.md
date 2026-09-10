---
slug: escalade-relais-communautaires
title: "Escalade vers les relais communautaires : cas et délais"
description: "L'escalade vers les relais communautaires, expliquée : machine à états d'un cas, routage par territoire, délais de 15 minutes à 24 heures et correction humaine."
lang: fr
category: Santé communautaire
cluster: sante-communautaire
pillar: false
publishedAt: 2026-09-02
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: architecture des files de travail et des délais
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des règles d'escalade et des motifs de correction
keywords: [escalade vers les relais communautaires, machine à états des cas, délais de prise en charge, dépassement de délai, correction humaine du niveau de gravité]
entities: [cas, file d'attente, délai de prise en charge, escalade, relais communautaire, superviseur, suivi, motif écrit, routage territorial]
tags: [Santé, Escalade, Opérations, Gouvernance, RDC]
imageAlt: "Parcours d'un cas de santé, de son ouverture automatique à sa clôture par un relais communautaire"
takeaways:
  - "Un cas est l'unité de responsabilité : une file, un propriétaire, une horloge — et rien de tout cela n'est décidé par un modèle."
  - "Le routage suit un ordre fixe : territoire, puis organisation, puis province, puis rôle, en privilégiant les personnes de garde les moins chargées."
  - "Les délais d'accusé de réception sont de 15 minutes en urgence, 4 heures au niveau 3 et 24 heures au niveau 2 ; le dépassement escalade vers un superviseur."
  - "Une file sans agents formés et payés pour la tenir est le véritable mode de défaillance : la technique ne produit pas de la prise en charge."
faq:
  - q: "Qu'est-ce qui déclenche l'ouverture automatique d'un cas ?"
  - a: "Quatre situations déterministes : un niveau de gravité supérieur ou égal à 2, une confiance de compréhension inférieure à 0,40, une maladie à déclaration obligatoire, ou une demande explicite de parler à un humain. Une divulgation relevant de la protection des personnes ouvre également un dossier, mais dans un circuit restreint."
  - q: "Qui reçoit le cas quand plusieurs relais sont disponibles ?"
  - a: "Le routage descend une échelle fixe : d'abord les personnes rattachées au territoire, puis à l'organisation, puis à la province, puis au rôle responsable du module. Dans le groupe retenu, les personnes de garde passent avant les autres, et la moins chargée l'emporte. L'attribution est atomique : deux superviseurs qui cliquent en même temps ne peuvent pas prendre le même cas."
  - q: "Que se passe-t-il si personne n'accuse réception à temps ?"
  - a: "Le cas est marqué en dépassement, un événement est émis, le superviseur est alerté et le cas monte d'un cran dans l'échelle d'escalade avec une nouvelle horloge. Le dépassement reste inscrit dans l'historique même après la prise en charge : c'est un fait, pas un statut temporaire."
  - q: "Un soignant peut-il contredire le niveau proposé par le système ?"
  - a: "Oui, toujours, mais jamais en silence. Cette correction humaine du niveau de gravité exige un motif écrit d'au moins dix caractères. La valeur proposée par le système est conservée à côté de la valeur retenue par la personne, avec son nom et l'horodatage, et l'ensemble alimente le rapport de performance de l'IA."
  - q: "Le service peut-il garantir qu'un relais répondra ?"
  - a: "Non. Le programme garantit qu'un cas est ouvert, routé, chronométré et escaladé, et que l'absence de réponse est visible. Il ne peut pas garantir la présence d'un agent formé et disponible dans chaque territoire. Ce service n'est pas un service d'urgence : devant un signe de danger, il faut se rendre immédiatement à la structure de santé la plus proche."
sources:
  - label: "Organisation mondiale de la santé — lignes directrices sur les agents de santé communautaires"
  - url: "https://www.who.int/"
  - label: "UNICEF — systèmes de santé communautaires et référencement"
  - url: "https://www.unicef.org/"
  - label: "PubMed — littérature évaluée sur les circuits de référence communautaires"
  - url: "https://pubmed.ncbi.nlm.nih.gov/"
related: [ia-triage-sante-communautaire, signes-de-danger-detection-automatique, garde-fous-ia-service-public]
---

Le triage produit une phrase. L'escalade produit une responsabilité. C'est une différence de nature : tant qu'aucun humain n'a un nom, une file et une horloge, un service vocal de santé n'a rien fait d'autre que parler. Ce texte décrit comment fonctionne l'**escalade vers les relais communautaires** dans CONGO VOICE AI OS — le cycle de vie d'un cas, la façon dont il trouve la bonne personne, les délais annoncés, ce qui se passe quand ils sont dépassés, et le mode de défaillance que la technique ne peut pas corriger.

## Un cas : une file, un responsable, une horloge

Un cas est l'unité de comptabilité du service. Il naît d'une interaction, il porte un module, une province, un territoire, un niveau de gravité, un propriétaire éventuel et une échéance. Son ouverture n'est pas une appréciation : quatre règles déterministes la déclenchent.

- **Le niveau de gravité est supérieur ou égal à 2.** Autrement dit, dès qu'une consultation est recommandée, quelqu'un doit pouvoir vérifier qu'elle a eu lieu.
- **La confiance de compréhension est inférieure à 0,40.** Un service qui n'a pas compris n'a pas le droit de conclure seul.
- **La situation relève d'une maladie à déclaration obligatoire**, en santé comme en agriculture.
- **Le citoyen a demandé à parler à un humain.** Cette demande n'a jamais besoin d'être justifiée.

Chaque cas est déposé dans une file nommée de façon prévisible, à partir du rôle responsable du module, de la province et du territoire. Cette convention paraît anodine ; elle décide en réalité de qui voit quoi, et elle rend les tableaux de charge comparables d'une province à l'autre. Le rôle responsable en santé est celui du [relais communautaire décrit dans les services du programme](/services).

## Comment un cas trouve-t-il la bonne personne ?

Le routage ne cherche pas la meilleure personne au sens absolu. Il cherche une personne **proche, disponible et pas déjà submergée**, selon un ordre fixe qui donne toujours le même résultat pour la même entrée.

1. **Territoire.** Les agents rattachés au territoire du cas, y compris ceux qui couvrent plusieurs territoires.
2. **Organisation.** À défaut, les agents de l'organisation partenaire concernée.
3. **Province.** À défaut, les agents de la province.
4. **Rôle.** En dernier ressort, l'ensemble des personnes portant le rôle responsable du module.

Dans le premier niveau non vide de cette échelle, les personnes **de garde** sont retenues en priorité ; s'il n'y en a aucune, tout le groupe redevient éligible. Puis la charge tranche : le nombre de cas actifs déjà attribués, et à égalité un identifiant stable, pour que deux exécutions ne donnent jamais deux résultats différents.

### L'attribution ne peut pas être prise deux fois

Deux superviseurs qui ouvrent le même cas au même instant sont un scénario banal dans un centre de coordination. L'attribution s'effectue donc par comparaison et échange sur la version du cas : le premier écrit gagne, le second reçoit un conflit explicite et doit recharger. Une réattribution efface l'accusé de réception précédent et redémarre l'horloge — le nouveau propriétaire hérite du cas, pas du temps déjà consommé par un autre.

## La machine à états : ce qu'un cas peut devenir

Toutes les transitions possibles sont déclarées dans une table. Ce qui n'y figure pas est refusé, avec la liste des transitions permises en retour. Un cas ne peut donc pas sauter d'un état à un autre parce qu'une interface l'aurait laissé faire.

| État | Ce qu'il signifie | Effet sur l'horloge |
|---|---|---|
| Ouvert | Cas créé, personne ne l'a encore pris | Horloge lancée |
| Ouvert en urgence | Niveau 4, alerte immédiate envoyée | Horloge de 15 minutes |
| Attribué | Un agent nommé en est responsable | Horloge maintenue |
| Accusé de réception | Un humain a confirmé la prise en charge | Horloge arrêtée |
| En cours | Travail engagé, appel ou visite | Horloge maintenue |
| Suivi requis | En attente du citoyen ou d'un résultat | Horloge suspendue, avec motif |
| Réattribué | Passage à un autre agent, motif obligatoire | Horloge redémarrée |
| Escaladé | Monté d'un cran, alerte au responsable | Horloge redémarrée |
| Escaladé au superviseur | Deuxième cran, administration prévenue | Horloge redémarrée |
| Résolu | Action terminée, clôture non encore validée | Horloge arrêtée |
| Clôturé, annulé, doublon | États terminaux | Aucune horloge |

Trois garde-fous méritent d'être signalés. Une **annulation, un doublon ou une réattribution exigent un motif écrit**. Une **clôture exige quatre informations** : le résultat, l'action réellement faite, la joignabilité de la personne et une décision de suivi. Enfin, les **doublons sont fusionnés, jamais supprimés** : les identifiants sont conservés, et le suivi programmé sur le cas source est rattaché au cas cible.

## Quinze minutes, quatre heures, vingt-quatre heures

Les délais de prise en charge sont des tables, pas des objectifs négociés au cas par cas. Ils portent sur l'**accusé de réception** — le moment où un humain déclare qu'il prend le cas — et non sur la résolution, qui dépend de la distance, du transport et de l'état du centre de santé.

| Niveau de gravité | Délai d'accusé de réception | Premier rappel de suivi | Ce que voit le citoyen |
|---|---|---|---|
| 4 — urgence | 15 minutes | 2 heures | Message d'urgence, départ immédiat, alerte d'un relais |
| 3 — le jour même | 4 heures | 6 heures | Consultation aujourd'hui |
| 2 — sous 24 heures | 24 heures | 24 heures | Consultation dans la journée qui vient |
| 1 — surveillance | 72 heures | 72 heures | Surveillance à domicile |
| 0 — conseils | Aucune horloge | 7 jours | Conseils à la maison |

Deux précisions comptent. D'abord, **seul un acte humain arrête l'horloge** : ni l'ouverture automatique, ni l'attribution, ni une notification lue ne suffisent. Ensuite, **une horloge suspendue porte toujours un motif** — « en attente du citoyen », par exemple — afin qu'un délai suspendu ne devienne pas un délai oublié.

## Quand le délai est dépassé

Un balayage régulier passe sur les cas actifs dont l'échéance est passée sans accusé de réception. Pour chacun :

- le cas est marqué en dépassement, et **cette marque est définitive** : elle reste dans l'historique et dans les statistiques, même après la prise en charge ;
- un événement de dépassement est émis, avec le nombre de minutes de retard, la file et le propriétaire éventuel ;
- une ligne d'audit est écrite, avec l'auteur système et l'horodatage ;
- le cas monte d'un cran : escalade vers le responsable, puis, au cran suivant, vers l'administration ;
- l'agent attribué et le superviseur reçoivent chacun une notification, dédupliquée pour qu'un même retard ne produise pas dix alertes ;
- une nouvelle échéance est posée. Le cas ne sera repris par le balayage suivant que si cette nouvelle échéance est manquée à son tour.

C'est cette dernière règle qui transforme le dépassement en **échelle d'escalade** plutôt qu'en alarme répétitive. Un cas ignoré ne disparaît pas du radar : il remonte, cran par cran, jusqu'à une personne qui doit en répondre.

Un second balayage, distinct, s'occupe des cas bloqués : ceux dont la date de suivi est passée alors qu'ils sont encore actifs. Ils produisent un rappel à leur propriétaire, un rappel à la file quand personne ne les a pris, et une nouvelle échéance à vingt-quatre heures. La logique est la même que pour les [signes de danger détectés automatiquement](/blog/signes-de-danger-detection-automatique) : ce que le système ne sait pas résoudre, il le rend visible.

## Corriger la machine, avec un motif écrit

La correction humaine du niveau de gravité est prévue dès la conception. Une escalade vers les relais communautaires n'a de valeur que si le relais peut contredire le système. Un agent de santé qui voit la personne en sait toujours plus qu'un arbre de décision alimenté par une phrase mal transcrite.

La correction du niveau de gravité est donc ouverte à toute personne habilitée, avec quatre conditions :

- le nouveau niveau est un entier de 0 à 4 ;
- **un motif écrit d'au moins dix caractères est obligatoire** ; sans lui, la correction est refusée ;
- la valeur proposée par le système est conservée à côté de la valeur retenue par l'humain, avec le nom de l'auteur et l'horodatage ;
- une entrée dédiée est écrite dans le registre des corrections, et un événement est émis.

Ce registre n'est pas une formalité administrative : c'est la principale mesure de qualité de l'IA du programme. Un arbre corrigé vers le haut dans une province et pas ailleurs signale un vocabulaire mal couvert ; un arbre systématiquement corrigé vers le bas signale un réglage trop prudent qui use les équipes. La règle asymétrique est rappelée dans la [page sécurité et gouvernance](/gouvernance) : le système, lui, ne peut jamais abaisser un niveau — seule une personne le peut, et seulement en s'expliquant.

## Le suivi : ce que devient la personne après l'orientation

Orienter quelqu'un vers un centre de santé sans jamais savoir s'il y est allé, c'est publier un chiffre sans dénominateur. Chaque cas porte donc une date de suivi calculée à partir de la gravité, et un rendez-vous de suivi peut être programmé explicitement.

Le retour est saisi avec un résultat, un texte libre et un statut. La décision de suivi appartient à une liste fermée : pas de suivi nécessaire, suivi programmé, personne référée, surveillance en cours, dossier transmis. Cette liste fermée permet ensuite d'agréger sans interpréter du texte libre, et de répondre à la seule question qui intéresse un financeur public : **combien de personnes orientées ont effectivement été prises en charge**.

Les recommandations sur les agents de santé communautaires publiées par [l'Organisation mondiale de la santé](https://www.who.int/) insistent depuis longtemps sur ce point, et les travaux de terrain rassemblés par [l'UNICEF](https://www.unicef.org/) montrent la même chose : ce qui distingue un dispositif communautaire efficace d'un dispositif décoratif, c'est la boucle de retour, pas l'outil d'entrée.

## Le vrai mode de défaillance : une file sans personne pour la tenir

Tout ce qui précède est du logiciel, et le logiciel est la partie facile. Le mode de défaillance qui nous inquiète n'est pas un bug de transition d'état : c'est une file d'attente qui grossit dans un territoire où aucun agent n'est de garde.

Dans cette situation, le système fait exactement ce pour quoi il est écrit — il ouvre, il route, il chronomètre, il escalade — et rien ne se produit dans la vie réelle. Pire, chaque escalade automatique consomme l'attention d'un superviseur déjà débordé, jusqu'à ce que les alertes deviennent du bruit.

Nous en tirons quatre conséquences opérationnelles.

- **Les indicateurs de file sont publics dans la console** : profondeur, cas non attribués, cas en dépassement, âge du plus ancien, prochaine échéance. Une file saine et une file abandonnée ne se ressemblent pas.
- **Aucune province n'est ouverte sans agents identifiés et formés.** Ouvrir le service là où personne ne peut répondre reviendrait à promettre une prise en charge inexistante.
- **Le dimensionnement se discute avant le déploiement**, pas après le premier drame : nombre d'agents par territoire, plages de garde, volume soutenable par agent et par jour.
- **Le citoyen n'attend jamais la file quand il y a un signe de danger.** Le message lui dit de partir immédiatement, indépendamment de toute escalade. C'est le sens de la [page consacrée à la conduite à tenir en cas d'urgence](/urgence).

## Ce que nous ne savons pas encore

- Les **volumes réels par territoire** sont inconnus tant que le pilote n'a pas tourné ; aucun chiffre national n'est publié.
- Les **règles de dimensionnement** — combien de cas par agent et par jour — sont des hypothèses de travail, pas des mesures.
- Les **protocoles qui produisent les niveaux ne sont pas cliniquement approuvés** : ils portent la mention « en attente du comité de revue clinique ».
- Le service **oriente et informe ; il ne soigne pas** et ne remplace pas un agent de santé. Ce n'est pas un service d'urgence.

Une escalade vers les relais communautaires bien conçue ne rend pas un système de santé plus rapide par magie. Elle rend visible, cas par cas et heure par heure, l'écart entre ce qui a été promis à une personne et ce qu'elle a réellement reçu. C'est déjà beaucoup, et c'est le préalable à toute amélioration. La logique de décision qui précède l'escalade est détaillée dans le guide sur [l'IA et le triage en santé communautaire](/blog/ia-triage-sante-communautaire).
