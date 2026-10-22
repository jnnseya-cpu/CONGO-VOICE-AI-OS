---
slug: acces-sans-smartphone-ivr-ussd-sms
title: "Accès sans smartphone : un service sur cinq canaux"
description: "L'accès sans smartphone est la règle et non l'exception : le même service répond par appel vocal, USSD, SMS et WhatsApp, avec les mêmes garde-fous."
lang: fr
category: Accès et canaux
cluster: acces
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: couche de conversation multicanale
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des scripts vocaux et des menus d'urgence
keywords: [accès sans smartphone, serveur vocal interactif, USSD santé, SMS en langues nationales, interruption de la voix de synthèse]
entities: [IVR, USSD, SMS, WhatsApp, DTMF, barge-in, rappel sortant, file hors ligne, téléphone à touches]
tags: [Accès, Voix, Inclusion, Téléphonie, RDC]
imageAlt: "Comparaison des cinq canaux d'accès au service, du téléphone à touches à l'application web"
takeaways:
  - "Le même service de conversation répond sur cinq canaux : appel vocal, USSD, SMS, WhatsApp et application web."
  - "Sur un téléphone à touches, sans internet et sans savoir lire, le citoyen parle et écoute : rien d'autre n'est exigé de lui."
  - "Chaque canal déclare ses limites en code — longueur de message, nombre de choix, images possibles — et la réponse est composée pour ce canal."
  - "Les garde-fous ne varient pas d'un canal à l'autre : les mêmes signes de danger, la même escalade, le même enregistrement."
faq:
  - q: "Faut-il un smartphone ou internet pour utiliser le service ?"
  - a: "Non. L'accès sans smartphone est le cas prévu en premier. Un téléphone à touches suffit : l'usager appelle, parle dans sa langue, écoute la réponse. Le service fonctionne aussi par USSD et par SMS, qui ne consomment pas de données mobiles. L'application web existe, mais elle est le canal le moins contraignant, donc le moins prioritaire à concevoir."
  - q: "Que se passe-t-il si l'usager ne sait pas lire ?"
  - a: "Le canal vocal ne demande jamais de lire. La question est posée oralement, la réponse est prononcée, et les choix se font au clavier du téléphone ou à la voix. Les menus écrits de l'USSD et du SMS sont des compléments pour ceux qui lisent, pas le chemin principal."
  - q: "Peut-on interrompre la voix du service au lieu d'écouter le message entier ?"
  - a: "Oui. L'usager peut parler ou appuyer sur une touche pendant que le service parle : la lecture s'arrête immédiatement et la réponse est prise en compte. Sans cela, une personne qui connaît déjà le menu paierait la communication pour écouter un texte qu'elle n'écoute pas."
  - q: "Un SMS de 160 caractères peut-il porter une orientation de santé ?"
  - a: "Il porte l'essentiel : la conduite à tenir et l'invitation à se rendre dans une structure de santé. Le service compose pour la limite réelle du canal au lieu de tronquer un texte conçu pour un écran. Quand le message ne tient pas, il propose un rappel vocal plutôt que de couper une consigne en deux."
  - q: "Le coût de l'appel est-il à la charge du citoyen ?"
  - a: "Le programme est conçu pour un accès gratuit pour le citoyen, financé par l'État et les bailleurs. Les modalités dépendent des accords avec les opérateurs, et le rappel sortant existe précisément pour que l'appel soit porté par le service plutôt que par l'usager."
sources:
  - label: "Union internationale des télécommunications — mesurer le développement numérique, faits et chiffres"
  - url: "https://www.itu.int/"
  - label: "GSMA — The Mobile Economy Sub-Saharan Africa"
  - url: "https://www.gsma.com/"
related: [ia-vocale-langues-congolaises, escalade-relais-communautaires, voice-ai-digital-inclusion-drc]
---

La question qui décide de l'utilité d'un service public numérique en République démocratique du Congo n'est pas « l'interface est-elle bonne ? ». C'est « que possède la personne qui en a le plus besoin ? ». Souvent : un téléphone à touches, un forfait d'appel, pas de données mobiles, et une lecture hésitante. L'**accès sans smartphone** n'est donc pas un mode dégradé du service : c'est le cas qu'il faut traiter en premier, et les autres canaux s'y ajoutent.

