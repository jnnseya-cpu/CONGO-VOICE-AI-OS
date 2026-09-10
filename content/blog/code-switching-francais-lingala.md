---
slug: code-switching-francais-lingala
title: "Code-switching français lingala : traiter la vraie parole"
description: "Le code-switching français lingala est la norme : étiquetage par portion d'énoncé, transcription d'origine conservée, forme française canonique et glossaire imposé."
lang: fr
category: Langues et parole
cluster: langues-peu-dotees
pillar: false
publishedAt: 2026-09-04
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: couche langue et normalisation des énoncés
reviewer: Comité d'inclusion linguistique
reviewerRole: relecture par des locuteurs natifs du lingala et du français
keywords: [code-switching français lingala, étiquetage de langue par portion, forme française canonique, glossaire imposé, identification de la langue dominante, transcription d'origine conservée]
entities: [code-switching, étiquetage de langue, forme canonique, glossaire médical, lingala, identification de la langue, portion d'énoncé, transcription d'origine, mode guidé]
tags: [Langues, Code-switching, Reconnaissance vocale, Sécurité, RDC]
imageAlt: "Énoncé mixte découpé en portions, chaque portion étiquetée français ou lingala avec sa probabilité"
takeaways:
  - "Demander « choisissez votre langue » au début d'un appel ne règle rien : la personne choisit une langue puis parle dans deux."
  - "L'unité d'étiquetage n'est pas le message mais la portion d'énoncé, avec une probabilité par portion."
  - "La transcription d'origine est conservée telle quelle ; la forme française canonique sert au traitement, à l'audit et à la lecture par un humain — elle ne la remplace pas."
  - "La détection des signes de danger travaille sur la transcription brute, avant traduction et avant tout appel à un modèle, précisément parce que l'étiquette de langue peut être fausse."
faq:
  - q: "Pourquoi ne pas simplement demander à l'utilisateur de choisir sa langue ?"
    a: "Parce que le choix ne tient pas au-delà de la première phrase. Une personne sélectionne « lingala », puis dit une durée en français et un terme médical en français. Le menu de langue reste utile pour la voix de réponse et le mode guidé, pas comme filtre d'entrée."
  - q: "Qu'est-ce qu'une portion d'énoncé ?"
    a: "Un segment continu de parole assez court pour porter une seule langue : un groupe de mots, souvent une proposition. Chaque portion reçoit une étiquette de langue et une probabilité, au lieu d'une étiquette unique pour tout le message."
  - q: "Pourquoi garder la transcription d'origine si elle est traduite ?"
    a: "Parce qu'une traduction est une interprétation. Un relecteur natif, un agent de terrain ou un auditeur doit pouvoir revenir à ce qui a réellement été dit, mot pour mot, notamment quand une décision d'escalade est contestée."
  - q: "Le service répond-il dans la langue mélangée de l'utilisateur ?"
    a: "Il répond dans la langue dominante détectée, en gardant en français, entre parenthèses, les termes médicaux ou techniques qui n'ont pas d'équivalent courant. Imiter le mélange exact de l'interlocuteur n'apporte rien et introduit du risque."
  - q: "Le mélange des langues dégrade-t-il la détection des urgences ?"
    a: "C'est le risque principal, et c'est pourquoi la détection ne dépend pas de l'étiquette de langue. Les listes de termes d'alerte couvrent les cinq langues et le français simultanément, et sont appliquées sur la transcription brute."
sources:
  - label: "OpenAI — Whisper, reconnaissance vocale multilingue"
    url: "https://openai.com/index/whisper/"
  - label: "Meta AI — Massively Multilingual Speech, couverture de plus de mille langues"
    url: "https://ai.meta.com/blog/multilingual-model-speech-recognition/"
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
    url: "https://www.who.int/"
  - label: "Mozilla Common Voice — collecte ouverte de corpus vocaux sous consentement"
    url: "https://commonvoice.mozilla.org/"
related: [ia-vocale-langues-congolaises, reconnaissance-vocale-lingala, corpus-vocal-langues-nationales, voice-ai-digital-inclusion-drc, signes-de-danger-detection-automatique]
---

« Mwana na ngai azali na fièvre banda mikolo mibale. » Cette phrase, ordinaire à Kinshasa, contient du lingala, un mot français au milieu, et une durée exprimée dans la langue que la personne a sous la main. Un service public vocal qui traite cet énoncé comme monolingue se trompe dès la première étape. Ce texte décrit comment le programme traite le mélange des langues sans le corriger : ce qui échoue quand on force un choix, comment étiqueter la langue portion par portion, pourquoi conserver la transcription d'origine à côté d'une forme française canonique, comment contraindre la restitution par un glossaire, et ce que tout cela change pour une consigne de sécurité.

## Pourquoi le code-switching français lingala est la norme, pas l'exception

Le mélange n'est pas un accident de parole ni un signe de maîtrise imparfaite. C'est le registre normal d'une grande partie du pays, avec une répartition assez régulière des rôles : la trame de la phrase en langue nationale, les termes techniques, scolaires, administratifs et médicaux en français, les nombres et les dates dans l'une ou l'autre selon l'habitude.

Trois conséquences en découlent pour un système.

- **Un menu de langue à l'entrée ne filtre rien.** La personne choisit « lingala », puis prononce « fièvre », « tension », « division », « examen ». Le choix décrit une préférence de réponse, pas la composition de l'énoncé.
- **L'identification de la langue au niveau du message est instable.** Un même appel peut basculer d'une étiquette à l'autre selon la portion écoutée. Une étiquette unique avec une confiance moyenne est une information de mauvaise qualité présentée comme certaine.
- **Corriger le mélange détruit de l'information.** Normaliser « fièvre » en une graphie lingala approximative, ou basculer toute l'hypothèse vers le français, fait perdre soit le terme médical, soit le reste de la phrase.

Un service qui exige de choisir une langue avant de parler exclut la manière normale de s'exprimer de millions de personnes. Le menu par touches reste utile — pour la langue de la voix de réponse, pour le mode guidé, pour les personnes qui préfèrent naviguer plutôt que parler — mais il n'est jamais une condition d'entrée.

## Étiqueter la langue au niveau de la portion d'énoncé

L'unité de travail n'est donc pas le message, mais la portion : un segment continu de parole assez court pour porter une seule langue, en pratique un groupe de mots ou une proposition. Chaque portion reçoit une étiquette et une probabilité. Le message, lui, porte une **langue dominante** et la liste des autres langues présentes.

| Approche | Ce qu'elle produit sur l'exemple d'ouverture | Ce qu'elle coûte |
|---|---|---|
| Étiquette unique par message | « lingala », confiance moyenne, « fièvre » transcrit de travers | Perte du terme médical, extraction d'entités bruitée |
| Bascule vers le français | Une phrase française approximative, le reste effacé | Perte du sens principal, orientation faussée |
| Étiquetage par portion | Trois portions : lingala, français, lingala, chacune avec sa probabilité | Traitement plus complexe, traces plus lourdes |

Le coût de la troisième approche est réel : plus de champs à stocker, plus de cas à tester, une interface de relecture plus riche. Le bénéfice l'est aussi : l'extraction des entités qui décident — durée en jours, âge en mois, personne concernée — devient beaucoup plus fiable quand le terme est reconnu dans la langue où il a été prononcé. Les modèles ouverts de reconnaissance vocale, comme [le modèle Whisper publié par OpenAI](https://openai.com/index/whisper/) ou [les travaux de Meta AI sur la parole massivement multilingue](https://ai.meta.com/blog/multilingual-model-speech-recognition/), donnent un point de départ pour l'identification de la langue ; ils ne fournissent pas d'eux-mêmes cette granularité, qui relève de la manière dont le service découpe et enregistre.

Deux règles pratiques encadrent l'étiquetage. La première : une portion dont la probabilité est basse est signalée comme telle, pas arrondie vers la langue dominante. La seconde : l'étiquette n'est jamais utilisée comme filtre de sécurité, pour la raison développée plus bas.

Une troisième règle relève de la convention d'écriture plutôt que du modèle. Avant la première heure de collecte, il faut décider comment se transcrit un mot français prononcé à l'intérieur d'une phrase en langue nationale : orthographe française d'origine, ou graphie phonétique locale. Le programme retient l'orthographe française, avec l'étiquette de portion pour marquer le changement de langue. Ce choix est arbitraire au sens strict, mais il doit être écrit et appliqué par tous les relecteurs : sans convention commune, le désaccord entre annotateurs se transforme en bruit d'apprentissage impossible à distinguer d'une erreur du système. La même question se pose pour les nombres, les dates et les noms de lieux, et elle reçoit la même réponse : une règle écrite, une seule, appliquée partout.

## Conserver la transcription d'origine à côté de la forme française canonique

Le français est la langue pivot du service : les protocoles, les documents approuvés, les règles de sécurité et les journaux d'audit sont écrits en français. Tout message est donc rendu sous une **forme française canonique**, utilisée pour le raisonnement métier, la lecture par un agent de terrain et la vérification a posteriori.

Cette forme canonique ne remplace pas la transcription d'origine. Les deux sont stockées ensemble, avec la langue de chaque portion, la confiance, la province, le module et l'horodatage. Les raisons sont concrètes.

1. **Une traduction est une interprétation.** Quand une escalade est contestée, ce qui compte est ce que la personne a dit, pas ce que le système en a compris.
2. **La relecture ne peut pas travailler sur une traduction.** Un relecteur natif corrige trois choses distinctes : la transcription, le sens en français, et la langue reconnue. Confondre ces trois erreurs dans un seul champ rend le corpus inexploitable pour l'apprentissage, comme l'explique le guide sur [la constitution d'un corpus vocal en langues nationales](/blog/corpus-vocal-langues-nationales).
3. **Les termes locaux ne survivent qu'à l'original.** Les noms de maladies, de plantes, de gestes et de symptômes alimentent le lexique. Une traduction lissée les efface.
4. **L'audit exige la source.** Un service public doit pouvoir montrer l'enchaînement complet : audio, transcription d'origine, étiquettes, forme française, décision, action.

## Rendre la réponse avec un glossaire imposé

En sortie, le mouvement est inverse : une réponse écrite en français simple est rendue dans la langue dominante de la personne, prête à être lue à voix haute. Trois contraintes s'appliquent.

- **Les termes sans équivalent courant restent en français, entre parenthèses.** Inventer un néologisme médical dans une langue peu dotée est un risque de sécurité, pas une prouesse linguistique.
- **Le glossaire est imposé, pas suggéré.** Les termes médicaux et agricoles vérifiés par les relecteurs sont fournis à chaque restitution, avec leur sens et leur prononciation. Le rendu suit le glossaire ; il ne le réinvente pas à chaque appel.
- **Les textes critiques ne sont jamais traduits par une machine.** Message d'urgence, avertissement de non-substitution, consignes pendant le trajet vers un centre de santé, menus vocaux : ce sont des textes fixes, rédigés et relus dans les cinq langues, puis figés. Ils sont prononcés à l'identique quel que soit l'état des fournisseurs. La [conduite à tenir devant un signe de danger](/urgence) en fait partie.

Le service ne cherche pas à imiter le mélange exact de son interlocuteur. Répondre dans la langue dominante, avec les termes techniques en français entre parenthèses, est plus clair et plus vérifiable qu'une imitation stylistique dont personne ne saurait mesurer la justesse.

## Qu'est-ce que le code-switching français lingala change pour une consigne critique ?

C'est ici que le sujet cesse d'être linguistique. Une consigne de sécurité — reconnaître un signe de danger, dire d'aller immédiatement au centre de santé, refuser de donner une dose — ne peut pas dépendre d'une étiquette de langue qui a une chance sur vingt d'être fausse.

Le programme applique donc quatre règles.

1. **La détection travaille sur la transcription brute.** Les listes de termes d'alerte couvrent le français et les quatre langues nationales simultanément, avec leurs variantes parlées. Un énoncé mixte est balayé par toutes les listes à la fois ; aucune étiquette de langue n'est utilisée pour choisir la liste.
2. **La détection précède le modèle.** Elle s'exécute avant tout appel à un modèle de langage. Si tous les fournisseurs sont indisponibles, la détection et le script d'urgence fonctionnent encore. Le mécanisme est détaillé dans l'article sur [la détection automatique des signes de danger](/blog/signes-de-danger-detection-automatique).
3. **Le silence n'est jamais un « non ».** Une portion non comprise est marquée non comprise. L'absence d'un signe de danger dans une phrase à moitié transcrite n'autorise aucune conclusion rassurante.
4. **Aucune dose, aucun diagnostic, quelle que soit la langue.** Les protocoles suivis s'appuient sur les référentiels de prise en charge diffusés par [l'Organisation mondiale de la santé](https://www.who.int/) et portent la mention « en attente du comité de revue clinique » tant que ce comité n'est pas constitué.

Formulé autrement : le mélange des langues est traité comme une richesse à comprendre en entrée, et comme un risque à neutraliser en sortie. Ce sont deux régimes différents appliqués au même énoncé.

## Mesurer le code-switching français lingala, pas seulement la langue dominante

Un tableau de bord qui n'affiche que l'exactitude de l'identification de la langue passe à côté du sujet. Les mesures suivies sont plus précises.

| Mesure | Ce qu'elle révèle | Pourquoi elle existe |
|---|---|---|
| Part d'énoncés contenant au moins deux langues | L'ampleur réelle du phénomène par province et par module | Cadre le dimensionnement du corpus |
| Exactitude de l'étiquetage par portion | Qualité du découpage, pas seulement de l'étiquette globale | Une portion mal étiquetée casse l'extraction |
| Rappel des entités sur énoncés mixtes | Durée, âge, personne concernée, quand la phrase mélange | C'est ce qui décide de l'orientation |
| Rappel des situations d'urgence sur énoncés mixtes | Le seuil qui ne se négocie pas, mesuré sur le cas difficile | Un faux négatif y est inacceptable |
| Part de reformulations acceptées du premier coup | Utilité réelle de la question de vérification | Distingue « incompris » de « mal reformulé » |

Ces mesures sont découpées par langue, par province et par canal, et le jeu d'évaluation est annoté séparément du corpus d'entraînement. Les seuils appliqués avant l'ouverture d'une langue dans un module sont publiés sur [la page des langues nationales](/langues-nationales) ; la manière dont ils sont établis pour le lingala est détaillée dans l'article consacré à [la reconnaissance vocale en lingala](/blog/reconnaissance-vocale-lingala).

## Ce que nous ne savons pas encore faire

Le sujet est loin d'être clos, et les limites suivantes sont assumées :

- L'étiquetage par portion est plus fiable sur les frontières nettes — un mot français isolé dans une phrase lingala — que sur les alternances rapides à l'intérieur d'un groupe verbal.
- Le mélange français-kikongo et français-tshiluba est beaucoup moins bien traité que le mélange avec le lingala, faute de corpus relu ; ces langues restent les moins dotées du service.
- Aucune mesure publiée ne compare le service à une référence externe sur des énoncés mixtes : il n'existe pas, à notre connaissance, de jeu d'évaluation public et comparable pour ces paires de langues.
- Les textes d'interface dans les quatre langues nationales sont des versions de travail, en attente de validation par des linguistes de chaque langue.

Le principe qui tient tout l'édifice est simple, et c'est celui que développe [le guide complet sur l'IA vocale en langues congolaises](/blog/ia-vocale-langues-congolaises) : on adapte le système à la façon dont les gens parlent, jamais l'inverse — et quand le système n'est pas sûr d'avoir compris, il le dit et passe la main.
