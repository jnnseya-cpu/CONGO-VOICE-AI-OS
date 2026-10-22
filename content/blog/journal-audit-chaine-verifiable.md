---
slug: journal-audit-chaine-verifiable
title: "Journal d'audit : une chaîne qui détecte la retouche"
description: "Le journal d'audit chaîne chaque écriture par empreinte : modifier ou supprimer une ligne a posteriori casse la vérification de la journée entière."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: traçabilité et preuve
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des événements cliniques journalisés
keywords: [journal d'audit, chaîne d'empreintes, intégrité vérifiable, traçabilité des décisions, effacement des données personnelles]
entities: [empreinte, SHA-256, chaînage quotidien, horodatage, acteur, rôle, version de protocole, rejeu]
tags: [Gouvernance, Audit, Sécurité, Preuve, RDC]
imageAlt: "Chaînage des écritures du journal d'audit par empreinte, du premier enregistrement de la journée au dernier"
takeaways:
  - "Chaque écriture du journal porte l'empreinte de la précédente : retoucher une ligne casse la vérification de toute la journée."
  - "Tout est consigné : entrées, transcriptions, traductions, réponses, niveaux de risque, escalades, remplacements, échecs."
  - "Chaque réponse enregistre la version du protocole appliqué, ce qui permet de rejouer une décision des mois plus tard."
  - "Le journal protège aussi l'équipe : il rend démontrable ce que le service a fait, et pas seulement ce qu'on affirme qu'il a fait."
faq:
  - q: "En quoi un journal d'audit chaîné diffère-t-il d'un simple fichier de traces ?"
  - a: "Un fichier de traces ordinaire peut être modifié sans laisser de marque : une ligne gênante disparaît et rien ne le signale. Ici, chaque ligne contient l'empreinte de la précédente. Supprimer ou retoucher un enregistrement rompt la continuité, et la vérification de la journée échoue en désignant l'endroit. L'intégrité devient contrôlable au lieu d'être supposée."
  - q: "Cela signifie-t-il que les données ne peuvent jamais être effacées ?"
  - a: "Non, et la distinction est importante. Le droit à l'effacement s'applique aux données personnelles : le contenu identifiant est remplacé par un jeton irréversible dans toutes les tables qui le portaient. Ce qui demeure, c'est la trace qu'une décision a eu lieu, sans la personne. L'historique reste vérifiable, le citoyen n'y est plus identifiable."
  - q: "Qui peut consulter le journal d'audit ?"
  - a: "L'accès dépend du rôle et suit les mêmes règles que le reste de la plateforme. Un agent de santé voit ce qui relève de ses cas ; la consultation de l'historique complet est réservée aux rôles d'administration et de supervision, et cette consultation est elle-même journalisée."
  - q: "Que peut-on reconstituer exactement à partir du journal ?"
  - a: "L'énoncé reçu, la langue détectée, la traduction utilisée, le protocole et sa version, les règles déclenchées, le niveau de gravité retenu, la réponse délivrée, l'escalade et sa suite, les notifications émises, les remplacements humains et les échecs techniques — chacun horodaté, avec l'acteur et son rôle."
  - q: "Le journal ralentit-il le service ?"
  - a: "Le calcul d'empreinte est négligeable au regard d'un appel à un modèle de langage. Le coût réel est celui du stockage et de la discipline : il faut décider à l'avance de ce que l'on enregistre, parce qu'on ne peut pas reconstituer après coup ce qu'on n'a pas écrit."
sources:
  - label: "NIST — Secure Hash Standard (FIPS 180-4)"
  - url: "https://csrc.nist.gov/"
  - label: "Organisation mondiale de la santé — orientations éthiques sur l'intelligence artificielle en santé"
  - url: "https://www.who.int/publications/i/item/9789240029200"
related: [garde-fous-ia-service-public, revue-clinique-protocoles-signes, escalade-relais-communautaires]
---

