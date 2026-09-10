---
slug: ia-triage-sante-communautaire
title: "IA et triage en santé communautaire : le cadre de décision"
description: "IA et triage en santé communautaire : pourquoi la gravité est décidée par des arbres versionnés et jamais par un modèle, et comment chaque décision reste auditable."
lang: fr
category: Santé communautaire
cluster: sante-communautaire
pillar: true
publishedAt: 2026-08-26
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: architecture des protocoles de santé
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des arbres de décision et des textes d'orientation
keywords: [IA et triage en santé communautaire, arbre de décision clinique versionné, échelle de gravité 0 à 4, orientation vers le centre de santé, protocole PCIME communautaire]
entities: [triage, protocole de santé, échelle de gravité, signes de danger, PCIME, relais communautaire, moteur de protocoles, journal d'audit, orientation]
tags: [Santé, Triage, Sécurité, Gouvernance, RDC]
imageAlt: "Schéma d'un arbre de décision de triage, de la parole du citoyen au niveau de gravité et à l'orientation"
takeaways:
  - "La gravité d'une situation de santé n'est jamais décidée par un modèle de langage : elle sort d'un arbre de décision versionné, rejouable et relu."
  - "L'échelle va de 0 à 4 et chaque niveau se traduit par une action datée pour le citoyen, du conseil à domicile au départ immédiat."
  - "Un signe de danger arrête l'arbre sur-le-champ : niveau 4, message d'urgence enregistré, alerte d'un humain, sans question supplémentaire."
  - "Le service pose au maximum deux questions de clarification par tour ; au-delà, il oriente plutôt que de continuer à interroger."
faq:
  - q: "Est-ce que le service pose un diagnostic ?"
  - a: "Non, jamais. Il oriente et informe : il indique un niveau de gravité, un délai et une destination de soins, à partir de textes approuvés. Il ne nomme pas une maladie, ne prescrit rien et ne donne aucune posologie en dehors de ce que contient déjà le document de référence. Ce service ne remplace pas un agent de santé."
  - q: "Qui décide du niveau de gravité, le modèle ou la règle ?"
  - a: "La règle. Le modèle transforme la parole libre en réponses aux questions du protocole et explique ensuite une décision déjà prise. Le moteur de protocoles est le seul composant qui calcule un niveau, à partir des réponses collectées et des règles écrites dans l'arbre."
  - q: "Que se passe-t-il si le système ne comprend pas assez pour trancher ?"
  - a: "Il pose au maximum deux questions de clarification, puis il marque la situation comme information insuffisante et oriente vers un humain. Une confiance basse sur un cas de santé ouvre un cas et déclenche une revue, elle ne produit jamais un niveau rassurant par défaut."
  - q: "Les protocoles sont-ils validés cliniquement ?"
  - a: "Pas encore. Chaque arbre porte la mention « en attente du comité de revue clinique » tant que ce comité n'a pas signé la version. Les documents de référence utilisés portent la même mention. Cette incertitude est publiée, elle n'est pas masquée."
  - q: "Le service peut-il être utilisé en cas d'urgence ?"
  - a: "Non. Ce n'est pas un service d'urgence. Devant un signe de danger — convulsions, inconscience, impossibilité de boire, respiration très difficile, saignement abondant — il faut partir immédiatement vers la structure de santé la plus proche, sans attendre de parler au service."
sources:
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
  - url: "https://www.who.int/"
  - label: "UNICEF — santé de l'enfant et agents de santé communautaires"
  - url: "https://www.unicef.org/"
  - label: "PubMed — littérature évaluée sur le triage communautaire"
  - url: "https://pubmed.ncbi.nlm.nih.gov/"
related: [signes-de-danger-detection-automatique, escalade-relais-communautaires, ia-vocale-langues-congolaises]
---

Une femme appelle depuis un village du Kwilu. Son enfant a de la fièvre depuis deux jours, il a vomi ce matin, et elle voudrait savoir si cela peut attendre le marché de demain. À l'autre bout, un service public doit répondre en quelques secondes, dans sa langue, sans médecin en ligne. Ce texte décrit comment **IA et triage en santé communautaire** s'articulent dans CONGO VOICE AI OS : ce que la machine décide, ce qu'elle ne décide jamais, et comment chaque décision peut être rejouée un an plus tard.

## Pourquoi un modèle de langage ne doit jamais décider de la gravité

Un modèle génératif est excellent pour comprendre une phrase mal articulée, mélangée de français et de kikongo, coupée par le vent. Il est mauvais pour être stable. Deux formulations proches de la même situation peuvent produire deux réponses différentes ; une mise à jour du fournisseur peut modifier son comportement sans que personne ne le demande ; et rien, dans son fonctionnement, ne permet d'expliquer après coup pourquoi il a dit ce qu'il a dit.

Pour un service public de santé, cette instabilité est disqualifiante. Il faut pouvoir répondre à trois questions devant une commission d'enquête : quelle règle a produit ce niveau de gravité, quelle version de cette règle était en vigueur ce jour-là, et qui l'avait approuvée. Un modèle ne répond à aucune des trois.

La séparation retenue est donc nette, et elle correspond à deux parties distinctes du logiciel :

- **Le modèle comprend et explique.** Il traduit la parole libre en réponses structurées aux questions d'un protocole, puis met en mots une décision déjà arrêtée.
- **Le code décide.** Un moteur déterministe parcourt l'arbre, applique les règles, calcule le niveau de gravité et choisit le texte d'orientation.

Cette frontière n'est pas une intention affichée dans une charte : elle est vérifiable dans le dépôt, où le calcul de gravité vit dans un module qui n'appelle aucun fournisseur d'IA. Les règles de sécurité relèvent des [garde-fous déterministes décrits dans la page gouvernance](/gouvernance), pas de la bonne volonté d'un moteur commercial.

## Comment fonctionne un arbre de décision versionné ?

Un protocole est un fichier de données, pas du code métier dispersé. Il déclare une entrée, un ensemble de questions, des embranchements, des règles de gravité, des signes d'alerte et cinq textes de sortie — un par niveau. Le tout est sérialisable, donc stockable, comparable d'une version à l'autre et rejouable à l'identique.

Dix arbres couvrent aujourd'hui les motifs les plus fréquents d'un contact communautaire :

| Arbre de décision | Ce qu'il couvre | Documents de référence |
|---|---|---|
| Fièvre de l'enfant de moins de 5 ans | Fièvre, paludisme possible, rougeole, déshydratation | Fièvre, prévention, triage |
| Fièvre de l'adulte | Fièvre prolongée, signes généraux | Fièvre, triage |
| Toux et difficulté respiratoire | Respiration rapide, tirage, sifflement | Respiratoire, triage |
| Diarrhée et déshydratation | Selles liquides, vomissements, signes de déshydratation | Diarrhée, hygiène de l'eau |
| Signes de danger de la grossesse | Saignement, céphalées, œdèmes, mouvements du bébé | Grossesse, urgence |
| Signes de danger du nouveau-né | Moins de deux mois, cordon, ictère, refus de téter | Nouveau-né, urgence |
| Blessure et saignement | Plaies, brûlures, morsures, hémorragie | Blessures, urgence |
| Dépistage de la malnutrition | Amaigrissement, œdèmes, périmètre brachial | Nutrition |
| Calendrier vaccinal | Doses dues, doses en retard, rattrapage | Vaccination |
| Motif général | Tout ce qui n'entre pas dans les précédents | Triage |

### Ce qu'une version apporte

Chaque arbre porte un identifiant et un numéro de version, et cette paire est enregistrée avec la décision. Un cas ouvert en septembre reste explicable en mars, même si l'arbre a changé depuis : c'est la version d'origine qui est rejouée. Une version invalide — un embranchement qui pointe vers une question inexistante, un identifiant de règle en double, un signe d'alerte sans conséquence déclarée — est refusée au démarrage plutôt que découverte en production.

### Ce qui arrête l'arbre immédiatement

Huit signes de danger généraux, repris du protocole PCIME communautaire — la prise en charge intégrée des maladies de l'enfant — interrompent le parcours dès qu'ils sont reconnus : convulsions, inconscience ou somnolence anormale, impossibilité de boire ou de téter, vomissement de tout ce qui est avalé, respiration très difficile, nuque raide, saignement abondant, corps très froid ou brûlant. Un seul suffit ; il n'y a pas de seuil à atteindre, pas de deuxième signe à attendre. L'arbre s'arrête, le niveau passe à 4 et plus aucune question n'est posée. La liste complète, avec la conduite à tenir, est publiée sur la [page consacrée aux signes de danger](/urgence).

## L'échelle de gravité de 0 à 4, du point de vue du citoyen

Un niveau abstrait n'aide personne. Chaque niveau est donc traduit en trois éléments concrets : un délai, une destination et une date de rappel. Ces correspondances sont des tables fixes, pas des appréciations.

| Niveau | Ce que cela veut dire | Délai annoncé | Destination | Rappel de suivi |
|---|---|---|---|---|
| 0 | Soins possibles à la maison | Aucun déplacement nécessaire | Domicile, avec fiches de conseils | 7 jours |
| 1 | Surveillance à domicile | Sous 72 heures si rien ne change | Relais communautaire | 72 heures |
| 2 | Consultation nécessaire | Dans les 24 heures | Centre de santé | 24 heures |
| 3 | Consultation le jour même | Aujourd'hui | Centre de santé | 6 heures |
| 4 | Urgence | Immédiatement, sans attendre | Structure d'urgence la plus proche | 2 heures |

Trois conséquences méritent d'être soulignées.

D'abord, **le service n'a pas de niveau « probablement rien »**. En l'absence d'informations suffisantes, il ne redescend pas vers le bas de l'échelle : la situation est marquée comme information insuffisante et un humain est sollicité.

Ensuite, **les autres signaux ne peuvent que relever le niveau, jamais l'abaisser**. Une grossesse, un nourrisson, une confiance de transcription basse, une divulgation de violence : chacun de ces éléments peut faire monter la gravité d'un cran. Aucun ne peut la faire descendre. Seule une personne habilitée peut corriger un niveau vers le bas, et seulement avec un motif écrit.

Enfin, **le niveau 4 déclenche autre chose qu'un texte**. Un message d'urgence enregistré à l'avance dans les cinq langues du programme est prononcé, la structure de santé connue la plus proche est nommée quand l'annuaire en contient une, et un cas est ouvert avec une alerte vers un humain. Ce mécanisme est décrit en détail dans l'article sur [l'escalade vers les relais communautaires](/blog/escalade-relais-communautaires).

