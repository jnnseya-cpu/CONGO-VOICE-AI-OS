---
slug: mode-degrade-securite-sans-reseau
title: "Mode dégradé : la sécurité survit à la panne"
description: "Le mode dégradé garantit que la détection des signes de danger, le message d'urgence et l'ouverture d'un cas continuent sans aucun fournisseur d'IA."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: continuité de service et chaîne de repli
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: validation des scripts d'urgence hors ligne
keywords: [mode dégradé, continuité sans fournisseur, détection hors ligne, file d'attente des messages, panne d'un modèle de langage]
entities: [signes de danger, script d'urgence, fournisseur d'IA, file hors ligne, travailleur de service, repli, cas ouvert]
tags: [Sécurité, Continuité, Hors ligne, Urgence, RDC]
imageAlt: "Chaîne de repli du service lorsque les fournisseurs d'intelligence artificielle sont indisponibles"
takeaways:
  - "Les signes de danger, le message d'urgence et l'ouverture d'un cas ne dépendent d'aucun fournisseur d'intelligence artificielle."
  - "Le vocabulaire d'alerte et les consignes d'urgence sont embarqués avec la page : ils s'affichent sans réseau, dans les cinq langues."
  - "Un message écrit hors ligne est conservé sur le téléphone et repart seul quand la connexion revient."
  - "Ce que la panne retire, c'est la conversation naturelle. Ce qu'elle ne retire jamais, c'est la décision de sécurité."
faq:
  - q: "Que fait le service si tous les fournisseurs d'intelligence artificielle sont en panne ?"
  - a: "Il continue de fonctionner en mode dégradé. La reconnaissance des signes de danger par mots-clés, le message d'urgence enregistré, l'orientation vers la structure de santé et l'ouverture d'un cas ne font appel à aucun modèle externe. L'usager perd la conversation libre et conserve la sécurité."
  - q: "Le téléphone peut-il détecter un signe de danger sans réseau ?"
  - a: "Oui. Le vocabulaire d'alerte dans les cinq langues et les consignes d'urgence sont livrés avec la page et stockés sur l'appareil. Si une personne écrit qu'un enfant convulse alors que la connexion est coupée, la consigne s'affiche immédiatement, sans attendre le réseau."
  - q: "Un message écrit hors ligne est-il perdu ?"
  - a: "Non. Il est conservé sur le téléphone et renvoyé automatiquement au retour du réseau. L'usager n'a pas à le retaper, et le service enregistre l'horodatage réel de sa rédaction en plus de celui de sa réception."
  - q: "Comment sait-on qu'une réponse a été produite en mode dégradé ?"
  - a: "Chaque interaction enregistre le mode dans lequel elle a été traitée et la raison du repli. Une réponse scriptée n'est pas présentée comme une réponse ordinaire : la trace existe pour l'audit, et le volume de replis est un indicateur suivi, pas une statistique cachée."
  - q: "Le mode dégradé est-il moins sûr que le mode normal ?"
  - a: "Il est moins riche, pas moins sûr. Il restreint le service à des textes relus et à des règles déterministes, ce qui réduit l'étendue de ce qu'il peut dire. C'est précisément la configuration dans laquelle le risque d'une réponse inventée est le plus faible."
sources:
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
  - url: "https://www.who.int/"
  - label: "Union internationale des télécommunications — mesurer le développement numérique"
  - url: "https://www.itu.int/"
related: [signes-de-danger-detection-automatique, garde-fous-ia-service-public, acces-sans-smartphone-ivr-ussd-sms]
---

La plupart des services d'intelligence artificielle ont un comportement commun en cas de panne : ils s'arrêtent. L'écran affiche un message d'indisponibilité, et l'usager revient plus tard. Pour un service de divertissement, c'est acceptable. Pour une mère qui décrit un enfant qui convulse, cela ne l'est pas. Le **mode dégradé** est la réponse d'ingénierie à cette asymétrie : ce dont dépend la sécurité d'une personne ne doit dépendre d'aucun fournisseur.