Toute organisation qui exploite un service public finit par devoir répondre à une question posée après coup, souvent dans un contexte tendu : qu'a dit exactement le service à cette personne, ce jour-là, et pourquoi ? Les réponses habituelles sont décevantes — des traces partielles, des bases modifiées entre-temps, une capture d'écran. Le **journal d'audit** du programme est conçu pour que cette question ait une réponse opposable.

## Ce que le journal d'audit enregistre, et pourquoi la liste est si longue

La règle du programme est de tout consigner, et la liste mérite d'être détaillée parce que c'est son exhaustivité qui fait sa valeur.

- **L'entrée telle qu'elle est arrivée** : le message écrit ou le fait qu'un enregistrement vocal a été reçu, avec le canal utilisé.
- **Ce que la machine a cru entendre** : la transcription, la langue détectée, la confiance associée, et le verdict porté sur la transcription.
- **Ce qui a été compris** : l'intention retenue, le module choisi, la traduction vers le français canonique.
- **Ce qui a décidé** : le protocole appliqué et sa version, les règles déclenchées, le niveau de gravité.
- **Ce qui a été répondu** : le texte délivré, la langue, et le mode — réponse complète ou texte relu.
- **Ce qui a suivi** : l'escalade, le cas ouvert, les notifications émises, les accusés de réception, les remplacements décidés par un humain.
- **Ce qui a échoué** : les fournisseurs indisponibles, les replis, les transcriptions rejetées, les photos illisibles.

La dernière catégorie est celle que les systèmes omettent le plus souvent, et c'est la plus utile. Un service qui n'enregistre que ses succès produit une histoire flatteuse et inexploitable.

## Le chaînage par empreinte, expliqué sans jargon

Un journal ordinaire a une faiblesse simple : il suffit d'un accès à la base pour qu'une ligne gênante disparaisse, et rien ne le signale.

Le programme construit donc une chaîne d'empreintes. Chaque enregistrement contient une empreinte calculée à partir de **deux** choses : son propre contenu, et l'empreinte de l'enregistrement précédent. Les enregistrements d'une même journée forment ainsi une chaîne continue.

| Si quelqu'un… | Effet sur la chaîne | Ce que la vérification signale |
|---|---|---|
| Modifie le contenu d'une ligne | Son empreinte ne correspond plus à son contenu | La ligne exacte qui a changé |
| Supprime une ligne | Le maillon suivant pointe vers un absent | L'endroit de la rupture |
| Insère une ligne | Elle ne s'enchaîne pas avec ses voisines | La position de l'insertion |
| Modifie une ligne et recalcule son empreinte | Toutes les empreintes suivantes deviennent fausses | La rupture, et tout ce qui la suit |

