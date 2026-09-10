---
slug: signes-de-danger-detection-automatique
title: "Détection automatique des signes de danger en cinq langues"
description: "La détection automatique des signes de danger repose sur des règles de mots-clés en cinq langues, exécutées avant toute IA, et assumant ses faux positifs."
lang: fr
category: Santé communautaire
cluster: sante-communautaire
pillar: false
publishedAt: 2026-08-29
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: couche de sécurité déterministe
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture du vocabulaire d'alerte et des scripts d'urgence
keywords: [détection automatique des signes de danger, règles de mots-clés multilingues, rappel des urgences vitales, mode dégradé sans fournisseur, faux positifs en triage]
entities: [signes de danger, vocabulaire d'urgence, lingala, kiswahili, tshiluba, kikongo, rappel, escalade, mode hors ligne, script d'urgence]
tags: [Santé, Sécurité, Langues, Urgence, RDC]
imageAlt: "Chaîne de détection d'un signe de danger, du mot prononcé au message d'urgence enregistré"
takeaways:
  - "Les signes de danger sont reconnus par des listes de mots dans les cinq langues du programme, avant tout appel à un modèle de langage."
  - "Sur ces règles, le rappel prime sur la précision : manquer une convulsion coûte infiniment plus cher qu'une alerte de trop."
  - "Quand tous les fournisseurs d'IA sont indisponibles, la détection et le message d'urgence continuent de fonctionner à l'identique."
  - "Chaque escalade de niveau 4 ouvre un cas relu par un humain, et les fausses alertes sont comptées plutôt que dissimulées."
faq:
  - q: "Pourquoi ne pas confier la détection des signes de danger à l'IA ?"
  - a: "Parce qu'un modèle peut changer de comportement sans prévenir, échouer, ou renvoyer une sortie hors format. Une liste de mots, elle, est lisible, testable et rejouable : on peut prouver qu'un énoncé donné déclenche la même alerte aujourd'hui et dans deux ans. Le modèle intervient ensuite, pour comprendre et expliquer, jamais pour décider si la situation est grave."
  - q: "Une liste de mots-clés ne va-t-elle pas déclencher beaucoup de fausses alertes ?"
  - a: "Oui, et c'est un choix. Une alerte inutile coûte une orientation prudente vers un centre de santé et quelques minutes à un relais communautaire. Une alerte manquée peut coûter une vie. Les fausses alertes sont enregistrées, comptées et servent à corriger les listes, langue par langue."
  - q: "Que se passe-t-il si le réseau ou le fournisseur d'IA tombe ?"
  - a: "La chaîne de sécurité continue. La détection par mots-clés, l'arbre de décision, le message d'urgence enregistré et l'ouverture d'un cas ne dépendent d'aucun fournisseur externe. Le service perd la conversation naturelle, il ne perd pas la sécurité."
  - q: "Les mots d'alerte couvrent-ils vraiment les cinq langues ?"
  - a: "Le vocabulaire français est le plus complet, le lingala et le kiswahili sont solides, le kikongo et le tshiluba restent les plus fragiles. Ces écarts sont publiés et la collecte de variantes régionales se poursuit avec des locuteurs natifs. Une langue faiblement couverte n'est pas ouverte comme si elle l'était."
  - q: "Le service peut-il remplacer un appel aux secours ?"
  - a: "Non. Ce n'est pas un service d'urgence. Devant un signe de danger, il faut se rendre immédiatement à la structure de santé la plus proche, sans attendre une réponse du service. Le service informe et oriente ; il ne soigne pas et ne remplace pas un agent de santé."
sources:
  - label: "Organisation mondiale de la santé — signes de danger et prise en charge intégrée des maladies de l'enfant"
  - url: "https://www.who.int/"
  - label: "UNICEF — soins communautaires à l'enfant"
  - url: "https://www.unicef.org/"
  - label: "Fédération internationale des Sociétés de la Croix-Rouge et du Croissant-Rouge — premiers secours communautaires"
  - url: "https://www.ifrc.org/"
related: [ia-triage-sante-communautaire, escalade-relais-communautaires, ia-vocale-langues-congolaises]
---

