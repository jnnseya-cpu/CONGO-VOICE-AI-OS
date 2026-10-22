---
slug: rapports-institutionnels-denominateurs
title: "Rapports institutionnels : des chiffres avec leur base"
description: "Neuf rapports institutionnels, chacun livré avec ses définitions, ses dénominateurs publiés, la fraîcheur des données et la suppression des petits effectifs."
lang: fr
category: Financement et transparence
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: production statistique et redevabilité
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des définitions sanitaires et des dénominateurs
keywords: [rapports institutionnels, suppression des petits effectifs, dénominateurs publiés, finalité d'export, expiration des liens]
entities: [rapport, dénominateur, définition, suppression, province, zone de santé, bailleur, export]
tags: [Transparence, Gouvernance, Financement, Santé, RDC]
imageAlt: "Extrait d'un rapport institutionnel avec ses définitions, ses dénominateurs et la mention de suppression des petits effectifs"
takeaways:
  - "Neuf rapports, du quotidien d'exploitation au trimestriel de programme, chacun avec son public et sa finalité écrite."
  - "Chaque chiffre publié est accompagné de sa définition et de son dénominateur : sans base de calcul, un pourcentage n'est pas une information."
  - "Tout effectif inférieur à cinq est masqué, pour qu'un tableau par territoire ne permette pas de ré-identifier une famille."
  - "Un export est asynchrone, codé par finalité, audité, et son lien expire au bout de sept jours — le fichier est supprimé en même temps."
  - "Les rapports décrivent les usagers du service, jamais la population générale, et le disent explicitement dans leurs dénominateurs."
faq:
  - q: "Pourquoi masquer les effectifs inférieurs à cinq ?"
  - a: "Parce qu'un tableau croisant un motif de consultation, un territoire et une semaine peut désigner une seule famille. Dans un village, « un cas de santé maternelle » est une information nominative déguisée en statistique. Le seuil de cinq est la pratique courante en statistique sanitaire, et il est appliqué avant publication, pas après une plainte."
  - q: "Ces chiffres mesurent-ils la santé de la population ?"
  - a: "Non, et chaque rapport l'écrit dans ses dénominateurs : les chiffres décrivent les personnes qui ont utilisé le service, pas la population générale. Une hausse des signalements de paludisme dans une province peut traduire une épidémie, une campagne de sensibilisation réussie ou une amélioration du réseau mobile. Confondre les trois produirait des décisions coûteuses."
  - q: "Pourquoi un rapport n'est-il pas disponible immédiatement ?"
  - a: "Parce qu'un rapport trimestriel national n'est pas une requête mais un travail de fond. Il est donc mis en file, exécuté, stocké, puis signalé à son demandeur. Ce fonctionnement évite aussi qu'un export lourd dégrade le temps de réponse du service aux citoyens."
  - q: "Pourquoi les liens de téléchargement expirent-ils ?"
  - a: "Parce qu'un fichier contenant des données sanitaires agrégées ne doit pas circuler indéfiniment dans des boîtes de courriel. Au bout de sept jours, le lien est refusé et l'objet stocké est supprimé. Un nouvel export est toujours possible, et il sera de nouveau audité au nom de celui qui le demande."
  - q: "Un partenaire peut-il obtenir les données brutes ?"
  - a: "Non. Un partenaire obtient des rapports agrégés, soumis à la suppression des petits effectifs, avec une finalité d'export enregistrée. Les transcriptions et les dossiers individuels relèvent du droit d'accès de la personne concernée, pas d'un export institutionnel."
sources:
  - label: "Organisation mondiale de la santé — systèmes d'information sanitaire"
  - url: "https://www.who.int/"
  - label: "OCDE — financement du développement et redevabilité"
  - url: "https://www.oecd.org/"
related: [cout-par-interaction-acu, journal-audit-chaine-verifiable, protection-donnees-personnelles]
---

Un programme national est jugé sur ses chiffres, et c'est précisément pour cela qu'ils sont dangereux. Un pourcentage sans dénominateur, une hausse sans période de référence, un tableau par territoire assez fin pour désigner un ménage : chacun de ces défauts transforme une statistique en instrument de mauvaise décision. Les **rapports institutionnels** du programme sont donc construits avec les mêmes exigences que le reste de la plateforme : définitions explicites, bases de calcul publiées, règles de protection appliquées avant publication.

## Neuf rapports, et pour qui chacun est fait

Le catalogue est fermé et nommé. Un rapport n'est pas une requête improvisée dans un tableau de bord : c'est un objet dont le public, la cadence, la fenêtre et la finalité sont écrits.

| Rapport | Cadence | Public | Ce qu'il sert à décider |
|---|---|---|---|
| Utilisation quotidienne | Jour | Équipe d'exploitation | Volume, canaux, langues, disponibilité |
| Tendances santé | Semaine | Ministère de la Santé, zones de santé | Hausses de motifs et urgences par province |
| Risques agricoles | Semaine | Ministère de l'Agriculture, inspections | Foyers de maladies, visites de terrain |
| Appui à l'apprentissage | Semaine | Ministère de l'EPST, écoles | Notions demandées, apprenants en difficulté |
| Activité régionale | Mois | Gouvernorats, direction du programme | Charge et délais entre provinces |
| Impact des partenaires | Mois | ONG et bailleurs | Cas traités, résultats, suivi effectif |
| Programme trimestriel | Trimestre | Gouvernement, comité de pilotage | Couverture, qualité de service, délais |
| Performance de l'IA | Mois | Comité technique et de sécurité | Confiance, corrections humaines, échecs |
| Coûts et consommation | Mois | Direction financière | Unités consommées, coût par interaction, plafond |

Le découpage n'est pas administratif, il est fonctionnel : chaque ligne correspond à une décision que quelqu'un doit réellement prendre. Un rapport que personne n'utilise pour décider est un rapport que personne ne vérifie, et un chiffre non vérifié finit par être faux.

Le dernier de la liste est celui qui relie cette production statistique à la comptabilité technique décrite dans l'article sur le [coût par interaction](/blog/cout-par-interaction-acu). Les **rapports institutionnels** du programme partagent donc la même source que son budget : il n'existe pas deux vérités, une pour les bailleurs et une pour l'exploitation.

## Pourquoi un chiffre sans dénominateur est inutilisable

C'est la règle la plus simple et la plus souvent violée dans les documents de programme. « 62 % des cas ont été escaladés » ne veut rien dire tant qu'on ne sait pas sur quoi porte le pourcentage : toutes les interactions, les seules interactions de santé, les seuls cas ouverts, ou les seuls cas de la province concernée.

Chaque rapport porte donc, en clair et dans le fichier lui-même, trois éléments.

- **Ses définitions.** Ce qu'est une interaction, un cas, une escalade, un utilisateur actif, un motif, un signe de danger, un foyer. Ces définitions sont les mêmes d'un rapport à l'autre, écrites une fois et réutilisées, de sorte que deux rapports ne peuvent pas compter deux choses différentes sous le même mot.
- **Ses dénominateurs publiés.** La base exacte de chaque proportion, y compris la précision qui gêne : « population couverte non estimée : ces chiffres décrivent les usagers, pas la population générale ».
- **La fraîcheur des données.** La période couverte et le moment de production, parce qu'un chiffre de la semaine dernière présenté sans date devient, trois mois plus tard, un chiffre faux cité de bonne foi.

Les recommandations de l'[Organisation mondiale de la santé](https://www.who.int/) sur les systèmes d'information sanitaire insistent sur ce point : la comparabilité vient des définitions, pas de la précision des décimales. Un service qui change discrètement sa définition d'« escalade » entre deux trimestres produit une amélioration qui n'a jamais eu lieu.

Le même raisonnement vaut pour la redevabilité financière, telle que la décrit l'[OCDE](https://www.oecd.org/) : ce qu'un bailleur peut vérifier n'est pas le chiffre, c'est la règle qui l'a produit.

## La suppression des petits effectifs, et ce qu'elle coûte

Un tableau qui croise un motif de consultation, un territoire et une semaine devient très vite une information nominative. Dans un village de quelques centaines d'habitants, « un cas de santé maternelle cette semaine » désigne une personne que tout le monde peut nommer.

La règle appliquée est explicite : **tout effectif inférieur à cinq est masqué**, remplacé par une mention « inférieur à cinq », et la règle elle-même est imprimée dans le rapport. Elle s'applique aux colonnes marquées comme sensibles — nombres de cas, de signalements, de dossiers — et pas aux totaux généraux, qui ne désignent personne.

Cette protection a un coût réel qu'il faut assumer plutôt que dissimuler.

1. **Elle masque parfois le signal utile.** Un début d'épidémie dans une zone peu peuplée commence par de petits nombres. C'est la raison pour laquelle la détection de foyers ne passe pas par les rapports publiés mais par une veille interne, qui alerte un agent sans publier le détail.
2. **Elle rend certaines comparaisons impossibles.** Deux territoires dont les effectifs sont masqués ne peuvent pas être comparés sur ce croisement. La réponse honnête est d'agréger à un niveau supérieur, pas de publier le détail.
3. **Elle est insuffisante seule.** Plusieurs tableaux masqués peuvent, recoupés, laisser déduire un effectif. C'est pourquoi la suppression des petits effectifs accompagne les autres mesures décrites dans l'article sur la [protection des données personnelles](/blog/protection-donnees-personnelles), plutôt que de les remplacer.

Un programme qui publie des tableaux fins sans cette règle finit par exposer les familles qu'il sert, et il ne s'en aperçoit qu'une fois le fichier diffusé.

## Pourquoi un export est asynchrone, daté et périssable

Produire un rapport trimestriel national n'est pas une opération de requête-réponse. Elle est donc traitée comme un travail : mise en file, exécution, stockage du fichier, notification du demandeur.

Ce choix a un effet secondaire précieux : un export lourd ne dégrade pas le temps de réponse du service rendu aux citoyens. Une exportation statistique et une question de santé ne doivent pas se disputer les mêmes ressources au même instant.

Chaque fichier produit porte ensuite trois propriétés.

- **Il est codé par finalité.** La raison de l'export est enregistrée avec lui.
- **Il est audité.** Qui l'a demandé, avec quel rôle, à quelle date et pour quelle finalité — une ligne de plus dans le [journal d'audit en chaîne](/blog/journal-audit-chaine-verifiable).
- **Il expire au bout de sept jours.** Le lien est refusé après ce délai et l'objet stocké est supprimé en même temps. L'**expiration des liens** n'est pas une contrainte technique : c'est la reconnaissance qu'un fichier de données sanitaires agrégées circule, est transféré, oublié dans une boîte de courriel, et qu'un lien permanent est une fuite à retardement.