La dernière ligne est celle qui compte. Pour retoucher proprement un enregistrement, il faudrait recalculer l'ensemble de la journée — une opération qui laisse elle-même des traces, et qui ne passe pas inaperçue dans un système sauvegardé. L'empreinte utilisée est une fonction standard documentée par le [NIST](https://csrc.nist.gov/), et non un mécanisme maison.

## Pourquoi chaîner par journée plutôt qu'en continu ?

Une chaîne unique depuis l'origine semble plus rigoureuse. En pratique, elle est fragile : un seul incident rend tout l'historique invérifiable, et plus rien n'est contrôlable ensuite.

Le programme chaîne donc **par journée civile**. Chaque jour démarre une chaîne qui part d'une valeur d'origine fixe, et se vérifie indépendamment des autres. Trois avantages concrets :

1. La vérification d'une journée précise est rapide, ce qui permet de contrôler régulièrement plutôt que jamais.
2. Un problème sur une journée n'invalide pas la preuve portée par les autres.
3. Une demande d'enquête porte presque toujours sur une période courte, qui correspond exactement à l'unité vérifiable.

## À quoi sert concrètement une décision rejouable

La traçabilité n'a d'intérêt que si elle permet de refaire le chemin. Prenons un cas réel de ce type de service : six mois après coup, une structure de santé conteste une orientation donnée à une patiente.

Le journal permet de répondre point par point : quelle phrase a été reçue, dans quelle langue, ce que la transcription en a fait, quel protocole et quelle version étaient en vigueur, quelles règles se sont déclenchées, quel niveau de gravité a été retenu, quel texte a été prononcé, si une alerte a été émise et si elle a été accusée.

Chacune de ces informations est datée et attachée à un acteur et à son rôle. C'est ce qui permet au programme d'affirmer, comme l'exige la [revue clinique](/blog/revue-clinique-protocoles-signes), que chaque réponse de santé est rattachable à un texte signé par des personnes nommées — et non à l'humeur d'un modèle à un instant donné.

## Le journal d'audit protège-t-il le citoyen ou l'institution ?

Les deux, et c'est ce qui rend le dispositif tenable dans la durée.

Il protège le citoyen parce qu'une décision le concernant ne peut pas être réécrite après coup. Un enregistrement défavorable à l'exploitant ne disparaît pas discrètement.

Il protège l'institution pour une raison symétrique et rarement dite : il rend **démontrable** ce que le service a fait. Face à une accusation infondée, la défense d'un programme public n'est pas une déclaration de bonne foi, c'est un historique vérifiable. L'absence de preuve ne profite jamais à l'exploitant d'un service de santé ; elle profite à celui qui conteste.

C'est aussi pour cette raison que les échecs sont consignés avec le même soin que les succès. Un journal qui ne contiendrait que des réussites perdrait précisément la crédibilité qui en fait une preuve.

## Effacement des données personnelles et intégrité vérifiable de l'historique

Ces deux exigences semblent s'opposer : comment effacer les données d'une personne sans rompre une chaîne conçue pour empêcher toute modification ?

Le programme les sépare. Ce qui est effacé, c'est **le contenu identifiant** : le numéro de téléphone, le nom, l'énoncé, la transcription, les enregistrements, remplacés dans toutes les tables qui les portaient par un jeton irréversible dérivé de l'identifiant du compte. Ce qui demeure, c'est **le fait** qu'une interaction a eu lieu, avec son horodatage, son niveau de gravité et ses suites.

L'historique reste donc vérifiable et la personne n'y est plus identifiable. Une statistique de santé publique conserve son sens ; un dossier individuel ne peut plus être reconstitué. Le détail de ce que le programme conserve, pendant combien de temps et à quelles conditions figure sur la [page de protection des données](/confidentialite).

## La traçabilité des décisions comme condition d'un financement public

Un programme financé par l'État et par des bailleurs se trouve dans une position particulière : il doit rendre compte à des gens qui n'étaient pas dans la salle, parfois des années après, et souvent à propos d'un cas précis plutôt que d'une moyenne.

La traçabilité des décisions change la nature de cette conversation. Sans elle, une revue de programme se déroule sur des agrégats — nombre d'interactions, taux d'escalade, satisfaction déclarée — qui ne permettent ni de confirmer ni d'infirmer une allégation individuelle. Avec elle, un auditeur peut demander à voir un cas, et le suivre de bout en bout.

Trois usages en découlent, qui n'ont rien de théorique :

1. **L'évaluation indépendante.** Un tiers peut échantillonner des interactions et juger la qualité des orientations sur pièces, sans dépendre de ce que l'exploitant veut bien montrer.
2. **L'enquête après incident.** Une plainte porte sur un cas daté ; la reconstitution est possible parce que la chaîne d'empreintes garantit que l'historique n'a pas bougé entre-temps.
3. **La mesure honnête de ce qui ne marche pas.** Les replis, les transcriptions rejetées et les alertes non accusées sont comptés, ce qui permet de corriger plutôt que de découvrir le problème par la presse.

C'est aussi ce qui permet au programme de publier des chiffres défavorables sans se mettre en danger : quand l'historique est vérifiable, reconnaître une faiblesse est moins risqué que la taire.

## Ce qu'un auditeur peut demander dès la première réunion

Pour un partenaire institutionnel, la valeur d'un journal d'audit se teste avec trois questions, et la qualité des réponses est immédiatement parlante.

- **« Montrez-moi une interaction complète, de l'énoncé reçu à la suite donnée. »** Si la réponse se limite à un identifiant et un horodatage, la traçabilité des décisions n'existe pas au niveau utile.
- **« Vérifiez devant moi l'intégrité d'une journée au hasard. »** La vérification doit être une opération courante, pas un développement à prévoir.
- **« Que s'est-il passé le jour où le service est tombé ? »** Un historique qui ne contient aucun échec est un historique incomplet, et c'est le signe le plus fiable qu'il a été écrit pour la démonstration.

## Pourquoi l'horodatage strictement croissant n'est pas un détail

Un point d'implémentation mérite d'être expliqué, parce qu'il illustre le genre de précaution que ce type de preuve exige.

Une chaîne ne se vérifie que si l'ordre des enregistrements est sans ambiguïté. Or deux écritures peuvent survenir dans la même milliseconde, et l'ordre renvoyé par une base de données n'est alors pas garanti. Si l'ordre change entre deux lectures, la vérification échoue alors que personne n'a rien modifié — une fausse alerte qui, répétée, finirait par faire ignorer les vraies.

Le programme garantit donc des instants strictement croissants à l'intérieur d'un processus, de sorte que l'ordre de la chaîne soit déterminé une fois pour toutes. C'est une ligne de code sans gloire, et c'est la différence entre un mécanisme de preuve utilisable et un mécanisme qui crie au loup.

Ce genre de détail est représentatif de l'ensemble : l'intégrité vérifiable ne tient pas à l'élégance de l'idée, mais au traitement des cas qui la mettent en défaut. Une chaîne qui échoue parfois sans raison n'est pas une preuve plus faible, c'est une preuve nulle, parce que personne ne la consultera plus.

## Ce que le journal d'audit ne prouve pas

Trois limites à poser, parce qu'un mécanisme de preuve mal compris devient un argument d'autorité.

- **Il ne prouve pas que la décision était bonne.** Il prouve qu'elle a été prise de telle manière, à partir de telle version d'un protocole. Juger la pertinence clinique reste le travail du comité de revue.
- **Il ne protège pas contre une erreur commise en amont.** Une règle mal écrite produit une alerte manquée parfaitement journalisée.
- **Il ne remplace pas un contrôle externe.** Une chaîne vérifiée par celui qui l'écrit vaut moins qu'une chaîne vérifiée par un tiers. Le programme publie donc la méthode, ce qui rend le contrôle possible par un auditeur indépendant.

Les [orientations éthiques de l'Organisation mondiale de la santé sur l'intelligence artificielle en santé](https://www.who.int/publications/i/item/9789240029200) insistent sur l'auditabilité comme condition de l'usage de ces systèmes auprès de populations vulnérables. Le journal est la traduction technique de cette exigence : non pas une promesse de bien faire, mais un dispositif qui rend le mal-faire détectable.

## Ce que cela impose comme discipline

Un dernier point, rarement mentionné parce qu'il n'est pas agréable : un journal exhaustif oblige à décider **à l'avance** de ce qu'on enregistre. On ne reconstitue pas après coup ce qu'on n'a pas écrit.

Cela force des arbitrages explicites — quelle granularité, quelle durée de conservation, quelles données sensibles, quel accès — et interdit la position confortable qui consiste à remettre ces questions à plus tard. Les règles retenues sont publiées sur la [page sécurité et gouvernance](/gouvernance) et, pour la partie qui concerne directement les usagers, sur la [page des conditions d'utilisation](/conditions).

La contrepartie est une propriété simple, et rare : à la question « qu'a dit le service, à qui, et sur quelle base ? », ce programme peut répondre autre chose que « nous pensons que ».
