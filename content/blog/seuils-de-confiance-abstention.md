---
slug: seuils-de-confiance-abstention
title: "Seuils de confiance : dire « je n'ai pas compris »"
description: "Deux seuils de confiance décident si le service répond, nuance sa réponse ou se tait : en dessous du second, il cesse de répondre et appelle un humain."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: politique de confiance et contrôle des affirmations
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: validation des seuils et des formules de repli
keywords: [seuils de confiance, affirmation non étayée, refus de répondre, abstention mesurée, promesse de guérison]
entities: [confiance, transcription, traduction, intention, citation, escalade, relais communautaire, bande de confiance]
tags: [Sécurité, Gouvernance, Confiance, Santé, RDC]
imageAlt: "Les trois bandes de confiance et ce que le service s'autorise à dire dans chacune"
takeaways:
  - "Trois bandes de confiance : au-dessus de 0,6 le service répond, entre 0,4 et 0,6 il nuance, en dessous de 0,4 il cesse de répondre et appelle un humain."
  - "La confiance n'est pas un chiffre unique : transcription, langue et traduction sont mesurées séparément, et la plus basse commande."
  - "Neuf règles bloquent les affirmations qu'un service public ne doit jamais produire : guérison garantie, rendement garanti, statistique sans source."
  - "Une affirmation bloquée ne fait pas échouer la réponse : elle la remplace par un texte relu et impose une relecture humaine."
faq:
  - q: "Pourquoi un service devrait-il refuser de répondre ?"
  - a: "Parce qu'une réponse produite sur une compréhension incertaine sera lue comme une réponse certaine. L'usager n'a aucun moyen de savoir que le service a mal entendu : le texte est bien formé et prononcé avec assurance. L'abstention est le seul signal honnête disponible, et elle est préférable à une orientation plausible fondée sur un malentendu."
  - q: "D'où vient le chiffre de confiance ?"
  - a: "De plusieurs mesures distinctes : la qualité de la transcription rapportée par le moteur vocal, la certitude sur la langue détectée, et la fiabilité de la traduction vers le français canonique. Elles ne sont pas moyennées : la plus basse commande, parce qu'une traduction sûre d'une phrase mal entendue reste un tour incertain."
  - q: "Que voit l'usager quand le service s'abstient ?"
  - a: "Il entend qu'il n'a pas été compris, il lui est proposé de répéter autrement ou de parler à une personne, et un relais communautaire est sollicité si la situation le justifie. L'écran indique « message peu clair » plutôt qu'un niveau de risque élevé, car l'incertitude porte sur la compréhension, pas sur la gravité."
  - q: "Qu'est-ce qu'une affirmation non étayée ?"
  - a: "Une phrase que le service n'a pas le droit de prononcer sans source : une guérison garantie, un rendement garanti, un pourcentage sans référence, un « selon une étude » sans étude. Neuf familles de règles les détectent dans la réponse rédigée, avant l'envoi. Certaines sont levées par une citation vérifiable, d'autres jamais."
  - q: "Le service peut-il se taire à tort et laisser quelqu'un sans réponse ?"
  - a: "Oui, et c'est le coût assumé. Une personne qui parle une langue mal reconnue rencontrera plus souvent l'abstention. La compensation n'est pas une réponse approximative : c'est l'escalade vers un humain, qui reste joignable dans tous les cas."
sources:
  - label: "Organisation mondiale de la santé — orientations éthiques sur l'intelligence artificielle en santé"
  - url: "https://www.who.int/publications/i/item/9789240029200"
  - label: "NIST — AI Risk Management Framework"
  - url: "https://www.nist.gov/itl/ai-risk-management-framework"
related: [garde-fous-ia-service-public, seuils-qualite-par-langue, escalade-relais-communautaires]
---

Le comportement le plus coûteux d'un service vocal n'est pas de se tromper : c'est de ne pas savoir qu'il s'est trompé. Un modèle de langage produit toujours une réponse, et il la produit avec le même aplomb qu'il ait parfaitement compris ou pas compris du tout. Les **seuils de confiance** du programme existent pour que cet aplomb ne soit pas transmis au citoyen.