## Ce qui tombe, et ce qui ne tombe pas

Un service vocal repose sur une chaîne de dépendances externes : reconnaissance de la parole, modèle de langage, synthèse vocale, stockage des enregistrements. Chacune peut être en panne, saturée, bloquée par un quota ou simplement lente.

Le programme sépare donc explicitement deux ensembles de fonctions.

| Fonction | Dépend d'un fournisseur externe | Comportement en cas de panne |
|---|---|---|
| Reconnaissance des signes de danger | Non | Continue à l'identique |
| Message d'urgence dans les cinq langues | Non | Continue à l'identique |
| Orientation vers une structure de santé | Non | Continue à l'identique |
| Ouverture d'un cas et alerte à un agent | Non | Continue à l'identique |
| Transcription d'un message vocal | Oui | Le tour se poursuit, le service demande de répéter ou d'écrire |
| Réponse rédigée par un modèle | Oui | Remplacée par un texte relu et un menu |
| Réponse prononcée par une voix de synthèse | Oui | Le téléphone lit le texte avec sa propre voix |

La ligne de séparation n'est pas technique, elle est morale : tout ce dont la sécurité d'une personne dépend se trouve dans la première moitié du tableau.

## Pourquoi les règles déterministes passent avant le modèle

La reconnaissance des signes de danger repose sur des listes de formulations réellement entendues dans les cinq langues, et non sur l'interprétation d'un modèle. Ce choix est détaillé dans l'article sur la [détection automatique des signes de danger](/blog/signes-de-danger-detection-automatique), mais il prend tout son sens ici.

Une liste de mots a trois propriétés qu'aucun modèle ne peut offrir :

- **Elle ne tombe pas.** Elle s'exécute dans le même processus que le reste du service, sans appel réseau.
- **Elle ne change pas d'avis.** Le même énoncé produit le même résultat aujourd'hui et dans deux ans.
- **Elle est opposable.** Devant une commission, on montre la ligne exacte qui a déclenché l'alerte.

Le modèle intervient après, pour comprendre et expliquer. Il n'a jamais le droit de décider si une situation est grave. Quand il est absent, la décision de gravité est inchangée — seule l'explication disparaît.

## Le téléphone continue quand le réseau s'arrête

La panne la plus fréquente en zone rurale n'est pas celle d'un fournisseur d'intelligence artificielle : c'est l'absence de réseau. Le programme traite ce cas sur l'appareil lui-même.

Le vocabulaire d'alerte et les consignes d'urgence dans les cinq langues sont **embarqués avec la page**, et non récupérés depuis un serveur au moment utile. Concrètement, une personne qui écrit que son bébé ne tète plus, alors que la connexion est coupée, voit immédiatement la consigne d'urgence dans sa langue. Rien n'a été envoyé nulle part ; la réponse était déjà sur le téléphone.

Le message qu'elle a écrit, lui, n'est pas perdu : il est conservé sur l'appareil et renvoyé automatiquement quand le réseau revient. L'horodatage de rédaction est conservé en plus de celui de réception, ce qui évite qu'un message écrit à trois heures du matin apparaisse comme reçu à midi dans le dossier d'un agent de santé.

Cette conception rejoint la logique multicanale décrite dans l'article sur l'[accès sans smartphone](/blog/acces-sans-smartphone-ivr-ussd-sms) : la qualité du réseau à l'instant où quelqu'un parle ne doit pas décider de ce qu'il obtient.

## Quatre fournisseurs, et un dernier recours qui n'en est pas un

Le service n'est lié à aucun fournisseur unique. Pour chaque capacité, il existe une chaîne ordonnée, essayée dans l'ordre, avec un basculement automatique en cas d'échec.

1. **Compréhension et rédaction** : trois fournisseurs successifs, puis un fournisseur interne qui ne produit que des textes relus.
2. **Reconnaissance de la parole** : deux fournisseurs, dont un seul couvre les cinq langues.
3. **Synthèse vocale** : deux fournisseurs ; en leur absence, le téléphone lit la réponse avec sa propre voix.

