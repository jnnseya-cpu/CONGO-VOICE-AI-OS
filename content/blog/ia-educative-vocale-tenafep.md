---
slug: ia-educative-vocale-tenafep
title: "Révision vocale pour le TENAFEP : apprendre en parlant"
description: "La révision vocale pour le TENAFEP en zone rurale : boucle enseigner-vérifier-adapter, quiz oraux corrigés au barème, répétition espacée et règles de protection."
lang: fr
category: Éducation
cluster: education-vocale
pillar: true
publishedAt: 2026-09-05
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: architecture du module éducation
reviewer: Comité de protection de l'enfance et d'éducation (en cours de constitution)
reviewerRole: relecture des filtres enfants et des résumés destinés aux parents
keywords: [révision vocale pour le TENAFEP, quiz oral corrigé automatiquement, répétition espacée pour élèves, devoirs avec indices avant réponse, mode parent sans transcription]
entities: [TENAFEP, quiz oral, répétition espacée, programme national, mode parent, protection de l'enfance, objectif pédagogique, apprentissage vocal, élève rural]
tags: [Éducation, TENAFEP, Apprentissage vocal, Protection de l'enfance, RDC]
imageAlt: "Élève révisant à voix haute au téléphone, avec la boucle enseigner, vérifier puis adapter"
takeaways:
  - "Un élève rural peut réviser à voix haute depuis un téléphone simple, sans manuel, sans connexion continue et sans savoir lire couramment."
  - "Le quiz oral est corrigé par des règles : normalisation de la réponse parlée, tolérance numérique, puis rapprochement avec les erreurs typiques déclarées."
  - "Devant un travail noté, le service donne des indices et un exemple résolu voisin, jamais la réponse tant que l'élève n'a pas essayé."
  - "Le résumé destiné au parent ne reprend jamais les mots exacts de l'enfant, et une divulgation grave interrompt la leçon au lieu de la poursuivre."
faq:
  - q: "Le service peut-il remplacer l'école ou l'enseignant ?"
  - a: "Non. Il complète le travail de la classe : il fait réviser, il vérifie une notion, il propose un plan avant l'examen. Il ne délivre aucun diplôme, ne note pas officiellement et ne remplace ni l'enseignant ni le programme national. Le mode enseignant sert justement à rendre visibles les points faibles d'une zone, pas à corriger des copies."
  - q: "Comment le service sait-il en quelle classe est l'élève ?"
  - a: "Il le demande. Le niveau, l'âge et la langue d'explication sont confirmés par l'élève ou par l'adulte qui l'accompagne, jamais déduits de la voix. Tant que le profil n'est pas confirmé, le service enseigne à un niveau prudent, pose les questions de confirmation et abaisse lui-même sa confiance."
  - q: "Est-ce que le service donne les réponses des devoirs ?"
  - a: "Pas avant une tentative. Lorsqu'un travail noté est détecté et qu'aucun essai n'a été fait, la réponse finale est retenue : l'élève reçoit des indices du plus léger au plus fort, puis un exemple résolu portant sur un exercice semblable et non sur le sien. Après sa tentative, la correction complète arrive avec le critère de réussite."
  - q: "Qu'est-ce que le parent voit exactement ?"
  - a: "Un point d'étape : matières travaillées, points forts, points à retravailler, activités à faire à la maison et un encouragement. Aucune phrase reprenant les mots exacts de l'enfant n'y figure, et aucune étiquette durable n'est posée sur lui. Les finalités et les durées de conservation sont décrites dans la page de protection des données."
  - q: "Que se passe-t-il si un enfant révèle une situation grave pendant une séance ?"
  - a: "La leçon s'arrête. Une réponse écrite à l'avance est lue : elle croit l'enfant, ne promet pas le secret, ne demande aucun détail et indique vers qui se tourner. Un dossier à accès restreint est ouvert pour une personne formée à la protection, et rien de descriptif ne circule dans les notifications ordinaires."
sources:
  - label: "UNESCO — éducation et apprentissage fondamental"
  - url: "https://www.unesco.org/"
  - label: "UNICEF — éducation des enfants en République Démocratique du Congo"
  - url: "https://www.unicef.org/"
  - label: "Banque mondiale — pauvreté des apprentissages et acquis scolaires"
  - url: "https://www.worldbank.org/"
related: [ia-vocale-langues-congolaises, ia-triage-sante-communautaire, garde-fous-ia-service-public]
---

Dans beaucoup d'écoles rurales de la République Démocratique du Congo, un manuel est partagé entre plusieurs élèves, l'électricité s'arrête à la tombée du jour et la personne qui pourrait faire réciter la leçon n'a pas elle-même terminé le primaire. C'est dans ce contexte que la **révision vocale pour le TENAFEP** prend son sens : un élève de sixième primaire parle à un téléphone simple, on lui pose des questions, on l'écoute, on corrige, on revient quelques jours plus tard sur ce qu'il n'a pas retenu. Ce texte décrit comment ce module est construit, et surtout ce qu'il refuse de faire.

## Réviser à voix haute quand il n'y a ni manuel ni électricité

Trois contraintes de terrain ont décidé de l'architecture bien plus que les préférences pédagogiques.

- **La voix d'abord.** Un élève qui déchiffre lentement ne révisera pas en lisant un écran. Il révise en parlant et en écoutant, dans la langue où il comprend le mieux — français, lingala, kikongo, kiswahili ou tshiluba.
- **Des séances courtes.** Une explication parlée est plafonnée à quatre-vingt-dix secondes, soit environ deux cent vingt-cinq mots. Au-delà, la personne décroche, la batterie descend et le crédit s'épuise.
- **Des canaux modestes.** L'appel vocal, le message WhatsApp et l'USSD sont des points d'entrée de plein droit, décrits sur la [page des moyens d'accès au service](/acces). Rien n'exige un téléphone récent.

Le module est rattaché au programme national : chaque séance est accrochée à un objectif codé du curriculum, avec sa classe, sa matière, ses prérequis et son poids dans les examens nationaux. C'est ce rattachement qui permet de dire « cet élève travaille les fractions de quatrième primaire », plutôt que de porter un jugement sur l'élève lui-même.

| Matière | Objectif de fin de primaire | Ce que le service fait vérifier |
|---|---|---|
| Mathématiques | Proportionnalité et pourcentage | Résoudre un problème simple, calculer un pourcentage |
| Mathématiques | Nombres décimaux | Lire, comparer et additionner des décimaux |
| Mathématiques | Périmètre et aire | Calculer sur un rectangle et un carré |
| Français | Futur simple et accord sujet-verbe | Conjuguer et accorder à l'oral |
| Français | Rédaction courte | Construire dix lignes avec introduction et conclusion |
| Sciences | Alimentation et santé | Composer un repas équilibré avec des aliments locaux |
| Histoire-géographie | Géographie et histoire de la RDC | Situer provinces, fleuves et grandes étapes |

## La boucle enseigner, vérifier, adapter

Une séance ne se termine pas sur une explication. Elle suit une boucle en trois temps, répétée jusqu'à ce que la notion tienne.

1. **Enseigner.** Une micro-explication, un exemple ancré dans la vie locale — un champ, un marché, un trajet — puis une tentative guidée où l'élève est accompagné pas à pas.
2. **Vérifier.** Une tentative autonome, ou un court quiz oral. C'est le seul moment qui produit une donnée d'apprentissage.
3. **Adapter.** Selon le résultat, le service revient sur le prérequis manquant, propose une variante, ou passe à la suite et programme une révision espacée.

Deux règles encadrent cette boucle. D'abord, **le profil de l'élève est confirmé, jamais deviné**. Le niveau, l'âge et la langue d'explication sont demandés ; tant qu'ils ne sont pas confirmés, le service enseigne à un niveau intermédiaire prudent et plafonne lui-même sa confiance. Ensuite, **la trace enregistrée décrit un moment, pas un enfant** : « tentative sur les fractions, réussie avec aide, le 14 mai », et non « élève faible en mathématiques ». La différence est essentielle pour un service public qui parle à des mineurs.

## Comment un quiz oral est-il corrigé sans que la machine tranche à l'aveugle ?

La génération des questions est un travail de modèle ; la correction n'en est pas un. Une réponse orale passe par une chaîne déterministe, testée, qui donne toujours le même verdict pour la même réponse.

### La normalisation d'une réponse parlée

Un élève ne répond pas « 0,5 ». Il répond « euh, je pense que ça fait la moitié, madame ». La normalisation retire les accents, les hésitations et les formules de politesse, convertit les nombres écrits en lettres, transforme les fractions dites en toutes lettres — « la moitié » devient un demi, « trois sur quatre » devient trois quarts — et remplace la virgule décimale par un point quand elle sépare deux chiffres.

La comparaison est ensuite tolérante là où il le faut : deux fractions équivalentes sont acceptées comme égales, un écart numérique de un pour cent est admis, et une bonne réponse noyée dans une phrase plus longue est reconnue. Un élève n'est jamais sanctionné pour la forme de sa parole.

### Le barème et les erreurs typiques

Chaque question porte trois éléments écrits à l'avance : la réponse attendue, un critère de réussite, et une liste d'erreurs fréquentes avec leur explication. La correction s'appuie sur ces trois éléments.

| Résultat | Ce qui le déclenche | Ce que l'élève entend |
|---|---|---|
| Acquis | La réponse correspond, à la tolérance près | Une confirmation, puis le critère atteint |
| Partiel | L'idée est là, la forme ne l'est pas | Le critère visé, un indice, puis la réponse attendue |
| Erreur typique reconnue | La réponse correspond à une erreur déclarée | Le nom de l'erreur, pourquoi elle est fréquente, comment l'éviter |
| À reprendre | Rien ne correspond | Une reprise calme, le critère, un indice, la réponse |

L'élève n'entend jamais un « faux » sec. Le retour nomme toujours le critère à atteindre — c'est ce qui distingue une correction utile d'une note. Sur l'ensemble du quiz, un score d'au moins quatre-vingts pour cent signale une notion acquise, cinquante pour cent une notion en cours, en dessous une notion à reprendre depuis le début.

## Les devoirs : l'indice avant la réponse

Un service qui donne les réponses des devoirs détruit exactement ce qu'il prétend soutenir : l'apprentissage de l'élève et la capacité de l'enseignant à voir où il en est.

La règle est donc écrite dans le code, pas confiée au jugement du modèle. Quand la demande porte sur un travail noté — devoir, interrogation, contrôle du lendemain — et qu'aucune tentative n'est détectée dans ce que l'élève a dit, la réponse finale est retenue. L'élève reçoit à la place :

- une phrase qui explique pourquoi la réponse est retenue, sans reproche ;
- **des indices ordonnés du plus léger au plus fort**, du type « relis l'énoncé et dis à voix haute ce qu'on te demande » avant toute piste technique ;
- **un exemple entièrement résolu sur un exercice semblable**, jamais sur le sien ;
- une invitation explicite à essayer maintenant et à revenir dire ce qu'il a trouvé.

Dès qu'une tentative est exprimée, la séance redevient normale : correction complète, critère de réussite, erreur typique nommée s'il y en a une. Ce sont des devoirs avec indices avant réponse, et non un service de corrigés.

## Un plan de révision qui compte les semaines qui restent

Un élève qui prépare le TENAFEP n'a pas besoin d'un cours de plus. Il a besoin de savoir quoi travailler cette semaine.

Le plan part d'une donnée simple : le nombre de semaines entre aujourd'hui et la date de l'examen, calculé à partir du profil confirmé. Sans date connue, le plan est construit sur six semaines par défaut, et le service le dit. Chaque semaine porte trois choses : un petit nombre de points à travailler, des activités concrètes réalisables sans manuel, et un point de contrôle qui permet de savoir si la semaine a servi. Une routine quotidienne courte complète l'ensemble.

Le plan n'est pas un document que personne ne relira : il alimente des rappels programmés, envoyés au fil des semaines, dans la langue de l'élève. La même mécanique sert pour l'Examen d'État en fin de secondaire.

## La répétition espacée, réglée pour l'oral

Réviser une fois ne suffit pas ; réviser tous les jours la même chose est un gaspillage. Le module utilise une variante déterministe de l'algorithme SM-2, réglée pour des séances orales courtes sur un téléphone d'entrée de gamme.

| Étape | Intervalle avant la révision suivante | Remarque |
|---|---|---|
| 1re réussite | 1 jour | Reprise rapide, la notion est fragile |
| 2e réussite | 3 jours | Consolidation |
| 3e réussite | 7 jours | La notion tient une semaine |
| Réussites suivantes | Intervalle précédent multiplié par le facteur de facilité | Facteur borné entre 1,3 et 2,6 |
| Échec de rappel | Retour à 1 jour | Le compteur de réussites est remis à zéro |

Le facteur de facilité part de 2,5 et bouge lentement, à la hausse comme à la baisse. Une réussite obtenue avec de l'aide compte moins qu'une réussite autonome : la qualité du rappel est diminuée d'un cran, ce qui rapproche mécaniquement la révision suivante. Cette répétition espacée pour élèves ruraux ne suppose ni application installée, ni connexion permanente : c'est une date de rappel, et un message vocal ce jour-là.

## Le mode parent, sans les mots de l'enfant

Un parent a le droit de savoir comment son enfant progresse. L'enfant a le droit que ses phrases ne soient pas rapportées.

Le point d'étape destiné au parent contient donc cinq éléments : les matières travaillées, les points forts, ce qui reste à retravailler, deux ou trois activités à faire à la maison, et un encouragement. Avant d'être prononcé, il passe par un filtre qui **supprime toute phrase reprenant une suite d'au moins six mots consécutifs dits par l'enfant**. Ce n'est pas une paraphrase demandée poliment au modèle : c'est une règle appliquée sur le texte produit.

Trois autres limites s'appliquent au mode parent sans transcription verbatim : aucune étiquette durable n'est posée sur l'enfant, aucune comparaison avec d'autres élèves n'est produite, et les finalités comme les durées de conservation relèvent de la [page consacrée à la protection des données](/confidentialite).

## Les règles de protection de l'enfance

Trois filtres déterministes s'exécutent avant, pendant et après l'enseignement.

- **Contenu réservé aux adultes.** Sujets sexuels, drogues, alcool, armes, jeux d'argent : le service n'explique pas, il redirige vers un adulte de confiance — un parent, un enseignant, l'infirmier du centre de santé — et propose de revenir à une leçon.
- **Aucune persuasion commerciale.** Le service est gratuit et ne vend rien. Une phrase qui pousse à acheter, à s'abonner ou qui cite une marque est supprimée, pas reformulée. Cette règle s'applique aussi à ce que le modèle produit.
- **Divulgation grave.** Violence, exploitation, négligence, mariage forcé, pensées suicidaires : la leçon s'arrête. Une réponse écrite à l'avance est lue, un dossier à accès restreint est ouvert pour une personne formée, et aucun détail ne circule dans les notifications ordinaires. Le service ne demande jamais de détails à l'enfant.

Ces règles sont écrites dans le code, testées, et ne dépendent d'aucun modèle. Elles reprennent la même philosophie que le reste de la plateforme : ce qui protège une personne ne relève pas de la bonne volonté d'un moteur génératif.

## Ce que nous ne savons pas encore faire

- Les **explications en langues nationales restent des versions de travail** pour les notions techniques ; le vocabulaire mathématique en kikongo et en tshiluba est particulièrement fragile, un sujet traité dans le guide sur [l'IA vocale en langues congolaises](/blog/ia-vocale-langues-congolaises).
- **Aucun résultat d'apprentissage n'est publié.** Les gains réels sur les acquis des élèves ne pourront être mesurés qu'après un pilote suivi avec des enseignants, en comparant des groupes comparables. Les travaux de [l'UNESCO](https://www.unesco.org/) et les analyses de [la Banque mondiale](https://www.worldbank.org/) rappellent que l'accès à un outil ne produit pas mécaniquement de l'apprentissage.
- **La reconnaissance vocale des enfants est plus difficile** que celle des adultes : voix aiguës, débit irrégulier, bruit de fond scolaire. Les seuils par langue et par canal sont publiés sur la [page des langues nationales](/langues-nationales).
- **Le service ne certifie rien.** Il ne délivre ni note officielle, ni attestation, et n'intervient pas dans l'organisation des examens nationaux.

Une révision vocale pour le TENAFEP réussie ne se mesurera pas au nombre de questions posées, mais à trois choses : un élève qui revient de lui-même, un enseignant qui voit enfin où sa classe bloque, et un parent qui sait quoi faire le soir sans avoir à lire un rapport. Le détail des trois services du programme est décrit sur la [page des services](/services).
