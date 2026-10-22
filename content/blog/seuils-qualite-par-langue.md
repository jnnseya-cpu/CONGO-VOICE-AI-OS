---
slug: seuils-qualite-par-langue
title: "Seuils de qualité par langue : mesurer avant d'ouvrir"
description: "Les seuils de qualité par langue décident si une langue répond librement ou reste en mode scripté : six mesures, 200 échantillons, et aucune exception."
lang: fr
category: Langues et parole
cluster: langues
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: évaluation des langues et portes de qualité
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: validation du seuil de rappel des urgences
keywords: [seuils de qualité par langue, taux d'erreur de mots, rappel des urgences, mode scripté, évaluation de la reconnaissance vocale]
entities: [WER, audio de terrain, justesse d'intention, identification de langue, synthèse vocale, lingala, kikongo, tshiluba, kiswahili]
tags: [Langues, Qualité, Mesure, Sécurité, RDC]
imageAlt: "Tableau des six seuils de qualité qu'une langue doit franchir avant de répondre librement"
takeaways:
  - "Une langue ne répond librement qu'après avoir franchi six seuils mesurés sur au moins 200 échantillons."
  - "Tant que la mesure n'existe pas, la langue reste en mode scripté : menus et textes relus, plutôt qu'une conversation fluide et fausse."
  - "Le rappel des urgences est fixé à 98 % : c'est le seuil qu'aucune démonstration ne peut contourner."
  - "Le français est tenu à un seuil de transcription plus strict que les langues nationales, parce que les modèles y sont bien meilleurs."
faq:
  - q: "Pourquoi fermer une langue au lieu de la laisser répondre imparfaitement ?"
  - a: "Parce qu'une réponse fluide et fausse est plus dangereuse qu'un menu limité. Un usager n'a aucun moyen de savoir que le service l'a mal compris : la réponse est bien formée, prononcée avec assurance, et il agira dessus. Le mode scripté restreint ce que le service peut dire à des textes relus, ce qui borne le dégât possible."
  - q: "Que signifie concrètement un taux d'erreur de mots de 20 % ?"
  - a: "Qu'un mot sur cinq est mal transcrit. Sur une phrase de quinze mots, trois mots sont faux. C'est acceptable pour orienter vers un service si l'intention est bien reconnue, et inacceptable pour restituer un dosage ou une durée. C'est pourquoi le taux d'erreur n'est qu'un seuil parmi six."
  - q: "Pourquoi exiger 98 % de rappel sur les urgences plutôt que 100 % ?"
  - a: "Parce que 100 % ne se mesure pas honnêtement sur un échantillon fini : ce serait une promesse invérifiable. 98 % est un seuil atteignable et contrôlable, et il est complété par la détection déterministe par mots-clés, qui ne dépend d'aucun modèle et s'exécute avant lui."
  - q: "Pourquoi 200 échantillons minimum ?"
  - a: "En dessous, un résultat n'est pas un résultat : quelques enregistrements favorables suffisent à produire un score flatteur. Deux cents échantillons restent modestes pour une évaluation scientifique, mais c'est le plancher en dessous duquel le programme refuse d'ouvrir une langue."
  - q: "Les seuils peuvent-ils être abaissés pour une démonstration ?"
  - a: "Ils sont définis dans le code et couverts par des tests, pas réglables depuis un écran d'administration. Un garde-fou dont on peut baisser la barre depuis une interface n'est pas un garde-fou. Un changement de seuil est une modification de code, visible dans l'historique."
sources:
  - label: "Mozilla Common Voice — jeux de données vocaux ouverts et multilingues"
  - url: "https://commonvoice.mozilla.org/"
  - label: "Masakhane — recherche en traitement automatique des langues africaines"
  - url: "https://www.masakhane.io/"
related: [reconnaissance-vocale-lingala, corpus-vocal-langues-nationales, ia-vocale-langues-congolaises]
---

La façon la plus simple de faire échouer un service vocal multilingue est de l'annoncer dans cinq langues le jour de la démonstration. Tout fonctionne : les phrases sont choisies, l'audio est propre, la salle est silencieuse. Six mois plus tard, une femme pose une question en tshiluba dans un marché et reçoit une réponse fluide, assurée, et sans rapport avec ce qu'elle a demandé. Les **seuils de qualité par langue** existent pour que cette journée n'arrive pas.

## Le principe : une langue ne répond librement qu'une fois mesurée

Le service distingue deux modes de fonctionnement pour chaque langue.

- **Le mode complet** : la langue est ouverte, le modèle comprend, reformule et répond librement.
- **Le mode scripté** : le service n'utilise que des textes relus et des menus. Il oriente, il n'improvise pas.

Le passage du second au premier n'est pas une décision d'équipe ni une date dans un plan. C'est le résultat d'une évaluation. Tant qu'aucune mesure n'existe pour une langue, elle **reste en mode scripté**, y compris si le modèle semble s'en sortir en démonstration. L'absence de preuve n'est pas traitée comme une preuve d'absence de problème : elle est traitée comme une absence de droit à répondre.

Ce choix est le pendant linguistique de la [revue clinique](/blog/revue-clinique-protocoles-signes), où un protocole non signé ne produit pas une réponse atténuée mais aucune réponse.

## Les six seuils, et ce que chacun protège

Un seul chiffre ne suffit pas à décrire la qualité d'une langue. Un modèle peut transcrire correctement et se tromper d'intention, ou comprendre l'intention et prononcer une réponse inaudible. Le programme mesure donc six choses, et **toutes** doivent passer.

| Mesure | Ce qu'elle contrôle | Seuil français | Seuil langues nationales |
|---|---|---|---|
| Taux d'erreur de mots, audio propre | La transcription en conditions favorables | ≤ 12 % | ≤ 20 % |
| Taux d'erreur de mots, audio de terrain | La transcription sur une ligne téléphonique 8 kHz | ≤ 30 % | ≤ 30 % |
| Justesse d'intention | Avoir compris ce que la personne demande | ≥ 90 % en santé, ≥ 85 % ailleurs | ≥ 90 % en santé, ≥ 85 % ailleurs |
| Rappel des urgences | Ne pas manquer une situation grave | ≥ 98 % | ≥ 98 % |
| Intelligibilité de la voix de synthèse | Être compris à l'écoute, note sur cinq | ≥ 3,8 | ≥ 3,8 |
| Identification de la langue | Reconnaître dans quelle langue on parle | ≥ 95 % | ≥ 95 % |

Trois points méritent un commentaire, parce qu'ils ne vont pas de soi.

**Le français est tenu plus strictement que les langues nationales** sur la transcription en audio propre : 12 % contre 20 %. Ce n'est pas une faveur faite au français, c'est l'inverse. Les modèles mondiaux sont bien meilleurs en français ; accepter 20 % d'erreurs reviendrait à tolérer une dégradation que rien ne justifie. Le seuil suit ce qui est atteignable, langue par langue.

**L'audio de terrain est mesuré séparément**, et au même niveau pour toutes les langues. Un modèle évalué uniquement sur des enregistrements de studio ne dit rien de ce qui se passe sur une ligne téléphonique compressée à 8 kHz, avec du vent et une moto. C'est pourtant l'unique condition réelle d'usage pour l'[accès sans smartphone](/blog/acces-sans-smartphone-ivr-ussd-sms).

**Le rappel des urgences est le seuil qui ne se négocie pas.** Il mesure la proportion de situations graves correctement reconnues comme telles. Une erreur dans ce sens — manquer une convulsion — n'est pas comparable à une erreur de confort. Hors santé, ce seuil ne s'applique pas, parce qu'il n'a pas d'objet.

## Pourquoi un plancher de 200 échantillons ?

Un score calculé sur quinze enregistrements n'est pas un score, c'est une impression. Il suffit de choisir des phrases nettes, prononcées par des locuteurs urbains habitués aux interfaces, pour obtenir un chiffre flatteur qui ne survivra à aucun usage réel.

Le programme fixe donc un plancher : **200 échantillons au minimum** avant qu'une évaluation compte. En dessous, le verdict est « non mesuré », ce qui équivaut au mode scripté. Deux cents reste un chiffre modeste au regard des standards de la recherche ; c'est un plancher opérationnel, pas une ambition.

Ce plancher a une conséquence inconfortable qu'il vaut mieux énoncer : il est plus facile de franchir les seuils en français que de réunir 200 enregistrements de terrain en tshiluba. La contrainte qui ralentit l'ouverture d'une langue n'est pas la qualité du modèle, c'est la disponibilité de la donnée d'évaluation. C'est exactement le problème que décrit l'article sur le [corpus vocal des langues nationales](/blog/corpus-vocal-langues-nationales).

## Ce que les seuils de qualité par langue produisent comme comportement visible

Pour l'usager, la différence entre les deux modes est concrète et ne lui est pas cachée.

1. En mode complet, il pose sa question comme il le souhaite et reçoit une réponse rédigée pour son cas.
2. En mode scripté, il est guidé par des choix, et les textes qu'il entend ont été relus. La conversation est plus rigide et moins agréable.
3. Dans les deux cas, les signes de danger sont détectés par les mêmes règles déterministes, et l'escalade vers un humain est identique.
4. Dans les deux cas, le service dit dans quelle langue il a cru entendre la question, ce qui permet de le corriger.

Autrement dit, ce que le mode scripté retire, c'est la fluidité ; ce qu'il préserve, c'est la sécurité. Le détail de cette séparation figure sur la [page sécurité et gouvernance](/gouvernance), et l'état de chaque langue sur la [page des langues nationales](/langues-nationales).

## Mesurer une langue que personne n'a mesurée avant

Pour le français, des jeux d'évaluation existent depuis des décennies. Pour le lingala, le kikongo, le kiswahili congolais et le tshiluba, la situation est différente : les ressources publiques sont rares, dispersées, et souvent construites sur de l'écrit plutôt que sur de la parole.

Deux initiatives montrent ce que produit un travail ouvert sur ce terrain. [Mozilla Common Voice](https://commonvoice.mozilla.org/) a établi que des corpus vocaux multilingues peuvent être constitués par des communautés de locuteurs plutôt que par des laboratoires. [Masakhane](https://www.masakhane.io/) a montré, pour les langues africaines, que la recherche progresse plus vite lorsqu'elle est menée par des locuteurs natifs et publiée ouvertement.

Le programme s'inscrit dans cette logique sans prétendre s'y substituer : il mesure ce qu'il déploie, publie le résultat par langue, et admet qu'une langue non mesurée n'est pas une langue prête. Le rôle d'un service public n'est pas de produire la recherche, mais de refuser de prétendre qu'elle est faite.

## Et si les seuils ne sont jamais atteints pour une langue ?

C'est l'hypothèse qu'il faut regarder en face, parce qu'elle est plausible pour le kikongo et le tshiluba à court terme.

Dans ce cas, la langue reste en mode scripté, indéfiniment s'il le faut. Elle n'est pas retirée du service : un menu guidé et des textes relus dans sa langue valent infiniment mieux qu'un renvoi vers le français. Mais elle n'obtient pas l'autorisation de converser librement tant que la mesure ne la justifie pas.

Ce n'est pas une position confortable à défendre devant un bailleur qui finance « cinq langues ». Elle est pourtant la seule qui permette de répondre honnêtement à la question suivante : que vaut la cinquième langue de votre service ? La réponse du programme est un tableau de mesures et une date de dernière évaluation, pas une liste sur une page d'accueil.

## Qui décide des seuils, et comment on les change

Un garde-fou dont la barre se règle depuis un écran d'administration n'est pas un garde-fou : c'est un paramètre, et un paramètre finit toujours par être baissé la veille d'une démonstration importante.

Les seuils de qualité par langue sont donc définis dans le code et couverts par des tests. Les modifier suppose une modification de code, une revue et un historique — c'est-à-dire une trace de qui a abaissé quoi, quand, et avec quelle justification. Personne ne peut passer le rappel des urgences de 98 % à 90 % depuis une interface, un mardi après-midi, parce qu'une évaluation s'annonce mal.

Cette contrainte a un coût réel pour l'équipe : elle rend impossible l'ajustement opportuniste. Elle a aussi une vertu que seuls les incidents révèlent. Le jour où une commission demandera pourquoi le service a répondu dans une langue où il comprenait mal, la réponse ne sera pas une discussion sur des intentions : ce sera un seuil, une mesure datée, un échantillon, et le nom de la version de code qui les portait.

## Le cas que ce dispositif rend impossible

Il est utile de nommer précisément le scénario évité, parce qu'il est fréquent et rarement raconté.

Un service vocal est lancé dans une langue peu dotée. La reconnaissance fonctionne mal, mais le modèle de langage, lui, est excellent : à partir d'une transcription approximative, il produit une réponse plausible, bien construite, dans un registre rassurant. L'usager n'a aucun indice. Il n'y a ni message d'erreur, ni hésitation, ni signal de faible confiance — seulement une réponse à une question qu'il n'a pas posée.

Ce scénario ne se détecte pas par l'usage, parce que les usagers ne signalent pas ce qu'ils ne peuvent pas voir. Il se détecte par la mesure, en amont, ou il ne se détecte pas du tout. C'est la raison d'être du plancher d'échantillons, du taux d'erreur mesuré sur de l'audio de terrain, et du refus d'ouvrir une langue sur la foi d'une impression.

## Ce qu'une évaluation coûte réellement

Il serait malhonnête de présenter ce dispositif comme une simple bonne pratique sans en dire le prix, qui explique pourquoi si peu de services le font.

Réunir deux cents enregistrements évaluables dans une langue peu dotée suppose de se déplacer, de recruter des locuteurs de plusieurs régions, d'enregistrer dans les conditions réelles plutôt qu'au calme, puis de faire transcrire chaque échantillon par une personne qui maîtrise la langue à l'écrit — ce qui, pour le kikongo et le tshiluba, restreint considérablement le vivier. Il faut ensuite recommencer à chaque changement significatif de modèle, sans quoi le chiffre publié décrit un système qui n'existe plus.

C'est un travail de terrain, lent, mal financé par les logiques de projet habituelles, et sans résultat spectaculaire à montrer. Il produit un tableau de six nombres par langue. C'est précisément ce que coûte le droit d'affirmer qu'un service parle une langue, et c'est pourquoi cette affirmation est si souvent faite sans l'avoir payé.

La contrepartie est qu'elle devient opposable. Un partenaire, un ministère ou un régulateur peut demander les chiffres, la date de la dernière évaluation et la taille de l'échantillon, et comparer la réponse à ce que le service fait réellement en production.

## Ce que ce mécanisme ne garantit pas

Trois limites, pour que les seuils ne soient pas lus comme une garantie générale de qualité.

- **Un seuil franchi n'est pas une permanence.** Un changement de fournisseur ou de version de modèle peut dégrader une langue du jour au lendemain. C'est pourquoi l'évaluation est datée et refaite, et non acquise.
- **Les seuils mesurent la langue, pas le contenu.** Une transcription parfaite d'une question à laquelle le service n'a pas le droit de répondre reste sans réponse : c'est la [revue clinique](/gouvernance) qui tranche, pas la qualité vocale.
- **Aucun seuil ne remplace un humain.** Le service oriente et informe ; devant un signe de danger, la [conduite à tenir](/urgence) est de se rendre immédiatement à la structure de santé la plus proche.

La valeur de ce dispositif tient en une phrase : il rend impossible la promesse la plus répandue et la moins vérifiable du secteur — « notre service parle votre langue ». Ici, cette affirmation est soit accompagnée de six chiffres et d'une date, soit elle n'est pas faite.