## Trois bandes, et ce que le service s'autorise dans chacune

La confiance d'un tour de conversation est ramenée à un nombre entre zéro et un, puis comparée à deux seuils. Il en résulte trois régimes.

| Bande | Confiance | Ce que le service fait | Ce qu'il ne fait pas |
|---|---|---|---|
| Normale | ≥ 0,6 | Répond, explique, propose une conduite à tenir | — |
| Prudence | 0,4 à 0,6 | Répond, puis dit qu'il n'est pas certain d'avoir compris et propose un humain | Affirmer sans réserve |
| Scriptée | < 0,4 | Cesse de répondre sur le fond, délivre un texte relu, appelle un humain | Produire une orientation |

Le passage sous 0,4 est le point important. Le service ne produit pas une version atténuée de sa réponse : il **cesse de répondre sur le fond**. C'est la même logique que celle appliquée aux protocoles non signés dans l'article sur la [revue clinique](/blog/revue-clinique-protocoles-signes) — une réponse prudente reste une réponse, et elle sera reçue comme telle.

## Pourquoi un seul chiffre de confiance ne suffit pas

Un tour de conversation peut échouer à plusieurs endroits indépendants, et un score global les masque.

- **La transcription** peut être mauvaise alors que la langue est correctement identifiée.
- **La langue** peut être mal identifiée alors que l'audio était net — un cas fréquent quand une personne alterne entre deux langues dans la même phrase, comme le décrit l'article sur le [code-switching entre français et lingala](/blog/code-switching-francais-lingala).
- **La traduction** vers le français canonique peut être fidèle à une transcription qui, elle, était fausse.

Le programme mesure donc ces dimensions séparément et retient la plus basse plutôt que la moyenne. Une traduction sûre à 0,95 d'une phrase entendue à 0,2 donne un tour à 0,2, pas à 0,57. Faire la moyenne reviendrait à laisser une étape fiable compenser une étape défaillante, ce qui est exactement l'erreur à éviter.

## Un niveau de risque élevé ne veut pas dire la même chose qu'une compréhension faible

Un détail d'interface, corrigé après observation, mérite d'être raconté parce qu'il illustre la différence entre une règle juste et une communication juste.

Lorsqu'une question de santé était mal comprise, le service élevait le niveau de risque — ce qui est correct : un cas de santé incompris mérite un regard humain. Mais l'écran affichait « Niveau de risque : élevé » à côté de « Confiance 15 % ». Pour la personne, cela se lisait comme un jugement sur **sa santé**, alors que c'était un constat sur **notre écoute**.

Le service distingue désormais les deux. Quand seule l'incertitude de compréhension élève le niveau, l'écran affiche « message peu clair ». L'escalade vers un humain, elle, est inchangée : la règle de sécurité n'a pas été assouplie, seule sa formulation a cessé de mentir sur son objet.

Ce choix a une raison de fond : un signal d'alarme qui se déclenche pour une raison que l'usager ne peut pas comprendre perd sa crédibilité, et il la perd pour les cas où elle compte réellement.

## Neuf familles d'affirmations qu'un service public ne doit jamais produire

Les seuils de confiance portent sur la compréhension. Un second dispositif porte sur la sortie : ce que le service s'apprête à dire est inspecté avant l'envoi, phrase par phrase.

Neuf familles de règles sont appliquées selon le module concerné :

1. **Promesse de guérison** — « ce traitement guérit », « vous guérirez ».
2. **Certitude absolue** — « garanti », « sans aucun risque », « 100 % ».
3. **Affirmation de diagnostic** — « vous avez certainement… », « il s'agit sûrement de… ».
4. **Arrêt de traitement** — « arrêtez votre traitement », « ne prenez plus vos médicaments ».
5. **Preuve inventée** — « selon une étude », « d'après l'OMS », sans référence.
6. **Statistique sans source** — un pourcentage avancé sans citation.
7. **Rendement garanti** — « vous doublerez votre récolte », « bénéfice assuré ».
8. **Promesse de prix** — « le prix sera », « prix garanti ».
9. **Dose ou dilution sans source** — une quantité par litre ou par hectare sans référence.