## Cinq canaux, un seul service de conversation

Il aurait été plus simple de construire une application, puis de bricoler une passerelle SMS. Le programme fait l'inverse : un seul service de conversation, et cinq façons d'y entrer.

| Canal | Ce que l'usager doit posséder | Entrée | Réponse |
|---|---|---|---|
| Appel vocal | Un téléphone, même à touches | Parole et touches du clavier | Voix de synthèse |
| USSD | Un téléphone, même à touches | Menu numéroté | Texte court à l'écran |
| SMS | Un téléphone, même à touches | Texte libre | Texte court |
| WhatsApp | Un smartphone et des données | Parole, texte, photo, position | Texte, images |
| Application web | Un smartphone et des données | Parole, texte, photo | Texte et voix |

Ni l'USSD ni le SMS ne consomment de données mobiles. L'appel vocal non plus. Les trois canaux qui demandent le moins au citoyen sont donc ceux qui couvrent le plus de monde, et c'est sur eux que repose la promesse d'un service universel.

## Ce que chaque canal déclare pouvoir faire

Un canal n'est pas une simple différence d'habillage. Un SMS ne porte pas de bouton, un serveur vocal ne montre pas de photo, un écran USSD tient dans 160 caractères. Plutôt que de laisser ces écarts se découvrir à l'exécution, chaque canal déclare ses capacités dans le code, et la réponse est composée pour ces contraintes.

- **Longueur utile** : 400 caractères prononçables pour un appel vocal, 160 pour l'USSD, 459 pour un SMS concaténé, 4 096 pour WhatsApp.
- **Choix proposés** : jusqu'à neuf touches sur le clavier téléphonique et dans un menu USSD, trois boutons seulement sur WhatsApp.
- **Média accepté** : la photo d'une feuille malade est possible sur WhatsApp et sur le web, impossible par SMS ou par appel.
- **Réponse parlée** : systématique sur l'appel vocal, absente sur USSD et SMS, disponible à la demande sur le web.

La conséquence pratique est que le service ne tronque pas un texte conçu pour un écran : il **compose pour le canal**. Quand une consigne ne tient pas dans la limite, elle n'est pas coupée en deux ; le service propose un rappel vocal, qui lui n'a pas cette contrainte.

## Pourquoi l'interruption de la voix change tout sur un appel

Un détail technique décide de l'usage réel d'un serveur vocal : peut-on l'interrompre ? Sans cette possibilité, l'usager qui connaît déjà le menu reste à écouter un message qu'il ne veut pas entendre, sur une communication qu'il paie, au bout d'un réseau instable.

Le service accepte donc la parole et les touches **pendant** qu'il parle. La lecture s'arrête immédiatement et l'entrée est prise en compte. Pour quelqu'un qui appelle chaque semaine au sujet de la même culture, la différence entre dix secondes et quarante secondes par étape décide de son retour.

La même logique gouverne le rappel sortant : plutôt que d'exiger d'un citoyen qu'il rappelle et paie à nouveau, le service peut le rappeler, notamment lorsqu'un relais communautaire doit reprendre un cas. La chaîne complète est décrite dans l'article sur l'[escalade vers les relais communautaires](/blog/escalade-relais-communautaires).

## Les mêmes garde-fous, quel que soit le canal

Le risque d'une architecture multicanale est connu : un canal secondaire finit par recevoir une version simplifiée des règles, et la sécurité devient fonction de la porte d'entrée.

Le programme l'évite en plaçant les garde-fous dans le service de conversation, pas dans les canaux. Un signe de danger prononcé au téléphone, écrit en SMS ou envoyé sur WhatsApp déclenche la même chose :

1. La reconnaissance déterministe des [signes de danger](/blog/signes-de-danger-detection-automatique), avant tout appel à un modèle.
2. Le message d'urgence enregistré dans la langue de l'usager, et l'orientation immédiate décrite sur la [page des urgences](/urgence).
3. L'ouverture d'un cas et l'alerte à un agent humain.
4. L'enregistrement complet de l'échange, dont le canal utilisé, pour l'audit décrit sur la [page sécurité et gouvernance](/gouvernance).