Le moment le plus dangereux d'un service vocal de santé n'est pas celui où il se trompe de conseil. C'est celui où il ne comprend pas qu'il faut arrêter de conseiller. Une mère qui dit « azali kopema mbangu » à propos de son bébé décrit une détresse respiratoire ; si la phrase part vers un modèle de langage qui la résume en « toux légère », le reste de la chaîne travaille sur une fiction. C'est pour cela que la **détection automatique des signes de danger** est la première chose qui s'exécute, et la dernière qu'on accepterait de perdre.

## Les huit signes de danger, et pourquoi ils passent avant l'IA

Le programme reprend les signes de danger généraux utilisés par la prise en charge intégrée des maladies de l'enfant : convulsions ou raideur du corps, inconscience ou somnolence anormale, impossibilité de boire ou de téter, vomissement de tout ce qui est avalé, respiration très difficile ou très rapide, nuque raide, saignement abondant, corps très froid ou brûlant. Un seul de ces signes suffit à imposer un départ immédiat. La liste destinée aux citoyens, avec la conduite à tenir, est publiée sur la [page des signes de danger et de la conduite à tenir](/urgence).

Leur place dans la chaîne est le vrai sujet. Sept étapes séparent l'audio de la réponse parlée ; la reconnaissance de ces huit signes est branchée juste après la transcription, **avant** l'appel au modèle. Trois raisons à cela :

- **La disponibilité.** Un fournisseur d'IA peut être en panne, saturé, ou renvoyer une sortie non conforme au schéma attendu. La sécurité ne peut pas dépendre de cette disponibilité.
- **La stabilité.** Une liste de mots produit exactement le même résultat à chaque exécution. Un modèle, non.
- **La preuve.** Devant une commission, on peut montrer la ligne exacte qui a déclenché l'alerte. C'est ce que le programme appelle des garde-fous déterministes, décrits sur la [page sécurité et gouvernance](/gouvernance).

## Des règles de mots-clés dans cinq langues, exécutées avant tout appel au modèle

Chaque signe de danger est associé à une liste de formulations réellement entendues, en français, lingala, kikongo, kiswahili et tshiluba, y compris les variantes orales que personne n'écrirait. La liste ne cherche pas l'élégance linguistique : elle cherche à attraper ce que les gens disent.

| Signe de danger | Français | Lingala | Kiswahili | Kikongo et tshiluba |
|---|---|---|---|---|
| Convulsions | convulsion, tremble, se raidit | kobeta nzoto, nzoto ekangami | degedege, kifafa | kunikana, kutshinguluka |
| Inconscience | ne réagit pas, évanoui, somnolent | abungisi mayele, alali makasi | kuzimia, kupoteza fahamu | kele ve na mayele, kujimija meji |
| Ne peut pas boire | refuse de boire, ne tète plus | akoki komela te, aboyi komela | hawezi kunywa, hanyonyi | ke buya kunwa, udi ubenga kunua |
| Vomit tout | vomit tout, rejette tout | azali kosanza nyonso | anatapika kila kitu | ke luka yonso, udi ulua bionso |
| Détresse respiratoire | respire mal, respire vite, étouffe | akoki kopema te, kopema mpasi | hapumui, shida ya kupumua | ke pema mpasi, kavua upetesha lupepele |
| Nuque raide | nuque raide, cou raide | nkingo ekangami | shingo ngumu | nsingu me kangama, nshingu mukole |
| Saignement abondant | saigne beaucoup, hémorragie | makila mingi | damu nyingi | menga mingi, mashi a bungi |
| Corps très froid ou brûlant | corps glacé, peau brûlante | nzoto ya malili makasi | mwili baridi sana | nitu ya madidi mingi, mubidi wa luya |

### Ce que ces règles produisent exactement

Elles ne produisent pas un verdict. Elles **remplissent des réponses** dans l'arbre de décision : la question « la personne présente-t-elle un de ces signes ? » reçoit une réponse déterministe, tirée de ce que la personne a effectivement dit. Le moteur de protocoles fait ensuite son travail normal, et un signe reconnu conduit au niveau 4. Cette architecture est décrite dans le guide sur [l'IA et le triage en santé communautaire](/blog/ia-triage-sante-communautaire).

