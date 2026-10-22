---
slug: orchestration-interaction-dix-etapes
title: "Orchestration d'une interaction : dix étapes tracées"
description: "L'orchestration d'une interaction en dix étapes : transcription, routage déterministe, score de risque, localisation, escalade, et un repli qui répond même en panne."
lang: fr
category: Technologie et architecture
cluster: architecture
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: architecture de la chaîne de traitement
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture du repli d'urgence et du score de risque
keywords: [orchestration d'une interaction, sauvegarde à chaque étape, repli déterministe, score de risque, latence par étape]
entities: [orchestrateur, transcription, routage, agent spécialisé, score de risque, localisation, escalade, synthèse vocale]
tags: [Architecture, Santé, Gouvernance, Produit, RDC]
imageAlt: "Chaîne de traitement d'une interaction vocale, de l'enregistrement audio jusqu'à la réponse parlée et à l'escalade"
takeaways:
  - "Dix étapes, et une écriture en base après chacune : une interaction abandonnée ou en échec laisse quand même une trace complète."
  - "Le routage vers un module et la détection des signes de danger sont déterministes et peuvent contredire le modèle ; le taux de contradiction est mesuré."
  - "Le score de risque est calculé sur les mots réellement prononcés, avant toute traduction et avant la lecture d'un modèle."
  - "Si tous les fournisseurs tombent, un signe de danger déclenche quand même le script d'urgence, l'ouverture d'un dossier et l'alerte d'un agent."
  - "La durée de chaque étape est enregistrée séparément : une lenteur s'attribue au lieu de se deviner."
faq:
  - q: "Pourquoi enregistrer après chaque étape plutôt qu'à la fin ?"
  - a: "Parce qu'une interaction qui échoue au milieu est précisément celle que l'on doit pouvoir examiner. Avec une écriture finale unique, un appel interrompu ne laisse rien ; avec une sauvegarde à chaque étape, il reste la transcription, la langue détectée, le niveau de risque calculé et le point exact où la chaîne s'est arrêtée."
  - q: "Le modèle décide-t-il de l'orientation vers la santé, l'agriculture ou l'éducation ?"
  - a: "Il propose, il ne décide pas seul. Un routage déterministe, fondé sur des marqueurs et des règles relues, peut contredire sa proposition, et la fréquence de ces contradictions est enregistrée. Une contradiction qui augmente signifie que le modèle se dégrade sur un point sensible : c'est un signal, pas un détail."
  - q: "Que reçoit une personne si tous les fournisseurs d'IA sont indisponibles ?"
  - a: "Si son message contient un signe de danger, elle reçoit l'instruction d'urgence relue dans sa langue, un dossier critique est ouvert et un agent est alerté — sans aucun appel à un modèle. Si son message n'en contient pas, le service dit honnêtement qu'il n'a pas pu comprendre, plutôt que d'improviser une réponse."
  - q: "Pourquoi une réponse en sept parties ?"
  - a: "Pour qu'elle soit vérifiable. Séparer ce qui est demandé, ce qui a été compris, le risque calculé, la conduite à tenir, l'escalade, la confiance et le résumé permet de contrôler chaque élément indépendamment — et de détecter qu'une réponse fluide contient une action incorrecte."
  - q: "Combien de temps prend un tour de conversation ?"
  - a: "La chaîne enregistre la durée de chaque étape, mais le programme ne publie pas encore de chiffre de latence de bout en bout : les mesures du pilote portent sur des volumes trop faibles pour être représentatives, et la transcription comme la synthèse dépendent de prestataires externes. Le travail d'optimisation est en cours et sera documenté avec ses mesures."
sources:
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
  - url: "https://www.who.int/"
  - label: "NIST — AI Risk Management Framework"
  - url: "https://www.nist.gov/itl/ai-risk-management-framework"
related: [signes-de-danger-detection-automatique, transcription-inventee-detection, independance-fournisseurs-ia]
---

Entre le moment où une mère appuie sur un bouton pour parler et celui où une voix lui répond en lingala, il se passe une dizaine de choses, dans un ordre qui n'est pas négociable. L'**orchestration d'une interaction** est la partie de la plateforme où toutes les règles se rencontrent : la transcription, la langue, le domaine, le risque, la traduction, l'escalade et la parole. C'est aussi l'endroit où une erreur de conception coûte le plus cher, parce qu'elle se produit sur chaque tour de conversation.

Cet article décrit cette chaîne telle qu'elle est écrite, étape par étape, avec les décisions qui ont été prises contre la facilité.

## Dix étapes, et une sauvegarde après chacune

La chaîne va de l'enregistrement brut à la parole : sauvegarde immédiate, transcription, analyse de la langue et classification du service, contexte de personnalisation, agent spécialisé, score de risque, composition puis localisation de la réponse, enregistrement des résultats structurés, ouverture ou escalade d'un dossier, et enfin synthèse vocale.

| # | Étape | Déterministe ou modèle | Ce qui est écrit en base |
|---|---|---|---|
| 1 | Sauvegarde de la demande brute | Déterministe | Interaction créée, audio archivé hors du chemin critique |
| 2 | Transcription de la parole | Modèle | Transcription, verdict de fiabilité, durée |
| 3 | Analyse de la langue et routage | Les deux | Langue, module, signes de danger, contradictions du routeur |
| 4 | Contexte de personnalisation | Déterministe | Langue mémorisée, province, historique utile |
| 5 | Agent spécialisé | Modèle | Compréhension, intention, éléments structurés |
| 6 | Score de risque | Déterministe | Niveau, indicateurs, origine de l'incertitude |
| 7 | Composition puis localisation | Les deux | Réponse en sept parties, version localisée, termes de glossaire |
| 8 | Résultats structurés et dossiers de domaine | Déterministe | Fiche de triage, rapport agricole, session éducative |
| 9 | Dossier et escalade | Déterministe | Dossier ouvert, destinataire alerté, motif |
| 10 | Synthèse vocale | Modèle, avec repli local | Adresse de l'audio, ou absence assumée |

Le point important n'est pas la liste, c'est ce qui se passe entre les étapes : **chaque résultat est écrit sur la ligne d'interaction dès qu'il est disponible.** Une interaction abandonnée à la troisième étape laisse donc la transcription, la langue détectée et le motif d'arrêt, au lieu de ne rien laisser.

Cette sauvegarde à chaque étape a été payée en complexité, et elle a été choisie pour trois raisons.

- **Un appel se coupe.** Sur un réseau mobile de zone rurale, la fin d'une conversation n'est pas garantie. Un enregistrement partiel reste exploitable pour comprendre ce que la personne demandait.
- **Un échec doit être attribuable.** « Ça n'a pas marché cet après-midi » devient une ligne précise, reliée à l'identifiant de trace de la requête, consultable dans les journaux techniques.
- **Une trace incomplète est une trace trompeuse.** Un programme qui n'enregistre que les tours réussis mesure sa qualité sur l'échantillon le plus flatteur possible.

Une décision mérite d'être racontée, parce qu'elle est née d'un incident. L'archivage de l'enregistrement audio se faisait à l'intérieur de la chaîne et sans filet : un pilote de stockage qui refusait de charger transformait chaque question vocale en erreur interne. Une personne décrivant les symptômes d'un enfant recevait « Erreur interne ». L'archivage est désormais hors du chemin critique : son échec est journalisé, audité et inscrit sur l'interaction, mais il ne décide plus si la personne obtient une réponse. L'enregistrement est une preuve ; la réponse est le service.

Lu ainsi, le tableau dit l'essentiel de la philosophie du programme : tout ce qui décide d'une conduite à tenir est déterministe, et tout ce qui relève de la langue est confié à un modèle. L'orchestration d'une interaction consiste, pour l'essentiel, à tenir cette frontière sous pression.

## Pourquoi le routage n'est pas confié au modèle

Deux décisions de l'étape trois sont volontairement retirées au modèle : vers quel module l'interaction va, et si le message contient un signe de danger.

Le modèle propose une classification. Un routage déterministe, fondé sur des marqueurs relus et des règles de priorité, peut la contredire — et quand il la contredit, le fait est enregistré. Ce compteur est un instrument de surveillance : une contradiction qui augmente signifie que le modèle se dégrade sur une tâche critique pour la sécurité, et il vaut mieux l'apprendre d'un chiffre que d'un incident.

La détection des signes de danger suit la même logique, décrite en détail dans l'article sur les [signes de danger](/blog/signes-de-danger-detection-automatique). Les listes viennent des protocoles de prise en charge intégrée des maladies de l'enfant publiés par l'[Organisation mondiale de la santé](https://www.who.int/) et relus par le comité clinique. Elles sont du code et de la configuration, pas une appréciation.

À cette étape se joue aussi la lecture de la transcription. Lorsqu'un modèle de reconnaissance vocale part en boucle — un phénomène fréquent sur de l'audio de terrain, analysé dans l'article sur la [transcription inventée](/blog/transcription-inventee-detection) — le tour n'est pas abandonné, mais il est marqué comme non fiable : on peut y répondre, on ne doit pas en être sûr, et les questions de clarification ne doivent pas relire ses chiffres. Trois lectures de confiance distinctes sont conservées plutôt qu'un score unique, pour qu'une traduction confiante d'une phrase mal entendue ne passe pas pour un tour confiant.

## Le score de risque est calculé sur ce que la personne a dit

L'étape six est déterministe, et son entrée est choisie avec soin : le **score de risque** est calculé sur les mots réellement prononcés, avant la traduction en français et avant toute reformulation par un modèle.

Ce détail d'ordonnancement est une protection contre une classe d'erreurs discrète. Une traduction peut adoucir : « il ne respire presque plus » devient « il a des difficultés respiratoires », et la seconde formulation ne déclenche pas les mêmes règles que la première. En calculant le risque sur la source, le programme évite qu'une étape de confort linguistique déplace un seuil de sécurité.

Le score produit un niveau, un ensemble d'indicateurs et une mention explicite lorsqu'il est tiré par l'incertitude plutôt que par la gravité — une distinction qui change la conduite à tenir et qui est développée dans l'article sur les [seuils de confiance](/blog/seuils-de-confiance-abstention).

## Une réponse en sept parties, puis sa localisation

La réponse n'est pas un paragraphe. C'est une structure en sept champs : ce qui est demandé, ce qui a été compris, le risque calculé, la conduite à tenir, l'escalade requise, la confiance, et un résumé destiné aux tableaux de bord.

Cette décomposition sert à vérifier. Une réponse fluide dont l'action est incorrecte est le pire produit possible pour un service de santé ; en séparant les champs, chacun peut être contrôlé par des règles — la conduite à tenir contre les textes de protocole autorisés, l'escalade contre le score de risque, le résumé contre le contenu.

Vient ensuite la **localisation** : la réponse est composée en français canonique, puis traduite dans la langue de la personne avec un glossaire imposé pour les termes sensibles. Un terme du glossaire que le rendu aurait laissé tomber est signalé, parce que c'est ainsi qu'un glossaire cesse discrètement d'être appliqué. Enfin, le texte est préparé pour l'oral : phrases courtes, nombres écrits en mots, ponctuation adaptée à une voix synthétique.

L'étape huit enregistre les résultats structurés et les dossiers de domaine — fiche de triage pour la santé, rapport agricole, session éducative — puis déclenche, le cas échéant, la veille de regroupement : plusieurs signalements semblables dans un même territoire et une même fenêtre ouvrent un groupe non vérifié et alertent le réseau de vulgarisation. L'étape neuf ouvre et escalade le dossier quand les règles l'exigent, et l'étape dix produit la parole, avec repli sur la synthèse du téléphone si le service externe est indisponible.

## Que se passe-t-il quand tout échoue ?

C'est la question qui distingue une architecture d'une intention, et la réponse a été écrite après un incident que le programme assume publiquement.

Avec tous les fournisseurs injoignables, la chaîne renvoyait « Le service est momentanément indisponible, réessayez dans quelques instants » — y compris à une personne qui venait d'écrire que son bébé ne respirait plus et ne pouvait plus s'alimenter. Aucun script, aucun dossier, personne d'alerté. Le serveur vocal protégeait déjà ce cas en court-circuitant sur des mots-clés avant tout appel à un modèle ; le chemin web, le plus utilisé, ne le faisait pas.

Le **repli déterministe** corrige cela, et il ne dépend de rien d'externe : les phrases de danger sont des constantes, la lecture de la langue est un comptage de marqueurs, l'instruction est un texte relu dans les cinq langues, et le dossier est une ligne de base de données. Concrètement, en cas de panne généralisée et de signe de danger détecté :

1. L'instruction d'urgence est renvoyée dans la langue de la personne, accompagnée de la mention indiquant que la structure la plus proche n'a pas pu être nommée.
2. Un dossier critique est ouvert, avec une note précisant qu'il a été créé par la voie de repli pendant une indisponibilité des services d'intelligence artificielle.
3. Un agent est alerté et l'événement est audité séparément, pour que ces cas soient comptables.
4. Si même l'ouverture du dossier échoue, l'instruction part quand même. Perdre les deux serait pire que perdre l'un.

Une panne de fournisseur est précisément le moment où cela compte, parce que c'est aussi le moment où le réseau est suffisamment mauvais pour que la personne n'ait pas de seconde chance de poser sa question. Le [cadre de gestion des risques du NIST](https://www.nist.gov/itl/ai-risk-management-framework) nomme ce comportement une exigence de dégradation sûre ; ici, c'est une fonction testée en coupant les fournisseurs, comme le décrit l'article sur l'[indépendance des fournisseurs](/blog/independance-fournisseurs-ia).

## La latence par étape, parce qu'une moyenne ne se corrige pas

La chaîne enregistre la durée de chaque étape séparément : transcription, analyse, agent spécialisé, localisation, écriture. Une moyenne globale ne dit pas quoi corriger ; une **latence par étape** désigne le coupable.

Il faut ici être clair sur l'état réel du programme. Le dispositif de mesure existe et il est en place sur chaque tour ; le programme ne publie pas encore de chiffre de latence de bout en bout, parce que le volume du pilote est trop faible pour être représentatif et parce que deux des étapes dépendent de prestataires externes dont les temps de réponse varient selon l'heure et la charge. Annoncer une latence moyenne dans ces conditions serait exactement le genre de chiffre rassurant qui ne survit pas au premier déploiement. L'optimisation est en cours et sera documentée avec ses mesures, pas avant.

Un dernier mot sur la robustesse de ce dispositif de mesure : il est écrit dans la même transaction que le reste du tour, donc une étape qui échoue laisse malgré tout sa durée. C'est ce qui permet de distinguer une étape lente d'une étape qui n'a jamais démarré — deux pannes que l'on confond facilement quand on ne dispose que d'un temps total.

## Ce que l'orchestration ne fait pas

Quatre limites, pour clore sans survendre.

- **Elle ne rend pas un modèle fiable.** Elle borne ce qu'un modèle peut décider. Si la reconnaissance vocale d'une langue est mauvaise, la chaîne le détecte, le signale et bascule en mode scripté : elle ne le répare pas.
- **Elle n'invente pas une structure de santé.** Lorsque la plateforme ne connaît pas la structure la plus proche, elle le dit au lieu de nommer un établissement plausible.
- **Elle ne remplace pas un agent.** Le service comprend, explique, calcule un risque et alerte ; la prise en charge reste humaine, et c'est le sens des règles décrites dans [les services](/services).
- **Elle ne garantit pas la trace en cas de perte de base.** La sauvegarde à chaque étape suppose une base disponible. Les événements consignés dans le [journal d'audit en chaîne](/blog/journal-audit-chaine-verifiable) permettent de le détecter après coup, pas de l'empêcher.

Aucune de ces quatre limites n'est levée par l'orchestration d'une interaction, et les nommer est la seule façon honnête de décrire ce qu'elle apporte. Ce que cette architecture garantit tient en une phrase : quelle que soit l'étape qui échoue, il reste une trace de ce qui a été demandé, et devant un signe de danger il reste une [conduite à tenir](/urgence) prononcée dans la langue de la personne.