Certaines de ces règles sont **levées par une citation vérifiable** : une statistique sourcée est légitime, une dose issue d'un protocole publié aussi. D'autres ne le sont jamais, quelle que soit la source : aucune citation n'autorise un service public à garantir une guérison.

## Que se passe-t-il quand une affirmation est bloquée ?

Le tour n'échoue pas. Le texte fautif est remplacé par une formulation relue, un motif est enregistré, et une **relecture humaine est imposée** sur ce cas. L'usager reçoit une réponse plus pauvre et sûre, plutôt qu'une réponse riche et interdite.

L'enregistrement du motif est ce qui transforme ce blocage en information exploitable. Un taux de blocage qui augmente sur une famille de règles indique que le modèle a changé de comportement, ou qu'une formulation de protocole l'induit en erreur. Ces traces alimentent le [journal d'audit](/blog/journal-audit-chaine-verifiable) et sont relues par le comité compétent.

## Ce que coûte l'abstention mesurée, et pourquoi elle reste le bon choix

Un refus de répondre n'est jamais neutre, et il serait malhonnête de présenter ce dispositif comme gratuit. Il a un coût direct et inégalement réparti.

- **Les locuteurs des langues les moins bien reconnues s'abstiennent plus souvent.** Le kikongo et le tshiluba rencontrent plus de refus que le français. L'inégalité de la technologie se transforme en inégalité d'accès au service.
- **Une personne pressée peut vivre l'abstention comme une panne.** « Je n'ai pas compris » répété trois fois est décourageant, et certaines personnes ne reviendront pas.
- **Le volume de réponses baisse**, ce qui est contre-intuitif pour un programme jugé sur son usage.

