---
slug: reconnaissance-vocale-lingala
title: "Reconnaissance vocale en lingala : obstacles et méthode"
description: "La reconnaissance vocale en lingala bute sur le ton, l'agglutination et les emprunts : ce que couvrent les modèles ouverts, comment adapter et comment évaluer."
lang: fr
category: Langues et parole
cluster: langues-peu-dotees
pillar: false
publishedAt: 2026-08-26
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: couche parole et évaluation des modèles
reviewer: Comité d'inclusion linguistique
reviewerRole: relecture par des locuteurs natifs du lingala
keywords: [reconnaissance vocale en lingala, taux d'erreur de mots en lingala, modèle multilingue de parole, corpus vocal lingala, audio de terrain 8 kHz, identification de la langue]
entities: [lingala, Kinshasa, Mbandaka, agglutination, ton lexical, taux d'erreur de mots, identification de la langue, corpus vocal, mode guidé, audio de terrain]
tags: [Langues, Reconnaissance vocale, Lingala, Corpus, RDC]
imageAlt: "Forme d'onde d'un appel en lingala annotée par segments, avec le score de confiance de chaque portion transcrite"
takeaways:
  - "Le lingala n'est pas une langue « presque servie » par les modèles multilingues : la couverture nominale existe, l'exactitude sur de l'audio de terrain reste à construire."
  - "Le taux d'erreur de mots pénalise durement une langue agglutinante : une seule syllabe fausse détruit un mot entier, d'où la mesure conjointe du taux d'erreur de caractères."
  - "Un corpus collecté uniquement à Kinshasa produit un modèle qui marche à Kinshasa : les quotas par province font partie de la méthode, pas du confort."
  - "Quand la confiance baisse, le service redemande sur le seul élément critique, puis passe la main à un humain — il ne devine pas."
faq:
  - q: "Les modèles multilingues ouverts reconnaissent-ils le lingala ?"
    a: "Ils l'annoncent dans leur couverture nominale, ce qui n'est pas la même chose qu'une exactitude utilisable sur un appel téléphonique compressé. Le programme traite ces modèles comme une base de départ à mesurer, jamais comme un acquis."
  - q: "Pourquoi mesurer le taux d'erreur de caractères en plus du taux d'erreur de mots ?"
    a: "Parce qu'un verbe lingala porte le sujet, le temps et parfois l'objet dans un seul mot. Une erreur sur un préfixe fait compter le mot entier comme faux, alors que le sens reste souvent récupérable. Le taux d'erreur de caractères montre la marge réelle."
  - q: "Le ton est-il transcrit dans le corpus du programme ?"
    a: "Non par défaut : les conventions de transcription suivent l'orthographe courante, sans marques tonales, et le lexique porte à part une indication de prononciation. Rendre le ton obligatoire ralentirait la relecture sans bénéfice démontré à ce stade."
  - q: "Que se passe-t-il si la transcription en lingala est trop incertaine ?"
    a: "Le service reformule ce qu'il a compris, pose une question fermée sur l'élément critique, et après deux tentatives oriente vers un humain. Si la langue repasse sous ses seuils, elle bascule en mode guidé avec des messages enregistrés."
  - q: "Faut-il un modèle spécifique au lingala de Kinshasa ?"
    a: "Cette question n'est pas tranchée. Le programme collecte séparément Kinshasa et l'Équateur pour pouvoir mesurer l'écart ; le choix entre un modèle unique et des variantes régionales sera pris sur ces mesures, pas avant."
sources:
  - label: "Meta AI — Massively Multilingual Speech, couverture de plus de mille langues"
    url: "https://ai.meta.com/blog/multilingual-model-speech-recognition/"
  - label: "OpenAI — Whisper, reconnaissance vocale multilingue"
    url: "https://openai.com/index/whisper/"
  - label: "Mozilla Common Voice — collecte ouverte de corpus vocaux sous consentement"
    url: "https://commonvoice.mozilla.org/"
  - label: "UNESCO — multilinguisme et langues dans l'espace numérique"
    url: "https://www.unesco.org/"
related: [ia-vocale-langues-congolaises, corpus-vocal-langues-nationales, code-switching-francais-lingala, voice-ai-digital-inclusion-drc, garde-fous-ia-service-public]
---

Brancher un modèle multilingue sur une ligne téléphonique ne suffit pas à obtenir une **reconnaissance vocale en lingala** utilisable par un service public. Le lingala est une langue à tons, largement écrite sans marques tonales, agglutinante, saturée d'emprunts au français, et parlée très différemment selon qu'on se trouve à Kinshasa ou à Mbandaka. Chacun de ces traits a une conséquence mesurable sur la sortie d'un modèle de parole. Ce texte décrit ce qui casse, ce que couvrent réellement les modèles ouverts, comment adapter un système avec un corpus local, comment l'évaluer sur de l'audio de terrain, et ce que le programme fait aujourd'hui quand la confiance est basse.

## Ce qui rend la reconnaissance vocale en lingala difficile

Les difficultés ne sont pas exotiques : elles sont structurelles, et elles se cumulent. Un modèle entraîné majoritairement sur des langues européennes écrites arrive avec des hypothèses implicites — un mot est court, la frontière entre deux mots est audible, l'orthographe note tout ce qui est distinctif — que le lingala ne valide pas.

### Le ton porte du sens, l'écriture courante ne le note pas

Le lingala oppose des hauteurs mélodiques qui peuvent distinguer des mots et des formes verbales. L'orthographe employée au quotidien — dans les messages, les affiches, les manuels — n'écrit presque jamais ces tons. Un corpus transcrit selon l'usage courant donne donc au modèle une cible partiellement ambiguë : deux énoncés acoustiquement différents s'écrivent pareil, et le modèle n'est jamais pénalisé pour avoir choisi le mauvais.

La conséquence pratique n'est pas dramatique pour un service d'orientation, parce que le contexte lève la plupart des ambiguïtés. Elle l'est davantage pour la synthèse vocale : une voix qui lit un texte sans ton produit une prosodie plate que des auditeurs natifs jugent sévèrement. C'est pourquoi le lexique du programme porte une indication de prononciation à côté du sens, séparément de la transcription : le ton est documenté là où il sert, sans alourdir la relecture de chaque échantillon.

### L'agglutination fait exploser le nombre de formes

Dans un verbe lingala, le sujet, le temps et parfois l'objet sont soudés à la racine dans un seul mot. « Nazali » et « azali » ne diffèrent que par le préfixe de personne, et pourtant l'un parle de moi et l'autre de mon enfant. Deux effets suivent.

D'abord, le vocabulaire apparent d'un corpus est immense : chaque racine engendre des dizaines de formes, dont beaucoup n'apparaissent qu'une ou deux fois. Un modèle qui travaille sur des mots entiers rencontre en permanence des formes inconnues ; il faut des unités sous-lexicales, apprises sur le corpus lui-même, pour que la couverture tienne.

Ensuite, la métrique ment. Le taux d'erreur de mots compte un mot comme faux dès qu'un seul caractère diffère. En lingala, se tromper de préfixe de personne ou d'un marqueur de temps détruit statistiquement un mot entier alors que le sens reste souvent récupérable — et, inversement, une confusion de préfixe peut changer le patient d'une consultation. Nous mesurons donc systématiquement le taux d'erreur de caractères à côté du taux d'erreur de mots, et surtout le rappel des entités qui décident : durée en jours, âge en mois, personne concernée, présence d'un signe de danger.

### Les emprunts au français ne sont pas des fautes

Le vocabulaire technique arrive en français à l'intérieur de la phrase : fièvre, tension, vaccin, engrais, division, examen. Un modèle qui traite l'énoncé comme monolingue a deux mauvaises options : forcer une graphie lingala approximative sur le mot français, ou basculer l'ensemble de l'hypothèse vers le français et détruire le reste. Les deux se voient en production. Le traitement correct passe par un étiquetage de langue au niveau de la portion d'énoncé, décrit dans notre article sur [le mélange français-lingala dans une même phrase](/blog/code-switching-francais-lingala).

### Kinshasa n'est pas Mbandaka

Le lingala de Kinshasa a simplifié une partie des accords de classe et absorbé massivement le français. Le lingala parlé plus haut sur le fleuve, du côté de Mbandaka et de l'Équateur, conserve des accords plus complets et un lexique différent. Ce n'est pas une nuance académique : un modèle nourri d'audio kinois est excellent à Kinshasa et médiocre en amont, exactement là où l'alternative au service vocal est la plus faible.

Il n'existe pas de solution technique à cela. Il existe une méthode de collecte : des quotas par province, une évaluation découpée par région, et le refus d'ouvrir une langue dans un module sur la foi d'une moyenne nationale. Le détail des seuils appliqués par langue figure sur [la page des langues nationales du programme](/langues-nationales).

## Que couvrent réellement les modèles multilingues ouverts ?

Il faut distinguer trois familles, et surtout distinguer la couverture annoncée de l'exactitude constatée.

| Famille de modèles | Ce qui est annoncé pour le lingala | Ce que cela vaut sur un appel réel | Usage retenu par le programme |
|---|---|---|---|
| Reconnaissance multilingue supervisée à grande échelle | Le lingala est absent ou marginal des langues bien servies | Sortie souvent aspirée vers le français ou le swahili | Base pour le français et pour l'identification de la langue |
| Modèles massivement multilingues issus d'apprentissage auto-supervisé | Couverture nominale très large, jusqu'à plus de mille langues | Utilisable après adaptation, très variable selon le dialecte | Point de départ pour l'adaptation par langue |
| Corpus communautaires ouverts | Quelques langues africaines bien dotées, les langues bantoues d'Afrique centrale peu | Trop peu d'heures pour entraîner seul | Modèle de gouvernance de la collecte, pas source de données |

Les travaux publiés par [Meta AI sur la reconnaissance vocale de plus de mille langues](https://ai.meta.com/blog/multilingual-model-speech-recognition/) et par [OpenAI avec le modèle Whisper](https://openai.com/index/whisper/) ont réellement déplacé la frontière : ils rendent crédible un point de départ pour une langue peu dotée, là où il fallait tout construire il y a cinq ans. Ils ne rendent pas un service public opérationnel. La couverture nominale d'une langue signifie qu'un jeton de langue existe et qu'un peu de données est passé par l'entraînement ; elle ne dit rien du comportement sur un appel de trente secondes, compressé, en présence de bruit, avec du code-switching et un vocabulaire médical.

Nous ne publions volontairement aucun taux d'erreur comparatif entre ces modèles en lingala. Nous n'avons pas de jeu d'évaluation public, reproductible et suffisamment large pour qu'un tel chiffre veuille dire quelque chose, et un chiffre non reproductible ne vaut rien pour un programme financé sur fonds publics. Ce que nous publions, ce sont les seuils qu'une langue doit franchir avant d'être ouverte, et la conduite tenue quand elle ne les franchit pas.

## Adapter un modèle avec un corpus local

L'adaptation ne commence pas par l'entraînement. Elle commence par des conventions écrites, avant la première heure collectée.

1. **Fixer les conventions de transcription.** Comment écrit-on un mot français à l'intérieur d'une phrase lingala ? Écrit-on les nombres en chiffres ou en lettres ? Note-t-on les hésitations, les reprises, les rires ? Sans réponse écrite, le désaccord entre relecteurs devient du bruit d'entraînement indiscernable d'une erreur du modèle.
2. **Collecter par quotas.** Province, genre, tranche d'âge, canal d'entrée, domaine — santé, agriculture, éducation. Un corpus déséquilibré produit un modèle déséquilibré, et le déséquilibre se voit d'abord sur les voix les moins représentées.
3. **Faire relire par des locuteurs natifs.** Chaque échantillon est validé, corrigé ou rejeté, avec l'auteur de la décision et l'horodatage. Les échantillons dont la confiance du système est basse, et ceux que le citoyen a signalés, passent en tête de file.
4. **Enrichir un lexique local.** Termes, sens en français, domaine, région, indication de prononciation. Ce lexique est la mémoire du service : noms de maladies, de plantes, d'outils, de gestes.
5. **Injecter avant de réentraîner.** Les exemples vérifiés et les entrées de lexique proches d'un nouveau message sont retrouvés et fournis au traitement à chaque demande. L'effet est immédiat, sans réentraînement, et il porte surtout sur la compréhension et la restitution.
6. **Exporter pour l'affinage.** Les paires audio et transcription vérifiées sont exportables comme jeu de données pour affiner un modèle de parole et une voix de synthèse. C'est le chemin vers une écoute de niveau natif ; à ce stade du programme, cet affinage est prévu et outillé, il n'a pas encore été réalisé.

Une remarque sur l'ordre : les points 1 à 5 améliorent le service dès la première semaine, le point 6 demande des mois. Un programme qui commence par le point 6 passe un an sans rien livrer.

## Comment évaluer la reconnaissance vocale en lingala sur le terrain

Un score obtenu sur des enregistrements de studio ne prédit pas le comportement sur un appel passé depuis un champ. L'évaluation se fait donc sur deux jeux distincts, et les résultats ne se moyennent jamais.

| Mesure | Ce qu'elle capture | Seuil d'ouverture retenu |
|---|---|---|
| Taux d'erreur de mots, audio propre | Qualité de base du modèle | 20 % maximum, 12 % en français |
| Taux d'erreur de mots, audio de terrain 8 kHz | Comportement réel en appel | 30 % maximum |
| Taux d'erreur de caractères | Marge récupérable sur une langue agglutinante | Suivi, sans seuil bloquant |
| Exactitude de l'intention | Rattachement au bon protocole | 90 % en santé, 85 % ailleurs |
| Rappel des situations d'urgence | Ce qui ne se négocie pas | 98 % minimum |
| Identification de la langue | Conditionne toute la suite | 95 % minimum |
| Intelligibilité de la voix de synthèse | Est-ce qu'on écoute jusqu'au bout | 3,8 sur 5 en écoute native |

Trois règles encadrent ces mesures. La première : le jeu d'évaluation est annoté séparément du corpus d'entraînement, par d'autres relecteurs, et jamais réutilisé pour améliorer un modèle. La deuxième : les résultats sont découpés par province, par genre et par tranche d'âge, parce qu'une moyenne nationale masque exactement les publics que le service prétend rejoindre. La troisième : le rappel des situations d'urgence prime sur tout le reste. Un modèle qui gagne deux points de taux d'erreur de mots en perdant un point de rappel d'urgence est refusé.

## Ce que le programme fait quand la confiance est basse

C'est la partie la plus importante, et la moins spectaculaire. Un service public n'a pas le droit de deviner.

- **La confiance est calculée par segment**, pas globalement. Un énoncé peut être sûr sur la durée des symptômes et incertain sur l'âge de l'enfant ; seul l'élément incertain est redemandé.
- **La reformulation précède la question.** Le service dit ce qu'il a compris, puis pose une question fermée sur le point critique. Une question fermée est beaucoup plus robuste qu'une question ouverte quand la transcription est mauvaise.
- **Deux tentatives, puis un humain.** Après deux échecs, la conversation est orientée vers un relais communautaire, un agent agricole ou un enseignant selon le module, avec l'audio d'origine et ce qui a été compris.
- **Sous le seuil, la langue bascule en mode guidé.** Messages enregistrés par des locuteurs natifs, navigation par touches, questions les plus fréquentes. Un menu simple qui fonctionne vaut mieux qu'une conversation qui comprend de travers.
- **La détection des signes de danger ne dépend pas du modèle.** Des listes de termes écrites dans les cinq langues — en lingala, des expressions comme « akoki kopema te » ou « makila » — sont appliquées sur la transcription avant tout appel à un modèle de langage. Si tous les fournisseurs sont indisponibles, la conduite à tenir en urgence reste diffusée.
- **Chaque incompréhension nourrit le corpus.** Un signalement du citoyen remet l'échantillon en tête de la file de relecture ; c'est le mécanisme décrit dans [le guide sur la construction d'un corpus vocal en langues nationales](/blog/corpus-vocal-langues-nationales).

## Reconnaissance vocale en lingala : ce qui reste ouvert

La qualité de la **reconnaissance vocale en lingala** progresse par la relecture, pas par les annonces. À ce stade :

- Aucun affinage de modèle de parole sur le corpus congolais n'a encore été réalisé ; l'export du jeu de données existe, l'entraînement reste à faire.
- Le choix entre un modèle unique pour le lingala et des variantes régionales n'est pas tranché ; il dépendra des écarts mesurés entre Kinshasa et l'Équateur.
- Les textes d'interface en lingala sont des versions de travail, en attente de validation par des linguistes de la langue.
- Les protocoles de santé portent la mention « en attente du comité de revue clinique » tant que ce comité n'est pas constitué.
- Aucun volume national n'est publié : les chiffres visibles proviennent de l'environnement de préparation du pilote et sont étiquetés comme tels.

Le fond de la méthode tient en une phrase : sur une langue peu dotée, la seule chose honnête à publier avant d'avoir des données est la règle qu'on s'impose quand on n'a pas compris. Le reste — les modèles, les seuils, les corpus — se mesure, se corrige et se remesure, ce que détaille [le guide complet sur l'IA vocale en langues congolaises](/blog/ia-vocale-langues-congolaises).
