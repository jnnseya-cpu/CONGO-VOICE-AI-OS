---
slug: objectifs-de-service-percentiles
title: "Objectifs de service : mesurés, ou dits non mesurés"
description: "Six objectifs de service nommés depuis l'expérience du citoyen, mesurés en percentile 95 sur les journaux réels, et déclarés non mesurés sous trente observations."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: mesure de la qualité de service
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des délais acceptables en situation d'urgence
keywords: [objectifs de service, percentile 95, nombre d'observations, réponse parlée, disponibilité]
entities: [objectif, percentile, observation, latence, disponibilité, fenêtre de mesure, journal de requêtes]
tags: [Gouvernance, Architecture, Transparence, Produit, RDC]
imageAlt: "Tableau des six objectifs de service du programme, avec leur cible, leur mesure et la mention non mesuré"
takeaways:
  - "Six objectifs, tous nommés depuis ce que vit une personne : « une réponse parlée arrive avant que l'appelant abandonne », pas « disponibilité de l'interface de programmation »."
  - "Les cibles sont des percentiles 95, calculés dans la base sur les journaux réels de requêtes et d'interactions."
  - "Sous trente observations, un percentile est du bruit : il est rapporté comme non mesuré, jamais comme réussi."
  - "Le rapport distingue trois états — tenu, non tenu, non mesuré — parce que le silence ne doit pas se lire comme un succès."
  - "Un percentile est une propriété d'un service en charge réelle, pas une propriété d'une version logicielle : aucune de ces cibles n'est tenue par le fait de compiler."
faq:
  - q: "Pourquoi ne pas publier simplement un temps de réponse moyen ?"
  - a: "Parce qu'une moyenne cache exactement ce qui fait abandonner une personne. Si neuf appels répondent en deux secondes et un en quarante, la moyenne est acceptable et un appelant sur dix a raccroché. Le percentile 95 décrit l'expérience des cas les moins bien servis, qui sont ceux qui comptent."
  - q: "Que veut dire « non mesuré » dans vos rapports ?"
  - a: "Que le nombre d'observations sur la fenêtre est inférieur à trente, donc qu'aucun percentile ne peut être affirmé. C'est dit explicitement, à côté de l'objectif, plutôt que présenté comme un objectif tenu. Un tableau de bord entièrement vert parce qu'il n'y a pas de trafic est un mensonge par omission."
  - q: "Les cibles annoncées sont-elles atteintes aujourd'hui ?"
  - a: "C'est ce que la mesure dit, pas ce que le programme affirme. Au volume actuel du pilote, plusieurs objectifs ressortent comme non mesurés, et ceux qui le sont dépendent en partie de prestataires externes de transcription et de synthèse. Le programme publiera les mesures telles qu'elles sortent, y compris quand elles sont mauvaises."
  - q: "Pourquoi l'un des objectifs exclut-il les appels de modèle ?"
  - a: "Parce qu'il mesure la plateforme elle-même. Une route qui ne fait que lire une base doit répondre en quelques centaines de millisecondes ; si elle est lente, la cause est dans notre code. Mélanger les deux empêche de savoir qui est responsable d'une lenteur."
  - q: "La disponibilité à 99,5 % couvre-t-elle une panne de réseau ?"
  - a: "Non. Elle est calculée sur les requêtes qui ont atteint la plateforme : c'est la part de celles servies sans erreur du serveur. Une requête bloquée par une coupure chez un opérateur n'y figure pas. C'est une limite réelle de cet indicateur, et c'est pourquoi le comportement hors réseau est traité séparément."
sources:
  - label: "Union internationale des télécommunications — mesurer le développement numérique"
  - url: "https://www.itu.int/"
  - label: "GSMA — connectivité mobile en Afrique subsaharienne"
  - url: "https://www.gsma.com/"
related: [orchestration-interaction-dix-etapes, rapports-institutionnels-denominateurs, mode-degrade-securite-sans-reseau]
---

La plupart des documents de programme annoncent des niveaux de service, et presque aucun ne dit comment ils seront mesurés ni ce qui sera affiché lorsqu'il n'y aura pas assez de trafic pour les mesurer. C'est pourtant là que la redevabilité se joue. Les **objectifs de service** de cette plateforme sont donc définis avec trois choses inséparables : une cible, une méthode de calcul, et un comportement explicite quand la mesure est impossible.

## Six objectifs, nommés depuis l'expérience du citoyen

Le premier choix est lexical, et il est délibéré. Aucun objectif ne porte un nom d'infrastructure. « Disponibilité de l'interface de programmation » n'est pas une expérience ; « une réponse parlée arrive avant que l'appelant abandonne » en est une.

| Objectif | Cible | Ce qu'il décrit |
|---|---|---|
| Première réponse parlée sur un appel | 6 s au plus (p95) | Le temps avant que la voix réponde, sur le canal téléphonique |
| Réponse à une note vocale WhatsApp | 12 s au plus (p95) | Le temps entre l'envoi du vocal et la réponse |
| Analyse d'une photo de culture | 15 s au plus (p95) | Le diagnostic agricole à partir d'une image |
| Réponse d'interface hors appel de modèle | 400 ms au plus (p95) | La plateforme elle-même, sans dépendance externe |
| Réponse utile, voie texte | 12 s au plus (p95) | Le tour complet sur le canal écrit |
| Requêtes servies sans erreur du serveur | 99,5 % au moins | La part des requêtes qui n'ont pas échoué chez nous |

Le quatrième est le seul qui parle de technique, et il est là pour une raison précise : il isole ce dont le programme est responsable. Une lenteur sur ce chiffre ne peut pas être imputée à un prestataire ; elle est dans notre code ou dans notre base.

Les trois premiers, eux, dépendent en partie de services externes de transcription et de synthèse vocale. Cette dépendance est documentée dans l'article sur l'[indépendance des fournisseurs](/blog/independance-fournisseurs-ia), et elle a une conséquence directe sur la mesure : une dégradation chez un fournisseur se lit immédiatement dans ces percentiles, ce qui est exactement l'intérêt de les suivre.

## Pourquoi un percentile n'est pas une propriété du logiciel

C'est la phrase la plus importante de cet article, et elle vaut contre notre propre tentation de rassurer : **un percentile est une propriété d'un service en charge réelle, pas d'une version logicielle.** Aucune de ces cibles n'est tenue par le fait que le code compile, que les tests passent ou qu'un déploiement ait réussi.

Ce qu'un dépôt de code peut faire, en revanche, est précis et limité : calculer honnêtement ces valeurs à partir de ce que la plateforme enregistre déjà, dire sur combien d'observations elles reposent, et refuser de publier un chiffre qui repose sur trop peu.

Le **percentile 95** est retenu plutôt que la moyenne, pour une raison qui n'est pas statistique mais humaine. Une moyenne acceptable peut cacher un appelant sur vingt qui attend quarante secondes et raccroche. Dans un service de santé, cette personne est celle dont l'appel comptait peut-être le plus. Un indicateur qui l'efface n'est pas un indicateur de qualité, c'est un indicateur de confort.

Le calcul est fait dans la base de données, par une fonction de percentile appliquée aux colonnes de latence des interactions et du journal de requêtes, et non en extrayant les lignes pour les trier dans le code. Sur un service national, le nombre de lignes est précisément la raison pour laquelle le percentile compte : une méthode qui ne tient pas à l'échelle fabrique un indicateur qui disparaît quand le trafic arrive.

## Le seuil de trente observations, et le mot « non mesuré »

Sous un certain volume, un percentile n'est pas une mesure : c'est du bruit avec une décimale. Le programme fixe donc un plancher — trente observations sur la fenêtre — en dessous duquel l'objectif est rapporté comme **non mesuré**.

Ce choix a une conséquence inconfortable et saine : au volume actuel du pilote, plusieurs objectifs ressortent comme non mesurés. Le rapport les affiche dans une liste distincte, à côté de ceux qui sont tenus et de ceux qui ne le sont pas. Trois états, jamais deux.

La raison est écrite dans le code, à côté du filtre : personne ne doit lire le silence comme un succès. Un tableau de bord tout vert parce qu'il n'y a pas eu de trafic est l'artefact le plus dangereux d'un programme pilote, parce qu'il se présente aux financeurs comme une preuve de maturité. Le **nombre d'observations** est donc publié à côté de chaque valeur, de la même façon que les [rapports institutionnels](/blog/rapports-institutionnels-denominateurs) publient leurs dénominateurs.

La fenêtre de mesure par défaut est de vingt-quatre heures. Elle est courte volontairement : un percentile calculé sur un trimestre lisse les mauvaises heures, et une mauvaise heure sur un service d'urgence n'est pas un détail statistique.

## Comment la disponibilité est calculée, et ce qu'elle rate

La **disponibilité** est la part des requêtes parvenues à la plateforme qui n'ont pas échoué par une erreur du serveur. Elle est calculée sur le journal de requêtes : nombre total, moins celles qui se sont terminées par une erreur de serveur, divisé par le total.

Cette définition est simple, et elle rate trois choses qu'il faut nommer.

- **Une requête qui n'arrive jamais ne compte pas.** Une coupure chez un opérateur, une antenne saturée, un téléphone sans crédit de données : rien de tout cela n'apparaît. Les travaux de l'[Union internationale des télécommunications](https://www.itu.int/) et de la [GSMA](https://www.gsma.com/) sur la qualité de service en Afrique subsaharienne décrivent précisément cette zone aveugle, qui est, pour un usager rural, la cause la plus fréquente d'échec.
- **Une erreur qui se présente comme un succès ne compte pas.** Une réponse renvoyée avec un code de succès mais vide de contenu utile est, pour la personne, un échec. Ce cas est traité ailleurs : par les seuils de confiance et par la détection de transcription inventée, pas par cet indicateur.
- **Une panne de dépendance externe n'est pas toujours une erreur de serveur.** Lorsque tous les fournisseurs sont injoignables, la plateforme répond — en mode dégradé, avec le script d'urgence s'il y a lieu, comme décrit dans l'article sur le [mode dégradé](/blog/mode-degrade-securite-sans-reseau). Cette réponse est comptée comme servie, ce qui est correct, et elle ne dit pas que le service était complet.

Autrement dit, cet indicateur mesure notre fiabilité, pas l'accessibilité du service. Les deux sont nécessaires, et les confondre reviendrait à se décerner une note sur un périmètre choisi.

## Les trois latences d'un tour de parole

Pour comprendre pourquoi la cible du canal téléphonique est deux fois plus sévère que celle du canal écrit, il faut décomposer ce qui se passe pendant qu'une personne attend.

Un tour de conversation vocale enchaîne trois attentes de nature différente. La première est l'attente technique : transcrire la parole, comprendre, calculer un risque, rédiger, traduire, puis prononcer. La deuxième est l'attente perçue : ce que la personne croit qu'il se passe pendant le silence. La troisième est l'attente sociale : ce qu'un silence signifie dans une conversation réelle, où deux secondes sans réponse sont déjà longues et où six secondes ressemblent à une ligne coupée.

Un appel téléphonique ne pardonne aucune des trois. Il n'offre aucun indice visuel, aucun indicateur d'activité, aucun moyen de dire « je réfléchis » autrement qu'en parlant. C'est pourquoi la cible y est la plus basse de toutes, et pourquoi l'architecture de l'appel ne peut pas attendre que le tour complet soit prêt avant d'émettre le premier mot : il faut accuser, occuper, puis répondre.

Le canal écrit, à l'inverse, tolère douze secondes parce qu'il affiche un état. Une note vocale envoyée sur une messagerie porte une coche, un indicateur de lecture, une attente comprise comme normale. La même durée produit deux expériences très différentes, et c'est la raison pour laquelle une cible unique de latence pour tous les canaux serait soit intenable sur l'un, soit inutilement laxiste sur l'autre.

Enfin, l'analyse d'une photographie a la cible la plus généreuse, quinze secondes, pour une raison assumée : une personne qui vient de photographier une feuille malade sait qu'elle a envoyé une image, et elle accepte une attente qu'elle n'accepterait pas après avoir parlé. L'exigence suit l'usage, pas une symétrie de tableau.

## À quoi sert un objectif que l'on ne tient pas encore

La question est légitime : pourquoi publier six cibles lorsque plusieurs sont, aujourd'hui, non mesurées ou non tenues ?

Pour trois raisons, dont la dernière est la plus importante.

1. **Une cible nommée oriente l'ingénierie.** « Six secondes avant la première réponse parlée » décide de l'architecture d'un appel téléphonique : on ne peut pas attendre une transcription complète, une analyse et une synthèse avant de dire le premier mot. La mesure a donc déjà changé le produit, avant même d'être atteinte.
2. **Une cible publiée rend la dégradation discutable.** Lorsqu'un fournisseur ralentit, la discussion porte sur un écart à une cible connue, et non sur une impression partagée en réunion.
3. **Une cible honnête protège le programme de lui-même.** Il est beaucoup plus facile d'annoncer une latence flatteuse dans une présentation que de la retirer ensuite. En publiant la méthode et le plancher d'observations avant les chiffres, le programme se prive d'avance de la possibilité de choisir les mesures qui l'arrangent.

Il faut ajouter une quatrième raison, purement défensive : une cible publiée avec sa méthode empêche qu'un chiffre sorti de son contexte circule ensuite comme une promesse. Dès lors que la fenêtre, le percentile retenu et le plancher d'observations sont écrits à côté de la valeur, personne ne peut citer honnêtement la valeur sans eux.

Ce que les **objectifs de service** apportent n'est donc pas une garantie de performance. C'est un engagement sur la manière dont la performance sera dite : avec sa fenêtre, son nombre d'observations, et le mot « non mesuré » quand il s'impose.

Il reste une raison plus prosaïque de publier ces cibles maintenant : elles servent de contrat entre les équipes. Une équipe produit qui demande une fonctionnalité supplémentaire dans le chemin d'un appel téléphonique sait qu'elle dépense un budget de six secondes déjà serré, et la discussion porte sur ce budget plutôt que sur des préférences. Une cible partagée transforme un arbitrage d'opinion en arbitrage d'ingénierie.

## Ce que ces objectifs ne couvrent pas

Quatre limites, pour finir sans embellir.

- **Ils ne mesurent pas la justesse d'une réponse.** Un service rapide et faux est pire qu'un service lent et prudent. La justesse relève des seuils de qualité par langue et de la revue clinique, pas de la latence.
- **Ils ne couvrent pas le parcours complet d'un cas.** Le temps qu'un agent met à rappeler une famille n'est pas ici : il est dans les délais de prise en charge de la [gestion des cas](/blog/gestion-des-cas-sla-escalade), qui se comptent en heures et non en secondes.
- **Ils ne surveillent rien de façon active.** Les valeurs viennent du trafic réel ; il n'existe pas encore de sonde synthétique qui appelle le service toutes les minutes pour détecter une panne sans usager. C'est une lacune connue, et elle est inscrite comme telle.
- **Ils ne remplacent pas un engagement contractuel.** Ce sont des objectifs internes publiés, pas des pénalités négociées. Les règles de supervision qui les encadrent figurent sur la page de [gouvernance](/gouvernance), et le détail de ce qui est chronométré dans un tour se trouve dans l'article sur l'[orchestration d'une interaction](/blog/orchestration-interaction-dix-etapes).