Ce qui varie d'un canal à l'autre, c'est la forme : la longueur, la présence de boutons, la voix. Ce qui ne varie pas, c'est la décision de sécurité.

## L'écart entre couverture réseau et usage réel

Les données de l'[Union internationale des télécommunications](https://www.itu.int/) et de la [GSMA](https://www.gsma.com/) décrivent le même phénomène en Afrique subsaharienne : l'écart d'usage — la part de personnes couvertes par un réseau mobile mais qui n'utilisent pas l'internet mobile — est bien plus large que l'écart de couverture. Autrement dit, la contrainte dominante n'est plus l'absence d'antenne, mais le coût de l'appareil, le prix des données, l'alphabétisation et la langue.

C'est précisément l'angle mort que ce choix d'architecture vise. Une tour neuve améliore la couverture ; elle ne réduit pas, à elle seule, l'écart d'usage. Un service qui fonctionne par appel vocal dans la langue de la personne s'adresse à l'autre moitié du problème. C'est aussi pourquoi la question des langues est traitée comme une question d'accès et non de confort, sur la [page des langues nationales](/langues-nationales).

## Quand le réseau tombe au milieu d'une phrase

Un canal n'est pas fiable en continu, surtout en zone rurale. Deux mécanismes traitent ce cas, l'un côté téléphone, l'autre côté service.

- **Sur l'application**, ce que l'usager a dit ou écrit est conservé sur l'appareil. Si l'envoi échoue, le message n'est pas perdu : il repart quand le réseau revient. Et si le message contient un signe de danger, la consigne d'urgence s'affiche **hors ligne**, sans attendre le réseau, parce que le vocabulaire d'alerte et les scripts d'urgence sont embarqués avec la page.
- **Côté service**, une conversation interrompue n'est pas effacée. L'usager qui rappelle reprend là où il s'était arrêté plutôt que de recommencer le menu depuis le début, ce qui importe sur un canal facturé à la minute.

Ces deux comportements relèvent du même principe que le [mode dégradé](/gouvernance) appliqué à l'ensemble du système : ce dont dépend la sécurité d'une personne ne doit pas dépendre de la qualité du réseau à l'instant où elle parle.

## Concevoir pour la contrainte la plus dure, pas pour la moyenne

Une équipe produit conçoit spontanément pour l'appareil qu'elle a dans la main. C'est le biais le plus coûteux d'un service public : il produit une interface excellente pour une minorité et inutilisable pour la majorité qu'il prétend servir.

La règle appliquée ici inverse l'ordre de conception. On part du canal le plus contraint — l'appel vocal sur un téléphone à touches — et on vérifie que le parcours tient entièrement dedans. Ce n'est qu'ensuite que les canaux plus riches ajoutent la photo, les boutons, les textes longs. Un parcours qui ne tient pas dans un appel vocal n'est pas accepté comme parcours principal.

Trois conséquences concrètes, visibles dans le service :

- **Aucune étape obligatoire ne demande de lire.** La lecture est toujours un confort supplémentaire, jamais une condition.
- **Aucune réponse essentielle ne dépend d'une image.** La photo enrichit le diagnostic agricole ; elle n'est jamais la seule voie vers une orientation.
- **Aucun parcours ne suppose une connexion continue.** L'échange est conçu comme une suite d'allers-retours courts, chacun pouvant être le dernier.

Cette discipline est ce qui rend l'accès sans smartphone crédible plutôt que déclaratif. Un service qui ajoute un canal vocal après coup finit toujours par y transposer des logiques d'écran : des menus à douze entrées, des messages de quatre cents mots, des formulaires déguisés en questions.

## Qui sert-on réellement quand on ouvre un canal vocal ?

La question mérite d'être posée sans angélisme, parce que la réponse n'est pas « tout le monde ».