Trois formats sont produits selon l'usage : un document mis en page pour la diffusion institutionnelle, un classeur pour l'analyse, un fichier de valeurs séparées pour l'intégration dans un autre système. Le contenu est identique ; seule la présentation change, de sorte qu'un chiffre ne puisse pas différer d'un format à l'autre.

## Les trois rapports que les équipes consultent vraiment

Un catalogue de neuf rapports donne une impression d'exhaustivité ; l'usage réel est plus concentré, et il est utile de dire lesquels portent les décisions.

Le rapport d'utilisation quotidien est l'outil d'exploitation. Il répond à une question d'ingénieur : le service a-t-il fonctionné hier, sur quels canaux, dans quelles langues, avec combien d'échecs techniques et quelle latence moyenne. C'est lui qui révèle qu'un opérateur a coupé une passerelle de messages pendant six heures, ou qu'une langue a brusquement cessé d'être reconnue. Sans ce rapport, un incident se découvre par une plainte, c'est-à-dire plusieurs jours trop tard.

Le rapport de tendances santé est l'outil de pilotage sanitaire. Il montre les motifs de consultation par province et par zone de santé, le nombre de signes de danger détectés, le nombre d'orientations vers une structure et le taux correspondant. Sa valeur ne tient pas à la précision des chiffres mais à leur régularité : une même mesure, produite de la même façon chaque semaine, rend une évolution lisible même si le niveau absolu est imparfait.

