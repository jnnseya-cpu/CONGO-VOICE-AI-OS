---
slug: revue-clinique-protocoles-signes
title: "Revue clinique : aucune réponse santé sans signature"
description: "La revue clinique conditionne chaque réponse de santé : sans signature d'un clinicien nommé sur un protocole versionné, le service refuse de répondre."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: couche de revue et de signature des protocoles
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: définition du quorum et des règles de signature
keywords: [revue clinique, protocole versionné, quorum de signature, supervision médicale IA, refus de répondre sans validation]
entities: [comité de revue clinique, protocole de triage, quorum, signature, version, siège, spécialité, journal d'audit]
tags: [Santé, Gouvernance, Sécurité, Confiance, RDC]
imageAlt: "Chaîne de validation d'un protocole de santé, du dépôt à la signature par le comité de revue clinique"
takeaways:
  - "Un protocole de santé non signé ne produit pas une réponse dégradée : il ne produit aucune réponse. Le service dit qu'il ne peut pas répondre et propose un humain."
  - "Le quorum est une règle de code, pas une appréciation : nombre de signatures, spécialités requises, sièges vacants — tout est vérifié à l'exécution."
  - "Chaque réponse porte le numéro de version du protocole appliqué, ce qui permet de rejouer une décision des mois plus tard."
  - "Le comité peut retirer une signature ; les réponses qui en dépendaient cessent immédiatement, sans redéploiement."
faq:
  - q: "Que se passe-t-il si le comité de revue clinique n'est pas encore constitué ?"
  - a: "Le service ne délivre pas de conseil clinique. Il reconnaît les signes de danger, affiche le message d'urgence enregistré, oriente vers la structure de santé la plus proche et ouvre un cas pour un agent humain. Autrement dit, la couche de sécurité fonctionne, la couche de conseil reste fermée. C'est la situation du programme aujourd'hui, et elle est affichée sur la sonde de santé du service plutôt que dissimulée."
  - q: "Pourquoi refuser de répondre plutôt que donner une réponse prudente ?"
  - a: "Parce qu'une réponse prudente reste une réponse. Elle sera lue comme un avis, répétée à un voisin, opposée à un agent de santé. Tant qu'aucun clinicien nommé n'a signé le texte exact que le service va prononcer, le programme considère qu'il n'a pas le droit de le prononcer. L'abstention est vérifiable ; la prudence ne l'est pas."
  - q: "Un modèle d'IA peut-il contourner un protocole non signé ?"
  - a: "Non, parce que le modèle n'est pas consulté sur ce point. La vérification du quorum s'exécute avant l'appel au modèle et conditionne la suite. Un modèle ne peut pas signer, ne peut pas lever un blocage et ne voit jamais la question de savoir si le protocole est valide."
  - q: "Comment sait-on quel protocole a produit une réponse donnée ?"
  - a: "Chaque interaction enregistre l'identifiant et la version du protocole appliqué, les règles déclenchées et le niveau de gravité retenu. Des mois plus tard, on peut retrouver la réponse exacte, le texte signé qui l'a produite et les personnes qui l'avaient signé."
  - q: "La revue clinique ralentit-elle la mise à jour des contenus ?"
  - a: "Oui, et c'est voulu. Un protocole de santé n'est pas un contenu éditorial. Le délai de signature est le prix de la responsabilité médicale ; la plateforme le rend visible plutôt que de le contourner."
sources:
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
  - url: "https://www.who.int/"
  - label: "Organisation mondiale de la santé — orientations éthiques sur l'intelligence artificielle en santé"
  - url: "https://www.who.int/publications/i/item/9789240029200"
related: [signes-de-danger-detection-automatique, garde-fous-ia-service-public, ia-triage-sante-communautaire]
---

Un service public de santé qui parle à des citoyens a un problème que les démonstrations ne montrent jamais : qui a autorisé la phrase exacte qu'il prononce ? Pas le modèle, qui n'autorise rien. Pas l'équipe technique, qui n'est pas qualifiée. La **revue clinique** est la réponse du programme à cette question, et elle est bâtie pour résister à la version la plus défavorable de la question, posée après un incident.

## Ce que la revue clinique conditionne exactement

Le service n'improvise pas de conseil de santé. Chaque orientation s'appuie sur un protocole : un texte structuré qui décrit les questions à poser, les règles de gravité, le niveau d'urgence retenu et la conduite à tenir. Ce protocole porte un identifiant et un numéro de version.

La règle tient en une phrase : **tant que la version en vigueur n'est pas signée selon le quorum requis, le service ne délivre pas de conseil appuyé sur elle.** Il ne délivre pas non plus une version atténuée. Il dit qu'il ne peut pas répondre, propose de parler à une personne, et ouvre un cas.

Ce refus n'est pas une politique écrite dans un document. C'est une vérification exécutée à chaque interaction, au même titre que la [détection des signes de danger](/blog/signes-de-danger-detection-automatique), et placée au même endroit de la chaîne : avant le modèle.

## Un quorum qui est une règle de code, pas une appréciation

« Validé par le comité » est une phrase qu'on peut écrire sans rien garantir. Le programme la remplace par un calcul.

| Élément vérifié | Ce que le code contrôle | Conséquence si la condition n'est pas remplie |
|---|---|---|
| Nombre de signatures | Le minimum défini pour ce type de protocole est atteint | Le protocole reste non applicable |
| Spécialités requises | Les sièges obligatoires sont couverts, pas seulement le nombre | Le protocole reste non applicable |
| Validité des sièges | La personne occupe toujours son siège au moment du contrôle | La signature cesse de compter |
| Version signée | La signature porte sur la version exacte en vigueur | Une version modifiée redevient non signée |
| Retrait | Une signature retirée est retirée immédiatement | Les réponses qui en dépendaient s'arrêtent |

Le dernier point est le plus important et le moins courant. Un comité qui découvre une erreur dans un protocole ne dépose pas un correctif en attendant un déploiement : il retire sa signature, et le service cesse dans l'instant de produire les réponses concernées. La sécurité ne dépend pas d'un cycle de mise en production.

## Pourquoi faire porter la signature sur une version, et non sur un document

Un protocole de santé change : un seuil est corrigé, une formulation est clarifiée, une langue est ajoutée. Si la signature portait sur « le protocole de triage pédiatrique », toute modification ultérieure hériterait d'une validation qui n'a jamais examiné le texte modifié.

Le programme fait donc porter la signature sur **une version précise**. Modifier le texte produit une nouvelle version, non signée, qui n'est pas appliquée tant que le comité ne l'a pas examinée. C'est contraignant, et c'est exactement l'intérêt : personne ne peut corriger discrètement une phrase clinique entre deux revues.

- La version appliquée est enregistrée sur chaque interaction, avec les règles déclenchées.
- Une réponse rendue il y a six mois peut être rejouée contre le texte qui l'a produite.
- Une divergence entre ce qui a été dit et ce qui était signé devient détectable, donc opposable.

Cette traçabilité rejoint ce que le programme applique à l'ensemble de la chaîne et qui est décrit sur la [page sécurité et gouvernance](/gouvernance).

## Qu'est-ce que le comité peut faire que l'équipe technique ne peut pas ?

Le partage est net, et il est inscrit dans les droits d'accès plutôt que dans un accord moral.

- **Le comité** signe, refuse, retire sa signature, exige une reformulation. Il décide de ce que le service a le droit de dire sur une situation clinique.
- **L'équipe technique** prépare, versionne, exécute et mesure. Elle ne peut ni signer, ni lever un blocage, ni publier un protocole non signé.
- **Le modèle de langage** n'intervient ni dans la signature, ni dans le contrôle du quorum. Il reformule et explique un contenu déjà autorisé ; il ne décide jamais de sa validité.

Cette séparation est la raison pour laquelle le programme peut affirmer que la responsabilité clinique appartient à des cliniciens. Dans beaucoup de services vocaux, cette responsabilité se dissout quelque part entre un prestataire, un modèle et une équipe produit. Ici, elle a des noms et des sièges.

## Ce que cela change pour une institution qui finance ou supervise

Un bailleur, un ministère ou un régulateur pose en général trois questions, et la revue clinique y répond avec des faits plutôt qu'avec des intentions.

1. **Qui est responsable du contenu médical ?** Des personnes nommées, occupant des sièges identifiés, dont la signature est vérifiable protocole par protocole.
2. **Que fait le service quand il n'est pas autorisé ?** Il s'abstient et escalade vers un humain, selon la chaîne décrite dans l'article sur l'[escalade vers les relais communautaires](/blog/escalade-relais-communautaires). Il ne produit pas une réponse de repli.
3. **Peut-on reconstituer une décision passée ?** Oui : version du protocole, règles déclenchées, niveau de gravité, langue, horodatage et suites données.

Les [orientations éthiques de l'Organisation mondiale de la santé sur l'intelligence artificielle en santé](https://www.who.int/publications/i/item/9789240029200) insistent sur la supervision humaine et la responsabilité identifiable. La revue clinique est la traduction de ces deux exigences en mécanisme exécutable, plutôt qu'en engagement déclaratif.

## Trois comités, des sièges nommés, une asymétrie voulue

Le programme ne compte pas un comité mais trois, un par module, parce qu'un agronome n'a pas à se prononcer sur un protocole pédiatrique.

| Comité | Module | Sièges requis pour un quorum | Revue périodique |
|---|---|---|---|
| Comité de Revue Clinique | Santé | 2 médecins et 1 expert en santé communautaire | Tous les 365 jours |
| Panel Agronomie | Agriculture | 2 agronomes | Tous les 365 jours |
| Panel Pédagogie | Éducation | 1 pédagogue et 1 référent protection de l'enfance | Tous les 365 jours |

Un quorum est **une composition, et non un nombre**. Trois agronomes enthousiastes n'approuvent pas un arbre de décision pédiatrique : tant que les sièges de médecin sont vacants, le protocole reste en attente, quel que soit le nombre de signatures recueillies ailleurs. Un siège non pourvu bloque, et la plateforme sait dire lesquels le sont.

L'asymétrie entre approuver et suspendre est tout aussi délibérée : **il faut un quorum pour approuver, il suffit d'une seule personne pour suspendre.** Un membre qui repère un danger n'a pas à convaincre ses pairs avant d'agir ; il suspend, le service s'arrête de répondre sur ce protocole, et la discussion a lieu ensuite. Dans le sens de la sécurité, une voix suffit.

La cadence de revue annuelle ferme la dernière porte : une signature n'est pas éternelle. Un protocole non réexaminé dans l'année cesse d'être considéré comme validé, ce qui évite la situation la plus commune dans les systèmes de santé numériques — un contenu approuvé une fois, en 2021, par des personnes qui ont changé de poste depuis.

## Corriger une erreur sans attendre une mise en production

Le cas qui révèle la valeur d'un mécanisme n'est pas le cas nominal, c'est l'incident. Supposons qu'un membre du comité relise un protocole déjà en service et constate qu'un seuil d'âge est mal formulé : le texte signé peut être lu comme autorisant une conduite inadaptée chez le nourrisson.

Dans un service ordinaire, la correction suit la chaîne habituelle : ticket, correctif, revue de code, déploiement. Entre le constat et l'effet, il s'écoule des heures ou des jours, pendant lesquels le service continue de dire la chose erronée.

Ici, la séquence est différente :

1. Le clinicien retire sa signature de la version concernée.
2. Le quorum n'est plus atteint à la vérification suivante, qui a lieu à l'interaction suivante.
3. Le service cesse de délivrer les conseils appuyés sur ce protocole et bascule sur l'abstention et l'escalade.
4. Le texte est corrigé, ce qui crée une nouvelle version, non signée.
5. Le comité examine la nouvelle version et la signe, ou non.

Aucune étape ne passe par un redéploiement. L'arrêt est immédiat parce qu'il est une conséquence de l'état des signatures, pas d'une modification du code. C'est la différence entre un garde-fou et une procédure : le premier agit, la seconde se suit.

## Pourquoi un protocole versionné plutôt qu'un modèle mieux entraîné

L'objection est fréquente et mérite une réponse directe : si le modèle est bon, pourquoi l'encadrer à ce point ? Parce que les deux approches ne répondent pas à la même question.

| Approche | Ce qu'elle optimise | Ce qu'elle ne peut pas fournir |
|---|---|---|
| Modèle entraîné sur de la donnée médicale | La qualité moyenne des réponses | Le nom de la personne qui répond de cette réponse-ci |
| Garde-fous ajoutés après coup | La détection des cas manifestement dangereux | La preuve qu'un énoncé donné était autorisé |
| Protocole versionné et signé | L'autorisation explicite d'un contenu précis | Une couverture spontanée des situations non prévues |

Le programme assume le troisième choix et sa limite. Un protocole ne couvre que ce qu'il couvre ; devant une situation hors protocole, le service ne brode pas : il le dit et escalade. Un service capable de parler de tout est un service dont personne ne peut garantir quoi que ce soit.

Ce raisonnement est le même que celui qui gouverne la [détection déterministe des signes de danger](/blog/signes-de-danger-detection-automatique) et l'[architecture de garde-fous](/blog/garde-fous-ia-service-public) : la partie du système dont dépend la sécurité d'une personne ne doit pas être la partie qui change toute seule.

## Ce que la revue clinique ne couvre pas

Trois limites, utiles à poser avant qu'un partenaire ne les découvre lui-même.

- **Elle ne relit pas chaque phrase prononcée.** Le comité signe un protocole et les scripts d'urgence, pas chaque reformulation produite à l'exécution. Ce que le modèle ajoute est contraint par le [contrôle des affirmations non étayées](/gouvernance), pas par une relecture humaine en direct.
- **Elle ne couvre pas l'agriculture et l'éducation.** Ces deux modules relèvent du Panel Agronomie et du Panel Pédagogie, avec leurs propres sièges et leur propre quorum, décrits sur la [page des services](/services). Le comité clinique ne se prononce que sur la santé.
- **Elle ne remplace pas un agent de santé.** Un protocole signé reste une orientation. La [conduite à tenir en cas d'urgence](/urgence) est de se rendre immédiatement à la structure la plus proche, sans attendre une réponse du service.

La [prise en charge intégrée des maladies de l'enfant, publiée par l'Organisation mondiale de la santé](https://www.who.int/), reste la référence dont les protocoles dérivent. Le programme n'invente pas de doctrine clinique : il encadre la restitution vocale d'une doctrine existante, dans des langues où elle n'était jusqu'ici pas disponible oralement.

## L'état réel aujourd'hui, sans embellissement

Le comité de revue clinique du programme **n'est pas encore constitué**. Les sièges sont définis, les règles de quorum sont implémentées et testées, la vérification s'exécute à chaque interaction — mais aucun protocole n'est signé à ce jour.

La conséquence est visible et assumée : le service ne délivre pas de conseil clinique. Il détecte les signes de danger, affiche le message d'urgence, oriente vers la structure la plus proche et ouvre un cas. La sonde de santé du service renvoie un état « non prêt » tant que cette condition n'est pas levée, aux côtés de l'absence d'opérateur d'alerte. Ce n'est pas une panne : c'est le mécanisme qui fonctionne.

Pour un partenaire, c'est précisément le point à retenir. La question utile n'est pas de savoir si une plateforme promet une supervision médicale, mais ce qu'elle fait **tant que cette supervision n'existe pas**. Celle-ci se tait. La marche à suivre pour les citoyens en attendant est publiée sur la [page des urgences](/urgence), et la couverture par langue sur la [page des langues nationales](/langues-nationales).
