---
slug: cout-par-interaction-acu
title: "Coût par interaction : une unité, pas des jetons"
description: "Le coût par interaction se mesure en unités de calcul normalisées, inscrites dans un registre par module et par langue, avec plafond mensuel et mode scripté."
lang: fr
category: Financement et transparence
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: comptabilité technique et transparence budgétaire
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture du comportement en mode scripté
keywords: [coût par interaction, unité de calcul, plafond mensuel, mode scripté, transparence budgétaire]
entities: [unité de calcul, registre, plafond, table de conversion, financeur, module, langue, relevé mensuel]
tags: [Financement, Gouvernance, Transparence, Architecture, RDC]
imageAlt: "Registre des appels d'intelligence artificielle agrégé par module, par langue et par canal, avec le plafond mensuel"
takeaways:
  - "Chaque appel d'intelligence artificielle est converti en une unité de calcul normalisée et inscrit dans un registre, attribué au financeur, au module, à la langue et au canal."
  - "La table de conversion vit en base de données : elle se corrige sans redéploiement quand les tarifs d'un fournisseur changent."
  - "Un financeur fixe un plafond mensuel ; à 80 %, 95 % et 100 %, une alerte part une seule fois par seuil et par mois."
  - "Au plafond, l'IA non urgente passe en mode scripté ; les urgences ne sont jamais dégradées."
  - "Le prix d'une unité est aujourd'hui une valeur de référence configurée, pas un coût mesuré à l'échelle : le registre est en place, la mesure viendra du volume."
faq:
  - q: "Pourquoi ne pas simplement compter les jetons facturés par le fournisseur ?"
  - a: "Parce qu'un jeton n'est pas comparable d'un fournisseur à l'autre, ni d'une capacité à l'autre. Une minute de transcription, une image analysée et mille jetons de rédaction n'ont aucune unité commune chez les prestataires. Un financeur a besoin d'une grandeur stable dans le temps, qui ne change pas parce que la plateforme a basculé d'un fournisseur vers un autre."
  - q: "Que se passe-t-il exactement quand le plafond mensuel est atteint ?"
  - a: "L'intelligence artificielle non urgente s'arrête : le service répond avec des textes relus et des menus, sans appel à un modèle. La détection des signes de danger, le script d'urgence et l'orientation vers une structure de santé continuent de fonctionner intégralement. Un plafond budgétaire ne doit jamais pouvoir couper une urgence."
  - q: "Le coût par interaction annoncé est-il un coût réel ?"
  - a: "Non, et c'est une distinction importante. Le registre compte réellement les unités consommées ; leur conversion en dollars repose sur une valeur de référence inscrite dans la configuration. Tant que le pilote n'a pas tourné à l'échelle, le chiffre monétaire est une projection fondée sur une consommation réelle, pas une facture observée."
  - q: "La comptabilité peut-elle ralentir ou interrompre une réponse au citoyen ?"
  - a: "Non. L'écriture au registre ne lève jamais d'erreur : en cas d'échec, l'incident est journalisé et la réponse continue. Une ligne de comptabilité manquante est un problème de gestion ; une réponse de santé perdue est un problème de santé. L'ordre de priorité est inscrit dans le code."
  - q: "Un bailleur peut-il vérifier ces chiffres ?"
  - a: "Oui. Le relevé mensuel détaille la consommation par capacité, par module et par langue, avec le nombre d'interactions distinctes et la table de conversion utilisée pour la période. Il peut être exporté et recoupé avec les factures des fournisseurs."
sources:
  - label: "Banque mondiale — économie numérique et prestation de services publics"
  - url: "https://www.worldbank.org/"
  - label: "OCDE — financement du développement et redevabilité"
  - url: "https://www.oecd.org/"
related: [independance-fournisseurs-ia, mode-degrade-securite-sans-reseau, journal-audit-chaine-verifiable]
---