Le rapport de performance de l'intelligence artificielle est l'outil de sécurité. Il suit la confiance mesurée, le nombre de corrections apportées par des humains et les échecs techniques — autrement dit, il mesure la fiabilité du système plutôt que son activité. C'est le seul rapport dont une dégradation déclenche une discussion de comité technique plutôt qu'une discussion de volume, et c'est celui qui alimente les décisions de basculement d'une langue en mode scripté.

Les six autres existent parce que des institutions distinctes ont des obligations de compte rendu distinctes. Ils ne sont pas du remplissage : un bailleur ne lit pas un rapport d'exploitation, et une inspection provinciale n'a aucun usage d'un relevé de consommation technique.

## La finalité d'export est une donnée, pas un commentaire

La **finalité d'export** mérite un paragraphe à elle seule, parce qu'elle est souvent traitée comme une formalité.

Dans ce programme, elle est un champ enregistré, pas une case à cocher. Elle répond à la question qu'un contrôleur posera : pourquoi ce fichier existe-t-il ? La limitation des finalités est un principe de protection des données qui n'a de valeur que s'il laisse une trace exploitable — sinon il se réduit à une phrase dans une politique que personne ne peut vérifier.

L'effet pratique est simple. On peut répondre, pour un trimestre donné, à « combien d'exports de données sanitaires ont été produits, par qui, et pour quelles finalités ». Cette réponse est le minimum qu'une autorité de contrôle est en droit d'attendre, et elle n'est possible que si la finalité est une donnée dès le départ.