La contrepartie est qu'aucune de ces personnes ne reçoit d'orientation fondée sur un malentendu. Le [cadre de gestion des risques de l'intelligence artificielle du NIST](https://www.nist.gov/itl/ai-risk-management-framework) et les [orientations éthiques de l'Organisation mondiale de la santé](https://www.who.int/publications/i/item/9789240029200) convergent sur ce point : dans un usage à fort enjeu, la capacité d'un système à signaler son incertitude compte davantage que sa performance moyenne.

Et l'abstention n'est jamais un cul-de-sac. Elle débouche sur l'escalade décrite dans l'article sur les [relais communautaires](/blog/escalade-relais-communautaires) : un humain reste joignable, ce qui est précisément la raison pour laquelle le service peut se permettre de se taire.

## Comment ces seuils sont fixés, et pourquoi ils ne se règlent pas depuis un écran

Les deux valeurs — 0,6 et 0,4 — sont définies dans le code et couvertes par des tests. Elles ne sont pas modifiables depuis une interface d'administration.

Ce n'est pas une rigidité gratuite. Un seuil réglable est un seuil qui finira par être abaissé, un mardi, parce qu'une démonstration s'annonce mal ou qu'un indicateur d'usage stagne. Le rendre modifiable par du code force une revue, laisse un historique, et désigne un responsable.

Les mêmes principes gouvernent les [seuils de qualité par langue](/blog/seuils-qualite-par-langue), et pour la même raison : un garde-fou dont la barre se règle en production n'est pas un garde-fou, c'est un paramètre.

## Mesurer l'abstention plutôt que de la subir

Un service qui se tait doit savoir combien de fois il se tait, sinon l'abstention cesse d'être une décision pour devenir une panne silencieuse.

Chaque refus de répondre est donc enregistré avec sa cause : transcription trop incertaine, langue mal identifiée, traduction peu fiable, protocole non signé, affirmation bloquée. Quatre indicateurs en découlent, suivis par langue et par module.

- **Le taux d'abstention par langue.** S'il est dix fois plus élevé en tshiluba qu'en français, l'inégalité est chiffrée au lieu d'être supposée.
- **La cause dominante.** Une abstention due à la transcription appelle un travail sur le corpus vocal ; une abstention due à l'absence de protocole signé appelle une réunion du comité. Les deux se corrigent différemment.
- **Le devenir des cas escaladés.** Une abstention qui n'aboutit pas à une prise en charge humaine n'est pas une abstention prudente, c'est un abandon.
- **Le taux de retour des usagers éconduits.** C'est l'indicateur le plus sévère : il dit si les personnes à qui le service a dit « je n'ai pas compris » reviennent, ou s'il les a perdues.

Ce dernier chiffre est celui que le programme s'engage à publier même s'il est mauvais, parce qu'un service public qui ne mesure que son volume d'usage ne saura jamais qui il a découragé.

## Ce que ce dispositif change pour un relais communautaire

Du point de vue de l'agent de santé qui reçoit les escalades, la politique de confiance a un effet très concret : elle modifie la composition de ce qu'il reçoit.

Sans elle, un relais reçoit un flux mêlant des cas réels et des cas fabriqués par des malentendus, sans pouvoir les distinguer à la lecture. Il apprend alors, assez vite, à traiter l'ensemble avec moins d'attention — et le jour où une alerte réelle arrive, elle est noyée.

Avec elle, l'escalade porte une information de plus : le service dit s'il a compris ou non, et pourquoi il transmet. Un cas transmis pour incompréhension n'est pas présenté comme un cas transmis pour gravité. L'agent sait ce qu'il reçoit, ce qui est la condition pour qu'il continue de le lire.

## L'erreur de conception que cette politique évite

Il existe une manière très répandue de construire un service vocal, et elle consiste à traiter l'incertitude comme un problème d'affichage plutôt que comme un problème de décision.

Dans cette approche, le modèle répond toujours, et l'interface ajoute une mention — « réponse générée automatiquement », « vérifiez auprès d'un professionnel », un pourcentage de fiabilité dans un coin. La responsabilité est transférée à l'usager par voie d'avertissement.

Cette solution est confortable pour l'exploitant et inopérante pour la personne concernée, pour trois raisons.

1. **L'avertissement est lu une fois, la réponse est retenue.** Une mise en garde répétée à chaque message cesse d'être lue au bout de trois messages.
2. **Elle suppose une capacité de vérification.** Dire à quelqu'un de vérifier auprès d'un professionnel suppose qu'il en ait un à portée — ce qui, dans la zone visée par ce programme, est précisément ce qui manque.
3. **Elle est invérifiable.** Un pourcentage affiché sans conséquence sur le comportement du service n'est pas un garde-fou, c'est une décoration.

La politique décrite ici fait l'inverse : l'incertitude ne change pas la présentation de la réponse, elle change **ce que le service a le droit de dire**. En dessous du seuil, il n'y a pas de réponse à habiller d'un avertissement, parce qu'il n'y a pas de réponse.

## Ce que cette politique ne garantit pas

Trois limites, pour que le dispositif ne soit pas lu comme une promesse de fiabilité.

- **Une réponse confiante peut être fausse.** Les seuils filtrent l'incertitude mesurable, pas l'erreur assurée. C'est le rôle des protocoles signés et de la [supervision humaine](/gouvernance) de borner ce risque.
- **Les règles d'affirmation portent sur la forme.** Une phrase dangereuse formulée autrement passe. Elles réduisent une classe d'erreurs connue, elles ne couvrent pas l'imagination d'un modèle.
- **Rien de tout cela ne soigne.** Le service informe et oriente. Devant un signe de danger, la [conduite à tenir](/urgence) est de se rendre immédiatement à la structure de santé la plus proche.

La revendication du programme tient donc en une phrase mesurable, et non en une promesse : ce service connaît la limite de sa propre compréhension, et il la dit.