La question qu'un ministère ou un bailleur pose en deuxième, juste après « est-ce que ça marche ? », est toujours la même : combien coûte une conversation ? Elle est légitime et elle est piégeuse, parce que la réponse naïve — additionner les factures des fournisseurs — ne produit aucun chiffre utilisable pour décider. Le **coût par interaction** doit être une grandeur stable, attribuable et vérifiable, ou il ne sert qu'à faire une diapositive.

Cet article décrit la comptabilité technique du programme : ce qui est compté, comment, où c'est inscrit, ce que cela déclenche au plafond, et ce que ce chiffre ne dit pas encore.

## Pourquoi ne pas compter les jetons des fournisseurs

Un service vocal multilingue consomme quatre choses très différentes : de la rédaction de texte, de la transcription de parole, de la synthèse vocale et de l'analyse d'image. Chacune se facture dans une unité propre, chez chaque prestataire, et aucune n'est comparable aux autres.

Trois problèmes rendent la facture brute inexploitable pour un financeur.

- **Elle n'est pas stable.** Un basculement automatique vers un autre fournisseur, décrit dans l'article sur l'[indépendance des fournisseurs](/blog/independance-fournisseurs-ia), change l'unité de facturation sans rien changer au service rendu au citoyen.
- **Elle n'est pas attribuable.** Une facture globale ne dit pas combien a coûté la santé par rapport à l'agriculture, ni le lingala par rapport au français, ni le serveur vocal par rapport à WhatsApp. Ce sont précisément les arbitrages qu'un programme doit pouvoir faire.
- **Elle n'est pas prévisible.** Un plafond budgétaire exprimé en dollars de facture ne peut pas être appliqué au moment de l'appel, alors qu'un plafond exprimé dans une unité interne peut l'être.

D'où la décision structurante : la plateforme compte dans une **unité de calcul** normalisée, la même pour toutes les capacités et tous les fournisseurs. Les institutions sont suivies et plafonnées dans cette unité, jamais dans les jetons d'un prestataire.

## La table de conversion, et pourquoi elle vit en base de données

Une unité commune n'a de sens que si la conversion est explicite. Elle est donc écrite dans une table de conversion unique, consultable, avec des valeurs par défaut lisibles.

| Capacité | Ce qui est mesuré | Conversion par défaut |
|---|---|---|
| Compréhension et rédaction | Jetons entrants et sortants | 1 unité pour 1 000 jetons, pondérée par modèle |
| Reconnaissance de la parole | Durée de l'audio | 0,5 unité par minute |
| Synthèse vocale | Caractères prononcés | 0,1 unité pour 1 000 caractères |
| Analyse d'image | Nombre d'images | 2 unités par image, plus les jetons de description |

La pondération par modèle est le détail qui évite une illusion comptable : mille jetons produits par un modèle de pointe ne coûtent pas ce que coûtent mille jetons d'un petit modèle. Le facteur va de 0,05 pour le composant hors ligne — qui ne consomme rien chez personne — à 3 pour le modèle le plus lourd. Un programme qui ne pondère pas croit économiser en réduisant le nombre d'appels alors qu'il a changé de modèle.

Cette table n'est pas figée dans le code. Elle est stockée en base, sous une clé de configuration, et un administrateur peut la corriger sans redéploiement lorsqu'un fournisseur modifie ses tarifs. Le code n'embarque que les valeurs par défaut, utilisées telles quelles si la base est indisponible — une dégradation silencieuse serait pire qu'une valeur connue.

Un dernier point, moins visible et important pour l'audit : le calcul d'une unité est une fonction pure. Elle ne lit ni base, ni réseau, ni horloge, ce qui veut dire qu'elle est testée ligne par ligne sans infrastructure, et qu'un désaccord sur un montant se tranche en rejouant l'entrée.

## Le registre : chaque appel attribué à un module et à une langue