## Deux questions de clarification, au maximum

La tentation, quand un arbre a besoin de dix réponses, est de poser dix questions. Sur un appel vocal à deux dollars de crédit, depuis un téléphone partagé, c'est le meilleur moyen de faire raccrocher la personne avant la fin.

La règle retenue est donc dure : **deux questions de clarification par tour, pas une de plus**. Quand l'arbre a besoin de davantage, il s'arrête, renvoie ce qu'il sait, et laisse le tour suivant continuer avec les réponses déjà collectées. Trois principes rendent cette limite tenable.

1. **Les réponses évidentes ne sont pas demandées.** Une extraction déterministe lit d'abord la durée, l'âge, la grossesse, les symptômes et les signes de danger directement dans ce que la personne a dit, dans les cinq langues. Ce qui a déjà été entendu n'est pas redemandé.
2. **Les questions facultatives ne bloquent jamais.** Seules les questions dont dépend un embranchement retiennent le parcours.
3. **Une urgence n'attend pas une clarification.** Dès que le niveau 4 est atteint, la question en attente est abandonnée : la personne reçoit l'instruction de partir, pas un questionnaire.

Cette économie de questions a un coût assumé : le service travaille souvent avec une information partielle. C'est précisément pourquoi il ne rassure pas par défaut.

