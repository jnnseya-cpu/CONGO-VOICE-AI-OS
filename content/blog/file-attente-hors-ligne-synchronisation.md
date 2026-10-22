---
slug: file-attente-hors-ligne-synchronisation
title: "File d'attente hors ligne : parler sans réseau"
description: "La file d'attente hors ligne enregistre la question sur le téléphone, la rejoue dès le retour du réseau, et une clé d'idempotence garantit une seule interaction."
lang: fr
category: Produit et canaux
cluster: canaux
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: application citoyenne et résilience réseau
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture du comportement en cas de retard de réponse
keywords: [file d'attente hors ligne, clé d'idempotence, service worker, ordre des tours, badge de synchronisation]
entities: [file d'attente, service worker, clé d'idempotence, brouillon automatique, identifiant ordonné, rejeu, synchronisation]
tags: [Produit, Canaux, Architecture, Accessibilité, RDC]
imageAlt: "File d'attente de messages vocaux sur un téléphone sans réseau, rejoués automatiquement au retour de la connexion"
takeaways:
  - "Une question posée sans réseau est écrite sur le téléphone immédiatement, puis rejouée dès que la connexion revient."
  - "Chaque élément en attente porte sa propre clé d'idempotence : un rejeu ne peut jamais créer une seconde interaction."
  - "Les identifiants sont ordonnés dans le temps, donc l'ordre des tours de conversation est préservé au moment du rejeu."
  - "Quand l'onglet est fermé, c'est le service worker qui vide la file ; l'application n'a pas besoin d'être ouverte."
  - "Les canaux sans navigateur — USSD, appel vocal — utilisent un mécanisme différent : la réponse est produite après l'accusé de réception et livrée par message."
faq:
  - q: "Que se passe-t-il exactement si j'enregistre un message sans réseau ?"
  - a: "Le message est écrit dans la base locale du téléphone avec son identifiant, son horodatage et son statut en attente. Un compteur visible indique combien de messages attendent encore. Dès que le réseau revient, ils sont envoyés dans l'ordre où ils ont été créés, et chacun devient une interaction unique côté serveur."
  - q: "Un rejeu peut-il créer deux fois le même dossier ?"
  - a: "Non. Chaque élément en attente porte une clé d'idempotence qui est son propre identifiant. Le serveur exécute le travail une seule fois par clé et renvoie, pour tous les rejeux suivants, la réponse déjà enregistrée. C'est ce qui rend les nouvelles tentatives sûres, aussi nombreuses soient-elles."
  - q: "Faut-il garder l'application ouverte pour que la file se vide ?"
  - a: "Non. Si l'onglet est ouvert, l'application s'en charge ; sinon, le service worker enregistré pour la synchronisation en arrière-plan le fait au retour de la connectivité, sans intervention de la personne."
  - q: "Et si je perds mon téléphone avant la synchronisation ?"
  - a: "La question est perdue, et rien n'en est sorti. C'est le revers assumé d'une file locale : elle protège la confidentialité, puisque rien ne quitte l'appareil avant l'envoi, et elle n'offre aucune garantie de durabilité en cas de perte ou d'effacement des données du navigateur."
  - q: "Un signe de danger peut-il attendre dans la file ?"
  - a: "Oui, et c'est pourquoi l'application affiche la conduite à tenir immédiate sans attendre le réseau pour les situations d'urgence reconnues hors ligne. Une file d'attente ne doit jamais être le seul chemin devant un signe de danger : le message part pour la trace et pour l'escalade, l'instruction, elle, est affichée tout de suite."
sources:
  - label: "Union internationale des télécommunications — mesurer le développement numérique"
  - url: "https://www.itu.int/"
  - label: "GSMA — connectivité mobile en Afrique subsaharienne"
  - url: "https://www.gsma.com/"
related: [mode-degrade-securite-sans-reseau, acces-sans-smartphone-ivr-ussd-sms, orchestration-interaction-dix-etapes]
---

Dans une grande partie du territoire congolais, la connexion n'est pas absente : elle est intermittente. Elle disparaît au milieu d'un enregistrement, revient trois minutes plus tard, puis repart. Une application conçue pour une connexion stable transforme cette réalité en échec visible : un message qui ne part pas, une erreur, et une personne qui renonce. La **file d'attente hors ligne** existe pour que l'intermittence du réseau devienne un détail d'implémentation plutôt qu'un obstacle d'usage.

## Pourquoi la file d'attente vit sur le téléphone

Le choix structurant est de considérer que l'envoi n'est pas une étape de l'enregistrement, mais une opération séparée, qui arrivera plus tard et peut-être plusieurs fois.

Concrètement, une question vocale est écrite dans la base locale du navigateur dès qu'elle est enregistrée, avant toute tentative réseau. L'élément stocké contient son identifiant, la session, l'horodatage, le type d'entrée, les octets de l'audio ou de la photographie, un indice de langue, un indice de module, son statut, son nombre de tentatives et la dernière erreur rencontrée.

Cette façon de faire a trois conséquences immédiates.