Une remarque d'expérience sur ce champ : la finalité la plus fréquente n'est pas celle que l'on anticipe en écrivant la politique de données. Ce ne sont pas les grandes revues trimestrielles qui dominent, mais les demandes ponctuelles — une réunion la semaine prochaine, une question d'un partenaire, un chiffre à vérifier avant une présentation. Ce sont exactement les exports que l'on oublie de tracer lorsque la traçabilité dépend de la bonne volonté, et c'est pour cela qu'elle est imposée par le code plutôt que par une consigne interne.

## Ce que ces rapports ne permettent pas de conclure

Quatre limites, pour que ces chiffres soient utilisés correctement.

- **Ils ne mesurent pas la santé d'une population.** Ils mesurent l'usage d'un service. Une hausse peut venir d'une épidémie, d'une campagne de sensibilisation ou d'une meilleure couverture réseau, et seuls des travaux de terrain peuvent trancher.
- **Ils ne valident pas une efficacité clinique.** Que le service oriente correctement vers une structure ne dit rien du résultat sanitaire obtenu. Mesurer cela demande un suivi de cohorte, qui n'existe pas encore et qui ne sera pas affirmé avant d'exister.
- **Ils ne remplacent pas le système national d'information sanitaire.** Le programme produit des signaux précoces et des éléments de pilotage ; l'autorité statistique reste celle de l'État.
- **Ils sont aussi bons que la couverture du service.** Une province où le service est peu connu produit peu de chiffres, et une lecture naïve y verrait peu de besoins.
- **Ils ne disent rien de la qualité d'une réponse individuelle.** Un taux d'orientation élevé peut signifier que le service est prudent, ou qu'il est mal calibré et oriente trop. Cette question se tranche par la relecture clinique d'un échantillon de cas, pas par un agrégat.

Ce que ces **rapports institutionnels** garantissent est donc borné et vérifiable : chaque chiffre a une définition, une base de calcul, une date et une règle de protection — et chaque export a un auteur, une finalité et une durée de vie.