## Ce que le citoyen reçoit vraiment

À la fin d'un tour de triage, la personne reçoit un message parlé dans sa langue, court, et construit dans un ordre fixe :

- **L'action d'abord** : « allez au centre de santé aujourd'hui », « surveillez à la maison pendant deux jours », « partez maintenant, ne restez pas à la maison ».
- **Le délai et la destination**, tirés des tables ci-dessus, avec le nom de la structure la plus proche quand il est connu — et, quand il ne l'est pas, une phrase qui le dit franchement plutôt qu'une invention.
- **Une explication brève**, plafonnée à soixante mots, produite par le modèle à partir du texte d'orientation et des documents approuvés.
- **Ce qui doit faire partir immédiatement**, c'est-à-dire les signes de danger, rappelés à chaque niveau inférieur à 4.
- **Un avertissement constant** : ce service oriente et informe, il ne remplace pas un agent de santé.

Trois filtres passent ensuite sur ce texte avant qu'il ne soit prononcé. Une recommandation qui ne s'appuie sur aucun document approuvé est remplacée par un texte de repli qui oriente vers le centre de santé — et l'incident est enregistré comme une violation de contrat. Toute phrase qui ressemble à une posologie chiffrée ou à un diagnostic est supprimée. Enfin, une situation de niveau 3 ou 4, une source manquante ou une confiance très basse sur un cas déjà sérieux imposent une revue humaine.