- **L'interface ne mentit pas.** Le message est visiblement « en attente », avec un compteur, et non « envoyé » puis silencieusement perdu.
- **Les octets ne traversent pas le réseau deux fois pour rien.** Une tentative échouée ne détruit pas l'enregistrement : elle incrémente un compteur.
- **Rien ne quitte l'appareil avant l'envoi.** Un enregistrement en attente est, du point de vue de la confidentialité, un fichier local — ce qui est le comportement le plus prudent par défaut.

Les mesures de l'[Union internationale des télécommunications](https://www.itu.int/) et de la [GSMA](https://www.gsma.com/) sur la couverture et la qualité de service en Afrique subsaharienne décrivent le contexte : une couverture déclarée n'équivaut ni à un débit utilisable, ni à une continuité. Une application de service public doit donc traiter la perte de réseau comme l'état normal, pas comme une exception.

## Des identifiants ordonnés dans le temps

Un détail technique décide ici de la qualité de la conversation : l'identifiant de chaque élément en attente est un identifiant universel de version 7, dont les quarante-huit premiers bits sont un horodatage en gros-boutien. Autrement dit, l'ordre alphabétique des identifiants est l'ordre chronologique de création.

Pourquoi cela compte-t-il ? Parce qu'une conversation n'est pas un ensemble de messages, c'est une suite. Une personne qui décrit un symptôme, puis précise un âge, puis ajoute une durée, produit trois tours dont l'ordre porte le sens. Si la file les rejoue dans un ordre arbitraire — ce que fait n'importe quel traitement parallèle naïf — la conversation reconstituée côté serveur n'a plus de sens, et la réponse non plus.

L'**ordre des tours** est donc garanti par la structure de l'identifiant, et non par une colonne de tri que quelqu'un pourrait oublier de lire. La file est en outre indexée sur le statut et sur l'horodatage de création, ce qui permet d'afficher le **badge de synchronisation** — le nombre de tours qui attendent encore — sans parcourir toute la base locale.

| Statut | Signification | Ce que voit la personne |
|---|---|---|
| En attente | Enregistré localement, pas encore envoyé | Compteur de messages en attente |
| En cours d'envoi | Tentative réseau active | Indicateur d'activité |
| Envoyé | Accepté par le serveur, réponse reçue | La réponse du service |
| Échoué | Toutes les tentatives ont échoué | Message en attente, avec possibilité de réessayer |

Un élément en échec reste dans la file plutôt que de disparaître. Un service qui supprime ce qu'il n'a pas réussi à envoyer efface la preuve de sa propre défaillance.

## La clé d'idempotence : rejouer souvent, créer une fois

Rejouer une requête est facile ; garantir qu'un rejeu ne produise pas un doublon est la vraie difficulté. Sans protection, une file d'attente agressive crée deux dossiers de santé pour une même question, deux escalades, et deux alertes chez un agent déjà surchargé.

La protection est une **clé d'idempotence**, et elle est choisie de la manière la plus simple possible : c'est l'identifiant de l'élément en attente lui-même. Côté serveur, la règle est explicite.

1. Clé inconnue : elle est réservée, le travail est exécuté, et la réponse produite est enregistrée.
2. Clé connue, même contenu : la réponse enregistrée est renvoyée telle quelle, sans réexécuter quoi que ce soit.
3. Clé connue, travail encore en cours : un conflit est renvoyé, et l'appelant peut réessayer plus tard.
4. Clé connue, contenu différent : un conflit est renvoyé — c'est un bogue du client, pas un rejeu.

C'est ce mécanisme qui autorise la file à être têtue. Le service worker peut réessayer autant qu'il le souhaite, sur un réseau qui coupe au milieu de chaque requête, sans jamais créer un second dossier.

Une conséquence de confidentialité mérite d'être signalée, parce qu'elle a été découverte en relisant le code d'effacement : la réponse enregistrée pour une clé contient, pour une interaction, la transcription et la réponse complètes. Ces lignes sont donc traitées comme des données personnelles et supprimées lors d'une demande d'effacement, comme le détaille l'article sur la [protection des données personnelles](/blog/protection-donnees-personnelles). Un cache de rejeu est un endroit où les données personnelles se cachent très bien.

## Le service worker, et ce qu'il fait quand l'onglet est fermé

Tant que l'application est ouverte, c'est elle qui vide la file. Mais une personne qui enregistre une question dans une zone sans réseau ne va pas garder son navigateur ouvert jusqu'au retour de la connexion : elle range son téléphone.

C'est le rôle du **service worker**, enregistré avec une étiquette de synchronisation dédiée. Le navigateur le réveille lorsque la connectivité revient, il rejoue les éléments en attente et met à jour leur statut. L'application n'a pas besoin d'être au premier plan ; la personne n'a rien à faire.

Un point d'architecture discret rend cela possible : le module de file d'attente n'importe aucun code serveur. Il est écrit pour fonctionner à la fois dans la page et dans le contexte du service worker, qui n'a ni fenêtre, ni accès au reste de l'application. Un module qui mélange les deux mondes compile, s'exécute dans l'onglet, et échoue silencieusement là où il compte.