Le point important est l'ordre de priorité : quand le modèle et la règle ne sont pas d'accord, **c'est la règle qui gagne**. Le modèle peut proposer des réponses aux questions du protocole ; les réponses déterministes sont fusionnées par-dessus. Le rappel des signes de danger est donc identique avec ou sans modèle.

### Pourquoi des règles de mots-clés multilingues plutôt qu'un classifieur

Un classifieur entraîné ferait mieux sur le papier : il tolérerait les fautes de transcription, il généraliserait à des formulations absentes de la liste. Trois obstacles nous en ont détournés pour cette couche précise. Il faudrait d'abord un corpus annoté d'urgences vitales par langue, c'est-à-dire exactement ce qui manque le plus en lingala, en kikongo et en tshiluba. Il faudrait ensuite accepter qu'une mise à jour du modèle déplace silencieusement la frontière de décision, sans qu'aucun test ne le signale. Il faudrait enfin renoncer à expliquer une alerte par une ligne précise, ce qu'aucun comité clinique n'accepterait.

Des règles de mots-clés multilingues ont l'avantage inverse : elles sont pauvres, mais entièrement inspectables. Un relais communautaire peut lire la liste de sa langue, dire « ce mot ne se dit pas comme ça chez nous » et faire ajouter la variante. Le jour où un corpus annoté d'urgences vitales existera pour chacune des cinq langues, un classifieur pourra venir **s'ajouter** à ces règles comme second filet — jamais les remplacer.

### Ce que ces listes ne savent pas faire

Elles ne comprennent pas la négation. « Il ne convulse pas, mais j'ai peur » contient le mot déclencheur. Elles ne comprennent pas non plus l'ironie, ni le récit au passé — « la semaine dernière il a convulsé » déclenche la même alerte qu'un événement en cours. Nous connaissons ces limites, nous les avons chiffrées en interne, et nous avons décidé de ne pas les corriger par des règles de négation fragiles. Une orientation prudente de trop est préférable à une règle subtile qui échoue au mauvais moment.

## Pourquoi le rappel compte-t-il plus que la précision ?

En reconnaissance de motifs, deux mesures s'opposent. Le **rappel** est la part des situations graves effectivement détectées. La **précision** est la part des alertes qui étaient justifiées. Améliorer l'une dégrade presque toujours l'autre.

Pour un service public de santé communautaire, les deux erreurs n'ont pas le même prix.

| Type d'erreur | Ce que vit le citoyen | Ce que cela coûte au dispositif |
|---|---|---|
| Faux négatif : un signe de danger manqué | Reste à la maison alors qu'il fallait partir | Perte de chance, potentiellement irréversible |
| Faux positif : une alerte injustifiée | Se déplace, ou reçoit un appel d'un relais | Un déplacement, quelques minutes de travail humain |

Le seuil d'ouverture d'une langue reflète cette asymétrie : le rappel des situations d'urgence est fixé à 98 % minimum, très au-dessus des seuils exigés pour l'exactitude générale de la transcription. Une langue qui ne franchit pas ce seuil ne reste pas en mode conversationnel « un peu moins bon » : elle bascule en mode guidé, avec des messages enregistrés et une navigation par touches. Les [seuils de qualité par langue](/langues-nationales) sont publiés avec la conduite à tenir quand ils ne sont pas atteints.