## Rendre le triage auditable : ce qui est enregistré

Un service qui oriente des personnes vers des soins doit pouvoir montrer son travail. Pour chaque tour de triage, la plateforme conserve :

- l'identifiant et la version de l'arbre utilisé, ainsi que les identifiants des règles déclenchées ;
- les réponses collectées et le chemin réellement parcouru dans l'arbre ;
- le niveau retenu, la bande de risque, le délai et la destination ;
- les documents cités, vérifiés comme approuvés avant d'être retenus ;
- un vecteur de confiance à cinq dimensions — transcription, langue, intention, complétude des réponses, couverture documentaire — et non un score unique qui masquerait la dimension faible ;
- la langue, la province, l'heure, l'acteur, et si une revue humaine a été exigée.

C'est cette trace qui permet de mesurer autre chose que la satisfaction : le taux de correction humaine par arbre, les règles qui se déclenchent le plus, les langues où la confiance de transcription s'effondre. Les organisations internationales qui documentent le triage communautaire, à commencer par [l'Organisation mondiale de la santé](https://www.who.int/), insistent sur ce point : ce qui n'est pas mesuré n'est pas amélioré. Les travaux publiés sur les agents de santé communautaires, notamment ceux recensés par [l'UNICEF](https://www.unicef.org/), montrent aussi que la qualité d'un dispositif tient moins à l'outil qu'à la boucle de supervision qui l'entoure.

## Ce que ce cadre ne fait pas

Publier les limites fait partie du dispositif. Aujourd'hui :

- **Aucun protocole n'est cliniquement approuvé.** Tous portent la mention « en attente du comité de revue clinique », comme les documents de référence qui les soutiennent. Le service fonctionne, mais il fonctionne sous réserve.
- **Ce n'est pas un service d'urgence.** Devant un signe de danger, il faut partir vers la structure de santé la plus proche immédiatement, sans passer par le service. Cette phrase est répétée dans chaque réponse et sur la [page des questions fréquentes](/aide).
- **L'annuaire des structures est incomplet.** Quand aucune structure n'est connue pour la zone, le service le dit au lieu d'en inventer une.
- **Le triage ne soigne pas.** Il oriente vers quelqu'un qui soigne. Sans relais communautaires en nombre suffisant et sans centres de santé approvisionnés, une bonne orientation reste une orientation sans effet.
- **Les traductions des textes d'orientation sont des versions de travail**, en attente de relecture par des locuteurs natifs, pour le kikongo et le tshiluba en particulier — un sujet traité dans le guide sur [l'IA vocale en langues congolaises](/blog/ia-vocale-langues-congolaises).

Parler d'IA et triage en santé communautaire, c'est donc d'abord parler de discipline : écrire les règles avant d'écrire les prompts, versionner ce qui décide, enregistrer ce qui a été fait, et dire clairement où s'arrête la compétence de la machine. Le détail de l'offre est décrit sur la page des [services de santé, d'agriculture et d'éducation](/services).
