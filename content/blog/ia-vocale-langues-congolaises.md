---
slug: ia-vocale-langues-congolaises
title: "IA vocale en langues congolaises : le guide complet"
description: "Construire une IA vocale en langues congolaises fiable : données, code-switching, seuils de qualité et boucle d'apprentissage, par un programme public en cours."
lang: fr
category: Langues et parole
cluster: langues-peu-dotees
pillar: true
publishedAt: 2026-09-08
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: architecture de la couche langue
reviewer: Comité d'inclusion linguistique
reviewerRole: relecture par des locuteurs natifs
keywords: [IA vocale en langues congolaises, reconnaissance vocale lingala, traitement du kikongo, corpus vocal tshiluba, code-switching français lingala]
entities: [lingala, kikongo, kiswahili, tshiluba, reconnaissance vocale, synthèse vocale, code-switching, corpus vocal, taux d'erreur de mots]
tags: [Langues, Reconnaissance vocale, Corpus, Inclusion numérique, RDC]
imageAlt: "Schéma de la chaîne de traitement vocal, de l'enregistrement à la réponse parlée en langue nationale"
takeaways:
  - "Une IA vocale utile en langue congolaise se juge sur le rappel des situations graves, pas sur un score moyen de transcription."
  - "Le mélange français-lingala dans une même phrase est la norme, pas l'exception : la chaîne doit l'accepter au lieu de forcer un choix de langue."
  - "Sans corpus transcrit et sans relecture par des locuteurs natifs, aucun modèle générique ne tient sur le terrain congolais."
  - "Une langue qui passe sous ses seuils de qualité doit basculer en mode guidé avec des messages enregistrés, pas continuer à deviner."
faq:
  - q: "Quelle est la précision d'une IA vocale en lingala aujourd'hui ?"
    a: "Les modèles multilingues ouverts couvrent le lingala faiblement et le kikongo ou le tshiluba très faiblement. Sur de l'audio de terrain en 8 kHz, un taux d'erreur de mots de 30 % reste un objectif de travail, pas un acquis. C'est pourquoi le programme publie des seuils par langue et bascule en mode guidé quand ils ne sont pas atteints."
  - q: "Faut-il un modèle par langue ou un modèle multilingue ?"
    a: "Les deux. Un modèle multilingue sert de base et couvre l'identification de langue et le français ; des modèles adaptés par langue, entraînés sur le corpus local, prennent le relais dès qu'ils dépassent la base sur le jeu d'évaluation de cette langue."
  - q: "Comment gérer une phrase qui mélange deux langues ?"
    a: "En étiquetant la langue au niveau de la portion d'énoncé plutôt que du message entier, en conservant la transcription d'origine, et en produisant une forme française canonique pour le raisonnement et l'audit."
  - q: "Combien d'heures d'audio faut-il collecter ?"
    a: "L'ordre de grandeur retenu par le programme est de deux cents heures transcrites par langue peu dotée, réparties sur plusieurs provinces et équilibrées par genre et par âge, plus un jeu d'évaluation annoté de deux mille énoncés par langue et par domaine."
  - q: "Que se passe-t-il si le système ne comprend pas ?"
    a: "Il le dit, demande une confirmation ciblée sur l'élément critique, et après deux tentatives il oriente vers un humain plutôt que de continuer à deviner. Toute incompréhension signalée par le citoyen entre dans la file de relecture."
sources:
  - label: "Meta AI — Massively Multilingual Speech, couverture de plus de mille langues"
    url: "https://ai.meta.com/blog/multilingual-model-speech-recognition/"
  - label: "OpenAI — Whisper, reconnaissance vocale multilingue"
    url: "https://openai.com/index/whisper/"
  - label: "Mozilla Common Voice — collecte ouverte de corpus vocaux"
    url: "https://commonvoice.mozilla.org/"
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
    url: "https://www.who.int/"
related: []
---

Un service public vocal ne se juge pas sur une démonstration en studio. Il se juge le jour où une mère de famille du Kongo-Central décrit, en kikongo mélangé de français, un enfant qui convulse — et où le système doit comprendre assez vite pour dire la bonne chose. Ce texte décrit ce que nous avons appris en construisant une **IA vocale en langues congolaises** pour un service national de santé, d'agriculture et d'éducation, et ce que nous publions comme limites.

## Pourquoi les langues congolaises résistent aux modèles vocaux standards

La République Démocratique du Congo parle quatre langues nationales à côté du français : le lingala, le kikongo, le kiswahili et le tshiluba. Aucune n'est traitée par les moteurs commerciaux avec la qualité dont bénéficie le français ou l'anglais. Trois raisons se cumulent.

### Les données transcrites manquent

Un modèle de reconnaissance vocale apprend d'heures d'audio alignées avec leur transcription. Pour le français, ces heures se comptent en dizaines de milliers. Pour le tshiluba, elles se comptent en dizaines. Les initiatives ouvertes comme [le projet Common Voice de Mozilla](https://commonvoice.mozilla.org/) ont montré qu'une collecte communautaire est possible, mais la couverture des langues bantoues d'Afrique centrale reste marginale. Les modèles massivement multilingues publiés ces dernières années, à commencer par [le travail de Meta AI sur plus de mille langues](https://ai.meta.com/blog/multilingual-model-speech-recognition/), élargissent la couverture nominale sans garantir l'exactitude sur un dialecte donné.

### Le code-switching est la norme

Une phrase entendue à Kinshasa ressemble rarement à du lingala pur. Elle passe du lingala au français au milieu d'une proposition, souvent sur les mots techniques : « mwana na ngai azali na fièvre banda mikolo mibale ». Un système qui force l'utilisateur à choisir une langue au début de l'appel se trompe donc structurellement. L'étiquetage doit se faire au niveau de la portion d'énoncé, et la transcription d'origine doit être conservée telle quelle.

### L'audio de terrain n'est pas de l'audio de studio

Un appel passé depuis un village arrive compressé en 8 kHz, avec du vent, des enfants, une radio, et une ligne qui coupe. Les scores publiés sur des jeux de test propres ne prédisent pas le comportement dans ces conditions. Nous mesurons donc systématiquement deux fois : sur audio propre et sur audio de terrain.

## Comment mesurer la qualité d'une IA vocale dans une langue peu dotée ?

Un score moyen de transcription ne dit rien d'utile pour un service de santé. Ce qui compte, c'est le comportement dans les cas rares et graves. Le programme publie donc des seuils par langue, et une langue n'est ouverte dans un module qu'après les avoir franchis.

| Mesure | Seuil d'ouverture | Pourquoi ce seuil |
|---|---|---|
| Taux d'erreur de mots, audio propre | 20 % maximum (12 % en français) | Au-delà, l'extraction d'entités devient trop bruitée |
| Taux d'erreur de mots, audio de terrain 8 kHz | 30 % maximum | Reflète l'appel réel, pas la démonstration |
| Exactitude de l'intention | 90 % en santé, 85 % en agriculture et éducation | Une intention fausse envoie vers le mauvais protocole |
| Rappel des situations d'urgence | 98 % minimum | Un faux négatif en santé est inacceptable |
| Intelligibilité de la voix de synthèse | 3,8 sur 5 en écoute native | En dessous, la personne raccroche |
| Identification de la langue | 95 % minimum | Conditionne toute la suite de la chaîne |

Ces seuils sont publics, avec la conduite à tenir quand ils ne sont pas atteints : la langue bascule en mode guidé, avec des messages enregistrés par des locuteurs natifs et une navigation par touches, plutôt que de laisser un modèle deviner. Le détail par langue est publié sur la page consacrée aux langues nationales du programme.

## La chaîne de traitement, étape par étape

Sept étapes séparent l'enregistrement de la réponse parlée. Chacune produit une trace consultable.

1. **Segmentation** de l'audio et détection de la parole, pour ne transcrire que ce qui est dit.
2. **Identification de la langue** au niveau de l'énoncé, avec les deux hypothèses les plus probables et leur probabilité.
3. **Transcription**, avec un score de confiance par segment, et non un score global unique.
4. **Normalisation du mélange de langues**, en gardant les étiquettes de langue par portion.
5. **Forme française canonique**, utilisée pour le raisonnement, l'audit et la lecture par un agent humain, la transcription d'origine étant conservée.
6. **Traitement métier**, qui applique des règles écrites avant toute génération de texte.
7. **Rendu dans la langue du citoyen**, avec un glossaire imposé sur les termes médicaux et agricoles, puis synthèse vocale.

L'ordre compte. La détection des signes de danger intervient **avant** l'appel au modèle de langage : un mot comme « convulsions », « degedege » ou « akoki kopema te » déclenche la même réponse même si tous les fournisseurs d'IA sont indisponibles. C'est ce que nous appelons des garde-fous déterministes, et c'est la raison pour laquelle la gouvernance clinique du service peut être auditée ligne par ligne.

## Faire apprendre le système à partir des conversations

Un modèle générique ne suffit pas ; il faut une boucle qui transforme l'usage réel en amélioration mesurable. La nôtre a six étapes.

- Chaque conversation devient un échantillon de corpus : ce qui a été entendu, le sens compris en français, l'audio, la province, l'intention et la confiance du système.
- Le citoyen peut signaler « le système ne m'a pas compris » et noter la voix de synthèse.
- Des relecteurs, locuteurs natifs, vérifient, corrigent et enrichissent un lexique local avec des indications de prononciation.
- Les exemples vérifiés et le lexique sont réinjectés dans chaque nouvelle demande, ce qui améliore la compréhension immédiatement, sans réentraînement.
- Les paires audio/transcription vérifiées sont exportées pour l'entraînement de modèles de parole adaptés.
- Un indicateur de maîtrise par langue — écoute, compréhension, parole — est recalculé en continu.

Ce dernier point est important pour un financeur : il rend visible ce qui progresse et ce qui stagne, langue par langue, au lieu d'un score global qui masque les écarts.

## Choisir des fournisseurs sans dépendre d'aucun

Aucun fournisseur ne couvre correctement les cinq langues. La conséquence pratique est qu'il faut router chaque tâche vers le moteur le moins mauvais pour cette tâche et cette langue, et pouvoir en changer sans réécrire le service.

Nous avons isolé un seul point de contact avec les fournisseurs. Les agents métier n'appellent jamais un moteur directement : ils demandent une transcription, une compréhension structurée ou une synthèse vocale, et une passerelle décide qui répond. Trois conséquences suivent.

- **Le basculement est automatique.** Si le moteur préféré échoue, refuse ou renvoie une sortie non conforme au schéma attendu, la demande passe au suivant dans la chaîne, sans que le citoyen le sache.
- **Le mode dégradé est réel.** Quand tous les moteurs sont indisponibles, les arbres de décision continuent de tourner et les scripts d'urgence enregistrés sont diffusés. Le service perd la conversation, pas la sécurité.
- **Aucun nom de fournisseur ne sort.** Ni dans l'interface, ni dans une réponse d'API, ni dans un message d'erreur. Un service public ne fait pas la promotion d'un moteur commercial, et le programme doit pouvoir en changer sans renégocier sa communication.

Cette organisation a un coût : chaque sortie de modèle doit être validée contre un schéma strict avant d'être utilisée, et une sortie non conforme est traitée comme une panne. C'est plus lent à écrire, mais c'est ce qui rend le comportement du service prévisible quand un fournisseur change son modèle sans prévenir.

## Concevoir pour la 2G, l'électricité intermittente et le téléphone partagé

Les contraintes de terrain déterminent l'architecture plus sûrement que les préférences techniques.

La **bande passante** impose un audio compressé et un envoi par morceaux, avec reprise après coupure. Une photo agricole est vérifiée avant d'être envoyée : si elle est floue ou trop sombre, l'application demande une nouvelle prise plutôt que de consommer une analyse pour rien.

L'**électricité intermittente** interdit les sessions longues. Une conversation interrompue doit pouvoir reprendre là où elle s'est arrêtée, ce qui suppose de stocker l'état de la session et non seulement le dernier message.

Le **téléphone partagé** interdit d'assimiler l'identité au numéro. Une même ligne peut servir à plusieurs personnes du ménage ; le service demande donc une confirmation légère en début de session et n'attache aucune inférence de santé au profil.

Enfin, la **voix reste l'interface principale**. Le texte est un secours, pas l'inverse. Une réponse parlée dépasse rarement vingt-cinq secondes, et au-delà elle est découpée avec une proposition explicite de continuer. Ces choix ne sont pas des détails d'ergonomie : ils décident si une personne qui ne lit pas couramment peut utiliser un service public numérique, ou si elle en est exclue une fois de plus.

## Ce que cela change pour un service public

Une IA vocale qui tient dans ces conditions ouvre trois usages que le numérique classique n'atteignait pas.

En **santé communautaire**, une personne décrit des symptômes et reçoit une orientation, avec détection des signes de danger et alerte d'un relais communautaire quand la situation est grave. En **agriculture**, un producteur décrit ou photographie une maladie des cultures et reçoit d'abord des actions gratuites, puis peu coûteuses, avant toute mention d'un produit du registre des intrants. En **éducation**, un élève révise à voix haute, y compris pour le TENAFEP, dans la langue où il comprend le mieux.

Dans les trois cas, la valeur ne vient pas de la conversation mais de ce qui suit : un cas ouvert, un humain prévenu, un délai de prise en charge suivi. C'est ce que décrit le programme dans son ensemble.

## Les limites que nous annonçons publiquement

Publier ses limites fait partie de la méthode. Aujourd'hui :

- Le kikongo et le tshiluba sont les moins bien servis ; leur ouverture dépend de la collecte de corpus en cours.
- Les traductions d'interface dans les quatre langues nationales sont des versions de travail, en attente de validation par des locuteurs natifs.
- Les protocoles de santé portent la mention « en attente du comité de revue clinique » tant que ce comité n'est pas constitué.
- Aucun chiffre national n'est publié : les volumes visibles proviennent de l'environnement de préparation du pilote et sont étiquetés comme tels.

Un service public qui parle aux gens dans leur langue doit être aussi clair sur ce qu'il ne sait pas encore faire que sur ce qu'il fait. C'est la condition pour que la confiance, une fois accordée, résiste au premier échec.