Chaque appel d'intelligence artificielle produit une ligne de registre. Cette ligne porte le financeur, l'organisation, l'interaction concernée, le module, la langue, le canal, la capacité appelée, le fournisseur qui a effectivement répondu, les unités brutes mesurées et les unités de calcul obtenues après conversion.

Quand l'appelant ne connaît pas le financeur — ce qui arrive, parce qu'un agent technique ne raisonne pas en termes de budget — l'attribution est reconstituée depuis l'interaction, puis depuis le compte de la personne. Une ligne non attribuée est une ligne qui ne servira à aucune décision.

Deux conséquences se lisent immédiatement dans les agrégats.

1. **Le coût par interaction devient comparable.** On divise les unités consommées par le nombre d'interactions distinctes de la période, par module et par langue. Les écarts entre langues apparaissent — une langue moins bien reconnue entraîne plus de reformulations, donc plus d'appels — et ils deviennent un objet de travail plutôt qu'une intuition.
2. **La fiabilité réelle des fournisseurs devient mesurable.** Le registre nomme le fournisseur qui a répondu, pas celui qui était prévu. On sait donc combien de fois la chaîne a basculé, et à quel coût.

Le relevé mensuel est l'agrégat de ce registre, découpé selon trois axes à la fois : par capacité, pour voir où part la consommation ; par module, pour distinguer la santé de l'agriculture et de l'éducation ; par langue, pour voir ce que coûte réellement le service dans chacune des cinq langues. Le nombre d'interactions distinctes de la période y figure à côté des unités, parce que l'un sans l'autre ne permet aucune comparaison entre deux mois de volumes différents. La table de conversion effectivement appliquée est jointe au relevé : un chiffre dont on ne connaît pas la règle de calcul n'est pas vérifiable, et un relevé doit rester lisible un an plus tard, quand les tarifs auront changé.

Un choix d'ingénierie mérite d'être souligné parce qu'il dit la priorité du programme : l'écriture au registre ne lève jamais d'exception. Si la base est momentanément indisponible, l'échec est journalisé et la réponse au citoyen continue son chemin. La comptabilité est importante ; elle n'est pas plus importante qu'une réponse sur un enfant fiévreux.

## Que se passe-t-il quand un plafond mensuel est atteint ?

Un plafond qui n'a pas de comportement défini n'est pas un plafond, c'est une inquiétude. Celui-ci en a un, et il est volontairement prévisible.

Chaque financeur peut fixer un plafond mensuel exprimé en unités de calcul. Le calendrier retenu est le mois civil en temps universel, pour que deux relevés produits dans deux fuseaux donnent le même résultat. Un balayage régulier compare la consommation au plafond et déclenche une alerte à 80 %, 95 % et 100 %.