Le dernier maillon mérite une précision, parce qu'il est souvent mal compris. Ce n'est pas un modèle de secours moins performant : c'est un composant qui ne fait aucune inférence. Il restitue des textes relus et applique les règles déterministes. Il est incapable d'inventer, ce qui est précisément la propriété recherchée quand plus rien d'autre ne fonctionne.

Cette indépendance a un effet secondaire que les institutions apprécient : l'ensemble de la plateforme reste exécutable sans aucune clé d'accès à un fournisseur, ce qui permet d'auditer, de former et de tester sans dépendre d'un tiers commercial ni exposer de données.

## Comment sait-on qu'un service dégradé l'est vraiment ?

C'est la question qui distingue un mécanisme d'une intention, et elle a une réponse vérifiable.

Chaque interaction enregistre le mode dans lequel elle a été traitée, la raison du repli, et la langue concernée. Trois conséquences :

- **Le repli est compté.** Un taux de repli qui augmente est un signal exploitable, pas une impression d'équipe.
- **Le repli est distinguable.** Une réponse scriptée n'est pas archivée comme une réponse ordinaire ; on peut rejouer l'historique et savoir ce que l'usager a réellement reçu.
- **Le repli est testé.** La suite de tests du programme coupe délibérément les fournisseurs et vérifie que la chaîne de sécurité continue de produire la même alerte, le même message et le même cas.

Ce dernier point est le plus important. Un comportement de repli qui n'est jamais exercé est un comportement supposé. Le seul moyen de savoir qu'un mode dégradé fonctionne est de l'exécuter régulièrement, pas de l'écrire dans un document d'architecture. Les règles de cette supervision figurent sur la [page sécurité et gouvernance](/gouvernance).

## La continuité comme exigence, et non comme promesse commerciale

Il existe une différence entre un service qui annonce une haute disponibilité et un service qui organise sa propre continuité sans fournisseur. Le premier achète un engagement contractuel à un tiers ; le second réduit le nombre de choses qui peuvent le faire taire.

Un contrat de disponibilité, si favorable soit-il, ne protège pas une mère qui parle à trois heures du matin. Il prévoit une compensation financière, ce qui n'a aucun rapport avec le problème. La continuité utile ici n'est pas juridique, elle est architecturale : elle consiste à s'assurer qu'aucune défaillance extérieure ne se trouve sur le chemin d'une décision de sécurité.

Cette exigence a dicté trois choix structurants, chacun coûteux :

- **La détection hors ligne** du vocabulaire d'alerte, livrée avec la page plutôt qu'appelée au moment utile.
- **La file d'attente des messages** sur l'appareil, qui conserve ce qui a été écrit et le renvoie seule, sans que l'usager ait à y penser.
- **Le fournisseur interne sans inférence**, incapable d'inventer, qui tient le service debout quand tous les autres sont absents.

Aucun de ces trois mécanismes n'améliore le service dans son fonctionnement normal. Ils ne se voient que les mauvais jours, ce qui explique qu'ils soient si rarement construits — et pourquoi ils distinguent un service public d'une démonstration.

## Comment éprouver ce comportement sans attendre la prochaine panne

Un partenaire qui veut vérifier cette propriété n'a pas besoin d'accès au code. Trois manipulations suffisent, et elles tiennent en quelques minutes.

1. **Mettre le téléphone en mode avion, puis écrire une phrase contenant un signe de danger.** La consigne d'urgence doit s'afficher immédiatement, dans la langue choisie, sans aucun échange réseau.
2. **Rétablir la connexion sans rien faire d'autre.** Le message écrit hors ligne doit partir seul, et apparaître dans l'historique avec son heure de rédaction.
3. **Demander à voir, côté administration, le mode de traitement d'une interaction.** Une réponse produite en repli doit être identifiable comme telle, avec la raison enregistrée.

Si ces trois comportements sont au rendez-vous, le mode dégradé est réel. S'ils ne le sont pas, aucune documentation d'architecture ne compensera leur absence le jour où un fournisseur cessera de répondre.