Un canal vocal en langue nationale sert d'abord la personne qui cumule les barrières : pas de smartphone, pas de données, pas de lecture courante, et une langue qui n'est pas le français. C'est aussi, en République démocratique du Congo, la personne la plus éloignée de toute structure de santé ou d'appui agricole. Les autres publics sont mieux servis par d'autres canaux, et le programme n'a aucun intérêt à prétendre le contraire.

Cela a une implication directe sur la mesure. Un service multicanal qui se juge au nombre total d'interactions se trompe de thermomètre : il est facile de faire du volume sur le canal web et de n'avoir rien changé pour personne. Les indicateurs utiles sont la part d'usage par canal, la part d'usage par langue, et le taux de retour des usagers venus par appel vocal. C'est cette répartition, et non le total, qui dit si l'accès sans smartphone fonctionne.

Le détail de ce que le programme mesure, et de ce qu'il publie, figure sur la [page du programme](/programme) et sur la [page de financement](/financement), parce qu'un financement public se juge à l'usage réel et non à la démonstration.

## Ce que l'on apprend en écoutant les appels plutôt que les écrans

Une dernière raison justifie l'effort : le canal vocal est le seul qui renvoie la langue telle qu'elle est parlée. Un formulaire web capte des mots-clés tapés ; un appel capte des hésitations, des alternances entre deux langues dans la même phrase, des tournures régionales, le bruit d'un marché.

Cette matière est précisément celle qui manque aux modèles de reconnaissance vocale pour les langues congolaises, comme l'explique l'article sur le [corpus vocal des langues nationales](/blog/corpus-vocal-langues-nationales). Un service conçu pour l'accès sans smartphone produit donc, comme effet secondaire, la donnée qui permettra à la génération suivante de mieux comprendre ces langues — à condition que les enregistrements soient recueillis avec le consentement des personnes et conservés sous une gouvernance publique.

## Ce qu'un partenaire devrait vérifier avant de financer un canal vocal

Trois vérifications séparent un service vocal réel d'une démonstration enregistrée, et elles se font en quelques minutes.

1. **Appeler depuis un téléphone à touches, pas depuis un smartphone en mode démonstration.** Si le parcours suppose un écran à un moment quelconque, l'accès sans smartphone n'existe pas.
2. **Interrompre la voix du service au milieu d'une phrase.** Si le message continue malgré la touche ou la parole, chaque appel coûtera à l'usager le temps d'écoute intégral, et les usagers réguliers cesseront d'appeler.
3. **Couper le réseau au milieu de l'échange, puis rappeler.** Si la conversation recommence au premier menu, le service n'est pas utilisable là où le réseau est instable, c'est-à-dire là où il est le plus utile.

Ces trois tests ne mesurent pas la qualité de l'intelligence artificielle. Ils mesurent si le service a été conçu pour la personne qu'il prétend servir, et ils se font sans aucune compétence technique.

## Ce que ce choix coûte, et ce qu'il n'apporte pas

Construire pour cinq canaux au lieu d'un coûte plus cher. Chaque canal a ses limites, sa passerelle, ses tests, ses modes de panne. Il est honnête d'en nommer le prix et les limites.

- **Un appel vocal reste plus lent qu'un écran.** Une personne alphabétisée disposant d'un smartphone sera toujours mieux servie par l'application web. Le programme ne prétend pas l'inverse.
- **L'USSD et le SMS ne portent pas de photo.** Le diagnostic d'une maladie de culture par image, décrit dans l'article sur la [mosaïque du manioc](/blog/mosaique-manioc-diagnostic-photo), n'existe pas sur ces canaux.
- **La qualité vocale dépend de la langue.** Le français est bien reconnu ; le kikongo et le tshiluba restent les plus fragiles, et cette inégalité se ressent davantage à l'oral qu'à l'écrit.
- **Rien de tout cela ne remplace un agent de santé.** Le service oriente et informe ; l'[orientation en cas d'urgence](/urgence) est toujours de se rendre immédiatement à la structure la plus proche.

La contrepartie est simple à énoncer : une femme de soixante ans, à deux heures de piste du centre de santé le plus proche, sans smartphone et sans lecture courante, peut poser une question sur son petit-fils malade et recevoir une orientation dans sa langue. Aucune application, si bien conçue soit-elle, ne l'atteint.