Ces alertes sont émises **une seule fois par seuil et par mois**. C'est une leçon d'exploitation plutôt qu'un raffinement : une alerte répétée toutes les heures est une alerte que l'on finit par filtrer, et un seuil franchi doit rester visible. Chaque franchissement est aussi un événement enregistré, donc consultable après coup dans le [journal d'audit](/blog/journal-audit-chaine-verifiable).

Au plafond, le comportement est celui du **mode scripté** : les appels d'intelligence artificielle non urgents cessent, et le service répond avec des protocoles relus, des menus et des règles déterministes. Les urgences, elles, ne sont jamais dégradées. La détection des signes de danger, le message d'urgence dans les cinq langues et l'orientation vers une structure de santé sont exécutés par la plateforme elle-même, sans modèle, comme le décrit l'article sur le [mode dégradé](/blog/mode-degrade-securite-sans-reseau).

Le plafond s'applique par financeur et non globalement, ce qui permet à plusieurs institutions de cohabiter sur la même plateforme sans qu'un dépassement de l'une dégrade le service de l'autre. Un ministère, une organisation non gouvernementale et un programme provincial peuvent donc avoir des enveloppes, des seuils et des comportements distincts, tout en partageant la même infrastructure et les mêmes règles de sécurité.

Cette asymétrie est le cœur du dispositif. Un plafond budgétaire peut légitimement réduire la qualité de la conversation libre ; il ne peut pas être une raison de ne pas dire à une mère de partir immédiatement au centre de santé.

## Ce que le coût par interaction ne dit pas encore

Il faut ici être précis, parce que c'est le point où un document de programme glisse facilement vers une affirmation qu'il ne peut pas tenir.

- **La valeur monétaire d'une unité est une référence, pas une facture.** Elle est inscrite dans la configuration et sert à exprimer la consommation en monnaie. Les unités sont réellement comptées ; leur traduction en dollars reste une projection jusqu'à ce que le volume du pilote permette de la recouper avec les factures reçues.
- **Le coût complet n'est pas le coût d'inférence.** L'hébergement, les terminaisons téléphoniques, les frais d'envoi de messages, la rémunération des locuteurs qui corrigent les transcriptions et le temps des agents de santé ne passent pas par ce registre. Les additionner relève du budget du programme, publié sur la [page de financement](/financement), pas de cette comptabilité technique.
- **Un coût moyen cache une distribution.** Une conversation d'urgence coûte plus qu'une question sur un calendrier scolaire. Présenter une moyenne sans la distribution par module serait une simplification trompeuse pour un financeur qui veut dimensionner une campagne.
- **La durée de synthèse vocale est encore approchée.** Lorsque la longueur réelle du texte prononcé n'est pas remontée par la capacité appelée, une valeur moyenne est utilisée. C'est documenté dans le code à l'endroit même du calcul, pour que personne ne prenne cette ligne pour une mesure.

Dire ces quatre choses coûte une diapositive flatteuse et gagne une discussion sérieuse. Les travaux de la [Banque mondiale](https://www.worldbank.org/) sur la prestation numérique de services publics insistent sur le même point : un chiffre de coût unitaire sans son périmètre n'est pas comparable, et sert surtout à construire des promesses non tenables.

## Pourquoi cette comptabilité change la conversation avec un financeur

Vue depuis un bailleur, l'intérêt n'est pas l'élégance du registre. Il est dans trois capacités concrètes que la plupart des programmes n'ont pas.

La première est le plafonnement réel. Un engagement budgétaire peut être traduit en plafond technique appliqué par la plateforme, avec un comportement connu à l'avance au moment où il est atteint. C'est très différent d'une estimation accompagnée d'un espoir.

La deuxième est l'attribution. Un financement destiné à la santé maternelle dans deux provinces peut être suivi sur sa propre ligne, par module et par langue, et distingué du reste du trafic. La redevabilité réclamée par les cadres de financement, tels que les décrit l'[OCDE](https://www.oecd.org/) pour l'aide au développement, demande exactement cela : savoir ce que l'argent a payé, pas seulement ce qu'il a financé.

La troisième est la négociation. Une institution qui connaît sa consommation par capacité négocie ses contrats de fourniture sur des chiffres mesurés chez elle. Associée à la possibilité de retirer un fournisseur par simple configuration, cette connaissance déplace le rapport de force vers l'acheteur public.

Il reste une quatrième conséquence, moins confortable et assumée : une comptabilité fine rend visibles des écarts que personne n'aime montrer. Le coût par interaction n'est pas le même dans toutes les langues, et il est plus élevé là où la reconnaissance vocale est la moins mûre — c'est-à-dire précisément dans les langues nationales que ce programme existe pour servir. Ce constat alimente le travail décrit dans l'article sur les [seuils de confiance](/blog/seuils-de-confiance-abstention) et les priorités de collecte de corpus, plutôt que de rester une anomalie dans un tableau.

Un service public financé par l'argent public et philanthropique doit pouvoir répondre à « combien » avec la même rigueur qu'à « est-ce que c'est sûr ». Les règles de [gouvernance](/gouvernance) imposent la seconde ; ce registre rend la première vérifiable.