Ce raisonnement n'a rien d'original en santé publique : les dispositifs de dépistage communautaire recommandés par [l'Organisation mondiale de la santé](https://www.who.int/) sont construits sur la même asymétrie, et les protocoles de premiers secours diffusés par [la Fédération internationale des Sociétés de la Croix-Rouge et du Croissant-Rouge](https://www.ifrc.org/) reposent sur des critères volontairement larges. Ce qui est nouveau, c'est de le faire tenir dans un logiciel qui parle cinq langues.

## Que se passe-t-il quand les fournisseurs d'IA sont indisponibles ?

C'est le test que nous exécutons le plus souvent, parce que c'est celui qui arrive vraiment : coupure réseau, quota dépassé, panne d'un fournisseur, sortie non conforme au schéma attendu.

Dans ce mode dégradé, la chaîne se réduit mais ne se rompt pas :

1. La transcription bascule vers un moteur de secours, ou vers la saisie guidée par touches quand plus aucun moteur ne répond.
2. **La détection par mots-clés continue** : elle ne dépend d'aucun service externe.
3. L'arbre de décision tourne normalement, puisqu'il ne fait qu'évaluer des conditions sur des réponses.
4. L'explication générée disparaît ; c'est le texte d'orientation approuvé du protocole qui est prononcé à sa place.
5. Le message d'urgence, écrit et traduit à l'avance dans les cinq langues, est lu tel quel. Il ne passe par aucun modèle, jamais.
6. Le cas est ouvert et l'alerte part vers un humain, comme en fonctionnement normal.

La règle de conception est simple à énoncer : **le service peut perdre la conversation, il ne doit jamais perdre la sécurité**. C'est aussi pour cette raison qu'un fournisseur hors ligne, capable de faire tourner toute la plateforme sans aucune clé d'accès, est maintenu et testé en continu.

## Les faux positifs, un coût accepté et mesuré

Accepter des fausses alertes n'est pas les ignorer. Trois disciplines encadrent ce choix.

- **On les compte.** Chaque escalade de niveau 4 produit une trace : mot déclencheur, langue, province, arbre utilisé, décision finale du relais ou du soignant. Une alerte close en « pas de signe de danger » est une donnée, pas un échec honteux.
- **On les explique au citoyen.** Le message d'urgence ne dit pas « votre enfant est en danger de mort ». Il dit d'aller maintenant au centre de santé le plus proche et de ne pas attendre. La différence compte pour la confiance : le service annonce une conduite à tenir, pas un pronostic.
- **On surveille la charge qu'elles créent.** Une file d'attente saturée de fausses alertes finit par masquer les vraies. C'est le risque principal de ce réglage, et il est suivi comme tel dans les indicateurs de file d'attente décrits dans l'article sur [l'escalade vers les relais communautaires](/blog/escalade-relais-communautaires).

Si le volume de fausses alertes devenait ingérable, la réponse ne serait pas d'abaisser le rappel. Elle serait de renforcer la première ligne humaine, ou de raffiner un mot précis dont la trace montre qu'il se déclenche à tort — par exemple un terme qui, dans une province donnée, désigne autre chose que ce que la liste suppose.

## Chaque escalade est relue par un humain

Aucune alerte de niveau 4 ne se referme toute seule. Elle ouvre un cas, dans une file identifiée par le rôle, la province et le territoire, avec une horloge de quinze minutes pour l'accusé de réception. Une revue humaine est également imposée dès le niveau 3, lorsqu'aucune source approuvée n'a pu être citée, lorsqu'une phrase interdite a été filtrée, ou lorsque la confiance est très basse sur une situation déjà sérieuse.

Cette revue produit deux choses. D'abord une décision : le relais confirme, corrige, ou requalifie le niveau — toujours avec un motif écrit. Ensuite une donnée d'apprentissage : chaque correction humaine alimente le rapport de performance de l'IA, arbre par arbre et langue par langue. C'est ainsi qu'une liste de mots cesse d'être une intuition d'ingénieur pour devenir un objet mesuré.

## Les limites que nous publions

- La **couverture par langue est inégale** : le français est le plus complet, le kikongo et le tshiluba les plus fragiles, et l'écart n'est pas comblé.
- Les **variantes régionales manquent**. Un mot courant au Kasaï peut être absent de la liste, un mot du Nord-Kivu peut y figurer sous une seule graphie.
- La **négation n'est pas traitée**, par choix assumé.
- Les **protocoles ne sont pas cliniquement approuvés** : ils portent tous la mention « en attente du comité de revue clinique », et le vocabulaire d'alerte suivra la même procédure de validation.
- Le service **n'est pas un service d'urgence**. Il ne remplace ni un agent de santé, ni un déplacement immédiat vers une structure de soins devant un signe de danger.

La détection automatique des signes de danger n'est pas la partie brillante d'un service d'IA vocale. C'est une liste de mots, écrite à la main, relue par des locuteurs natifs, testée à chaque déploiement. C'est aussi, très probablement, la partie qui sauve. Le reste de l'offre publique est décrit sur la [page des services du programme](/services).