## Le cas réel qui a dicté cette architecture

Cette conception n'est pas théorique. Elle vient d'un incident du programme lui-même, et il vaut mieux le raconter que le taire.

Une mise en production a livré une image dans laquelle une bibliothèque de stockage était présente mais amputée d'une partie de ses dépendances. Rien ne le signalait au démarrage : le conteneur démarrait, les sondes de disponibilité passaient au vert, la page d'accueil s'affichait normalement. Mais l'enregistrement de la réponse parlée se trouvait sur le chemin de **chaque** interaction, y compris les questions écrites. Chaque tour échouait, dans les trois modules, et le citoyen recevait un message d'indisponibilité.

Deux leçons en ont été tirées, et toutes deux figurent aujourd'hui dans l'architecture.

La première : un échec d'enregistrement ne doit jamais faire échouer un tour. La réponse écrite est la réponse ; l'audio est une modalité supplémentaire dont la perte dégrade le service sans l'interrompre. Cette séparation a été introduite après coup, parce qu'elle ne s'était pas imposée d'elle-même.

La seconde : une sonde qui répond « prêt » ne dit rien de l'état du service rendu. Le programme distingue désormais deux questions — ce conteneur peut-il répondre à une requête, et le service est-il en état de recevoir des citoyens — et la seconde reste négative tant qu'un comité de revue n'est pas constitué et qu'aucun opérateur d'alerte n'est raccordé.

Un mode dégradé bien conçu n'est pas une prévision d'ingénieur prudent. C'est, le plus souvent, la trace d'une panne que quelqu'un a déjà vécue.

## Ce que le mode dégradé ne corrige pas

Trois limites à poser, parce qu'un repli bien conçu reste un repli.

- **La conversation disparaît.** L'usager est guidé par des menus et des textes relus. C'est utilisable, ce n'est pas équivalent.
- **La transcription vocale ne se remplace pas.** Si aucun fournisseur ne transcrit, le service demande de répéter ou d'écrire. Pour une personne qui ne sait pas lire, c'est une perte réelle, et le programme ne prétend pas la combler.
- **Rien de tout cela ne soigne.** Le service informe et oriente. Devant un signe de danger, la [conduite à tenir](/urgence) est de se rendre immédiatement à la structure de santé la plus proche, sans attendre une réponse.

L'engagement se résume donc à une phrase que l'on peut vérifier plutôt qu'à une promesse de disponibilité : quelle que soit la panne, **le service ne devient jamais silencieux devant un signe de danger**. Il peut cesser d'être intelligent ; il ne cesse pas d'être sûr. La couverture par langue et l'état réel du service sont publiés sur la [page des langues nationales](/langues-nationales).

## Pourquoi cette architecture coûte plus cher à construire

Il serait plus simple de considérer les fournisseurs comme acquis. La plupart des projets le font, et pour de bonnes raisons économiques : écrire deux fois le même parcours, une fois avec modèle et une fois sans, double une partie du travail et complique chaque évolution.

Le surcoût est réel et assumé, parce que l'alternative revient à faire reposer la sécurité d'un service public sur la disponibilité commerciale d'entreprises étrangères, dont aucune n'a d'engagement envers les usagers congolais. Une panne à Dublin ou une modification de quota ne devrait pas décider de ce qu'une femme entend lorsqu'elle décrit un enfant qui ne respire pas.

Les données de l'[Union internationale des télécommunications](https://www.itu.int/) rappellent par ailleurs que la connectivité en Afrique subsaharienne reste plus intermittente qu'ailleurs. Concevoir pour la panne n'y est pas une précaution d'ingénieur méticuleux : c'est la description du cas courant. Les protocoles cliniques dont dérivent les consignes d'urgence sont ceux de la [prise en charge intégrée des maladies de l'enfant publiée par l'Organisation mondiale de la santé](https://www.who.int/), ce qui permet de les restituer hors ligne sans avoir à les réinventer.