Cette capacité est déclarée par canal : seules l'application web progressive et l'application Android annoncent la synchronisation en arrière-plan. Le service ne suppose donc jamais qu'un canal peut rejouer du travail hors ligne ; il le demande à la table des capacités, décrite dans l'article sur l'[accès sans smartphone](/blog/acces-sans-smartphone-ivr-ussd-sms).

## Et les canaux qui n'ont pas de navigateur ?

Un serveur vocal interactif et une session USSD n'ont ni base locale, ni service worker. Ils ont une contrainte inverse et plus brutale : l'opérateur coupe la session après quelques secondes, et une interface de téléphonie doit accuser réception immédiatement.

La plateforme utilise donc un autre mécanisme pour ces canaux : la réponse est accusée tout de suite, le travail est lancé en arrière-plan, et la réponse réelle est livrée ensuite par message ou par appel sortant. Les tâches lancées de cette façon sont suivies, pour que les tests et un arrêt propre du serveur puissent les attendre au lieu de les perdre — un détail qui évite une classe entière de réponses jamais envoyées.

La différence entre les deux approches est instructive. Sur un téléphone intelligent, c'est le client qui retient le travail en attendant le réseau. Sur un téléphone à touches, c'est le serveur qui retient le travail en attendant un canal de retour. Dans les deux cas, l'interaction ne dépend pas de la coïncidence d'un bon réseau au bon moment.

## Ce que cette file change pour une personne, concrètement

Il est facile de décrire un mécanisme et de perdre de vue l'usage qu'il permet. Trois situations, parmi les plus courantes dans un centre de santé de zone rurale, montrent ce que la file d'attente hors ligne modifie réellement.

Une mère enregistre une question dans la cour de sa maison, sans réseau. Sans file, elle voit un message d'erreur et doit recommencer plus tard, c'est-à-dire souvent jamais : la charge mentale d'une question de santé ne se reporte pas facilement au lendemain. Avec la file, elle enregistre, range son téléphone, et reçoit la réponse quand elle passe à portée d'une antenne — sans avoir rien à refaire.

Un agent de santé communautaire saisit six comptes rendus de visite dans un village, en fin de tournée, loin de toute couverture. Sans file, il doit tout ressaisir au bureau, et une partie disparaît. Avec elle, les six tours partent dans l'ordre à son retour, chacun avec son horodatage de création et non celui de son envoi — ce qui change la lecture d'un suivi.

Un enseignant montre le service à une classe sur un seul téléphone partagé, avec un réseau saturé. Sans file, chaque question échoue au hasard et la démonstration tourne court. Avec elle, les questions s'empilent et se vident progressivement, et la démonstration porte sur le service plutôt que sur la qualité du réseau du jour.

Ces trois situations ont un point commun : aucune n'est un cas limite. Ce sont les conditions ordinaires d'usage du service, et c'est la raison pour laquelle cette mécanique est traitée comme une fonctionnalité centrale plutôt que comme une optimisation.

## Le brouillon automatique, une protection différente

À côté de la file, un autre mécanisme protège un cas voisin mais distinct : la question à demi écrite ou à demi dictée, que la personne n'a pas encore validée. Le **brouillon automatique** la conserve au fil de la saisie.

Ce n'est pas la même chose qu'un élément en attente. Un brouillon n'a pas été envoyé parce que la personne n'a pas fini ; un élément en attente a été validé et n'attend que le réseau. Les confondre produirait soit des envois non voulus, soit des pertes de saisie. Les brouillons sont d'ailleurs supprimés purement et simplement lors d'une demande d'effacement, parce qu'un brouillon est une phrase écrite par une personne et jamais destinée à être conservée.

## Ce que le mode hors ligne ne sauve pas

Quatre limites, à dire clairement.

- **Un téléphone perdu ou nettoyé perd sa file.** La base locale du navigateur peut être effacée par la personne, par le système, ou en navigation privée. La file d'attente hors ligne est une protection contre l'intermittence du réseau, pas une sauvegarde.
- **Une file longue n'est pas une bonne nouvelle.** Dix tours en attente signifient dix réponses non reçues. Le compteur est un indicateur d'exclusion à surveiller, pas une fonctionnalité à célébrer.
- **Les octets occupent de la place.** Des enregistrements audio accumulés sur un téléphone d'entrée de gamme peuvent saturer le stockage. La file est donc purgée des éléments envoyés, et la taille des médias est bornée avant l'enregistrement.
- **Une question en attente n'est pas une urgence prise en charge.** C'est la limite la plus importante : devant un signe de danger, l'application affiche immédiatement la [conduite à tenir](/urgence) et le comportement complet hors réseau est décrit dans l'article sur le [mode dégradé](/blog/mode-degrade-securite-sans-reseau). Le message partira pour la trace et pour l'escalade ; l'instruction, elle, ne doit jamais attendre le réseau.

Le reste de la chaîne — ce qui arrive au message une fois qu'il atteint le serveur — est décrit dans l'article sur l'[orchestration d'une interaction](/blog/orchestration-interaction-dix-etapes), et les moyens d'accéder au service sans application figurent sur la page [comment y accéder](/acces).
