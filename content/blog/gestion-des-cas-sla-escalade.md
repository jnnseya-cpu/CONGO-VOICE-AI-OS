---
slug: gestion-des-cas-sla-escalade
title: "Gestion des cas : un responsable, une horloge"
description: "La gestion des cas comme machine à états déterministe : ouverture automatique, routage d'affectation, délai de prise en charge et escalade au dépassement."
lang: fr
category: Produit et canaux
cluster: sante
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: parcours de prise en charge et escalade
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des délais de prise en charge et des règles de clôture
keywords: [gestion des cas, délai de prise en charge, routage d'affectation, qualité de clôture, fusion des doublons]
entities: [cas, responsable, horloge, escalade, superviseur, suivi programmé, gravité, clôture]
tags: [Santé, Produit, Gouvernance, Architecture, RDC]
imageAlt: "Cycle de vie d'un cas : ouverture automatique, affectation, délai de prise en charge, escalade, clôture et suivi"
takeaways:
  - "Un cas est l'unité de responsabilité : exactement une file, un responsable et une horloge, à tout instant."
  - "Il s'ouvre automatiquement dès la gravité 2, sous 40 % de confiance, pour une maladie à déclaration obligatoire, ou sur demande explicite d'un humain."
  - "Le délai de prise en charge est codé : quinze minutes en urgence, quatre heures en gravité 3, vingt-quatre heures en gravité 2."
  - "Un dépassement escalade vers le superviseur, notifie et émet un événement : personne n'a à s'en souvenir."
  - "Une clôture exige un résultat, l'action effectuée, la joignabilité de la personne et une décision de suivi — sinon elle est refusée."
faq:
  - q: "Qu'est-ce qui déclenche l'ouverture d'un cas ?"
  - a: "Quatre conditions, toutes déterministes : une gravité égale ou supérieure à 2, une confiance inférieure à 40 %, une maladie animale ou végétale à déclaration obligatoire, ou une demande explicite de parler à un humain. Aucune de ces quatre n'est une appréciation de modèle."
  - q: "Comment un cas trouve-t-il son responsable ?"
  - a: "Par une cascade : le territoire d'abord, puis l'organisation compétente, puis le rôle correspondant au module, puis la personne en service, et enfin la moins chargée. L'affectation est atomique — deux superviseurs ne peuvent pas s'attribuer le même cas, parce que l'écriture compare la version du dossier avant de l'accepter."
  - q: "Que se passe-t-il si personne ne prend le cas à temps ?"
  - a: "L'horloge expire et le cas escalade au superviseur, avec une notification et un événement enregistré. C'est un mécanisme automatique : il ne dépend pas de la vigilance d'une personne un dimanche soir, ce qui est précisément quand il sert."
  - q: "Peut-on abaisser la gravité d'un cas ?"
  - a: "Oui, par un humain, et jamais sans motif écrit d'au moins dix caractères. La modification est inscrite au journal d'audit avec son auteur, l'ancienne et la nouvelle valeur. Un seuil que l'on peut baisser sans trace est un seuil qui finit par être baissé par confort."
  - q: "Pourquoi fusionner les doublons plutôt que les supprimer ?"
  - a: "Parce qu'une personne a pu recevoir un identifiant de dossier, et parce qu'un dossier supprimé efface la preuve qu'il a existé. La fusion conserve les deux identifiants, rattache la chronologie au dossier principal et laisse une trace de l'opération."
sources:
  - label: "Organisation mondiale de la santé — prise en charge intégrée des maladies de l'enfant"
  - url: "https://www.who.int/"
  - label: "Fédération internationale des Sociétés de la Croix-Rouge — agents de santé communautaires"
  - url: "https://www.ifrc.org/"
related: [escalade-relais-communautaires, signes-de-danger-detection-automatique, roles-et-permissions-supervision]
---

Une réponse vocale ne soigne personne. Ce qui soigne, c'est qu'une personne compétente soit prévenue, qu'elle sache de quoi il s'agit, et qu'elle agisse dans un délai utile. C'est la raison d'être du dossier — le *cas* — et c'est la partie du système où une imprécision se paie en santé plutôt qu'en points de performance. La **gestion des cas** du programme est donc une machine à états déterministe : les transitions permises, les horloges, le routage et les conditions de clôture sont du code, jamais une appréciation de modèle.

## Un cas : une file, un responsable, une horloge

La définition est volontairement étroite. À tout instant, un cas appartient à exactement une file, a exactement un responsable et porte exactement une horloge.

Cette unicité n'est pas un choix d'ergonomie, c'est une condition de redevabilité. Un dossier partagé par deux équipes est un dossier dont chacune pense que l'autre s'occupe. La littérature opérationnelle sur les réseaux d'agents de santé communautaires, notamment les retours publiés par la [Fédération internationale des Sociétés de la Croix-Rouge](https://www.ifrc.org/), décrit ce mode d'échec comme le plus fréquent et le plus silencieux : personne n'a refusé de traiter, personne n'a traité.

Le cas porte en outre un niveau de gravité, de 0 à 4, dont la signification est explicite : auto-prise en charge, surveillance, consultation sous vingt-quatre heures, consultation le jour même, urgence immédiate. Ces niveaux viennent des protocoles de prise en charge intégrée des maladies de l'enfant publiés par l'[Organisation mondiale de la santé](https://www.who.int/) et relus par le comité clinique du programme.

## Quatre déclencheurs, aucun laissé au modèle

Un cas s'ouvre automatiquement dans quatre situations, et les quatre sont des conditions vérifiables.

- **Gravité égale ou supérieure à 2.** Autrement dit, dès qu'une consultation est recommandée, un humain est dans la boucle.
- **Confiance inférieure à 40 %.** Le système ne sait pas s'il a compris ; ce n'est pas au citoyen de porter ce doute. Le raisonnement est développé dans l'article sur les [seuils de confiance](/blog/seuils-de-confiance-abstention).
- **Maladie à déclaration obligatoire.** Un problème inscrit sur la liste nationale déclenche un signalement aux services vétérinaires ou phytosanitaires, indépendamment de la gravité perçue.
- **Demande explicite d'un humain.** Une personne qui dit vouloir parler à quelqu'un obtient un dossier, sans négociation.

Le point commun de ces quatre règles est qu'aucune ne dépend du jugement d'un modèle. Un modèle qui se dégrade ne peut donc pas réduire le nombre de cas ouverts : il peut dégrader la qualité du résumé, pas faire disparaître l'escalade.

## Le routage d'affectation, du territoire à la charge

Trouver le bon destinataire est un problème plus difficile qu'il n'y paraît, parce que la bonne réponse change selon ce qui existe réellement sur le terrain. Le **routage d'affectation** suit donc une cascade, du plus précis au plus général.

1. **Le territoire.** Un cas est d'abord local, parce que la prise en charge l'est.
2. **L'organisation.** Lorsqu'une structure est responsable de la zone, le cas lui revient.
3. **Le rôle.** Un cas de santé va vers un agent de santé communautaire, un cas agricole vers un agent agricole, un cas éducatif vers un enseignant — la même table que celle des [rôles et permissions](/blog/roles-et-permissions-supervision).
4. **La personne en service.** Un cas ouvert la nuit ne doit pas attendre le retour d'une personne nommée.
5. **La moins chargée.** À égalité, le cas va vers celui qui en a le moins, parce qu'une file saturée est une file lente.

Un détail technique a une conséquence humaine directe : l'affectation est atomique. L'écriture compare la version du dossier avant de l'accepter, donc deux superviseurs qui cliquent au même instant ne peuvent pas s'attribuer le même cas. Sans cela, le doublon d'affectation se découvre au moment où deux agents se déplacent chez la même famille — ou, plus souvent, quand aucun des deux ne s'y rend.

## Le délai de prise en charge est codé, pas espéré

Chaque niveau de gravité porte une horloge, et ces valeurs sont écrites dans le code plutôt que dans un document.

| Gravité | Signification | Délai de prise en charge | Suivi programmé |
|---|---|---|---|
| 4 | Urgence immédiate | 15 minutes | 2 heures |
| 3 | Consultation le jour même | 4 heures | 24 heures |
| 2 | Consultation sous 24 heures | 24 heures | 72 heures |
| 1 | Surveillance | 72 heures | 7 jours |
| 0 | Auto-prise en charge | Aucune horloge | 7 jours |

Le **délai de prise en charge** mesure le temps accordé pour accuser réception et agir, pas pour résoudre. Cette distinction est importante : un cas de paludisme peut rester ouvert plusieurs jours sans dépassement, à condition que quelqu'un s'en soit saisi dans la fenêtre prévue.

Au dépassement, trois choses se produisent sans intervention humaine : le cas escalade vers le superviseur, une notification part, et un événement est émis. L'automatisme est le point essentiel. Un délai dont le dépassement dépend de la vigilance de quelqu'un est un délai qui est respecté les jours calmes — c'est-à-dire les jours où il ne sert à rien.

Le mécanisme complet d'alerte, avec son accusé de réception obligatoire et sa remontée de niveau, est décrit dans l'article sur l'[escalade vers les relais communautaires](/blog/escalade-relais-communautaires).

## Pourquoi modifier une gravité exige une phrase écrite

Un agent peut abaisser ou relever la gravité d'un cas. C'est nécessaire : il voit la personne, le système ne l'a qu'entendue.

Mais cette modification exige un motif écrit d'au moins dix caractères, et elle est inscrite au journal d'audit avec son auteur, son rôle, l'ancienne et la nouvelle valeur. La contrainte de longueur paraît mesquine ; elle existe parce qu'un champ libre sans minimum se remplit de « ok » et cesse d'informer.

Ce qui est protégé ici n'est pas le chiffre, c'est la possibilité de relire. Une série de minorations de gravité par le même agent, le vendredi en fin de journée, est un signal de surcharge ou de formation insuffisante. Sans motifs écrits, cette série est invisible ; avec eux, elle est lisible dans le [journal d'audit en chaîne](/blog/journal-audit-chaine-verifiable).

## Ce que la table des transitions permet, et refuse

Une machine à états ne sert pas seulement à décrire ce qui peut arriver : elle sert surtout à refuser le reste. La table des transitions du programme est exhaustive, et **tout passage qui n'y figure pas est refusé** — il n'existe pas de chemin « administratif » pour forcer un état.

Chaque transition permise déclare quatre choses, et c'est cette déclaration qui porte la qualité du dispositif.

- **Qui peut la faire.** Les agents de terrain pour la plupart, les superviseurs seuls pour certaines opérations depuis une escalade de niveau supérieur.
- **Si un motif écrit est obligatoire.** Il l'est pour annuler, pour marquer un doublon, pour réattribuer et pour rouvrir un cas résolu.
- **Ce qu'elle fait à l'horloge.** C'est le mécanisme le plus utile et le moins visible : un accusé de réception arrête le compteur, un passage en attente de suivi le met en pause, une reprise le relance là où il s'était arrêté, une escalade le remet à zéro.
- **Si des données de clôture sont exigées.** Seule la clôture l'exige, et elle n'est atteignable que depuis l'état résolu.

La mise en pause de l'horloge mérite un mot, parce qu'elle corrige une injustice courante dans les outils de suivi. Un cas qui attend un rappel de la famille n'est pas un cas en retard ; faire courir le délai pendant cette attente pénalise l'agent pour une indisponibilité qui n'est pas la sienne, et finit par pousser à clore des dossiers pour protéger un indicateur.

Trois états sont terminaux : clos, annulé et doublon. Aucune transition n'en sort. Un dossier clos ne se rouvre donc pas : s'il faut reprendre la personne, un nouveau cas est ouvert, relié à l'ancien. C'est plus lourd qu'une réouverture, et c'est ce qui garantit qu'un dossier ne puisse pas être rouvert et refermé plusieurs fois jusqu'à produire la statistique souhaitée.

Enfin, l'escalade ne boucle pas. Un cas remonte au plus d'un niveau au-dessus de l'escalade ordinaire, vers le superviseur, et depuis cet état seuls les superviseurs peuvent réattribuer ou annuler. Lorsque ce niveau est atteint, quelqu'un doit décider : c'est inconfortable, et préférable à un dossier qui circule.

## La qualité de clôture : quatre réponses obligatoires

Fermer un dossier est l'opération la plus facile à mal faire, parce qu'elle soulage une file. Le programme la rend volontairement exigeante : une clôture est refusée tant que quatre éléments manquent.

- **Le résultat.** Ce qui s'est réellement passé pour la personne.
- **L'action effectuée.** Ce que l'agent a fait, concrètement.
- **La joignabilité.** La personne a-t-elle pu être contactée, et par quel moyen. Un cas « résolu » pour une personne jamais joignable n'est pas résolu, c'est un cas perdu, et les deux ne doivent pas se ressembler dans une statistique.
- **La décision de suivi.** Faut-il revenir vers elle, et quand.

Cette **qualité de clôture** est ce qui donne un sens aux rapports : un taux de résolution calculé sur des clôtures sans contenu mesure la vitesse de la file, pas le service rendu. C'est aussi ce qui alimente le suivi programmé, dont le délai dépend de la gravité initiale : deux heures après une urgence, une semaine après une simple surveillance.

Enfin, les doublons sont fusionnés et jamais supprimés. Les deux identifiants sont conservés, la chronologie est rattachée au dossier principal, et l'opération laisse une trace. Une personne à qui l'on a communiqué un numéro de dossier doit pouvoir le citer six mois plus tard.

## Ce que la gestion des cas ne résout pas

Quatre limites, à énoncer sans détour.

- **Un cas bien routé n'est pas un cas traité.** Si aucun agent n'est disponible dans un territoire, la machine à états produit des escalades, pas des soins. Le dimensionnement humain reste la contrainte principale, et aucun logiciel ne la lève.
- **Une horloge ne crée pas de capacité.** Des délais serrés sur une file saturée produisent surtout des dépassements. Les seuils sont donc revus avec les équipes de terrain, et le taux de dépassement est lu comme un indicateur de charge avant d'être lu comme un indicateur de performance.
- **La joignabilité est le vrai goulet.** Un numéro éteint, partagé ou changé interrompt la chaîne après l'escalade. C'est pourquoi le repli multicanal et le suivi programmé existent, sans pour autant garantir le contact.
- **La clôture reste déclarative.** Ce que l'agent écrit n'est pas vérifié par le système. Seule la relecture d'un échantillon par un superviseur peut le contrôler, et c'est un travail humain que la plateforme organise sans pouvoir le remplacer.

Une dernière conséquence, moins visible, mérite d'être nommée : la machine à états rend les désaccords lisibles. Lorsqu'un agent relève la gravité qu'un protocole avait calculée, ou l'abaisse, l'écart entre la règle et le jugement humain devient une donnée. Accumulé sur quelques centaines de cas, cet écart dit où le protocole est trop prudent, où il est trop permissif, et où une formation manque. C'est le matériau de travail du comité clinique, et il n'existe que parce que chaque modification laisse une phrase et une trace. Un système qui laisse modifier librement ne produit aucun apprentissage ; un système qui interdit de modifier produit du contournement.

Ce que cette machine garantit tient en une phrase : tout cas a un responsable, une horloge et une trace, et devant un signe de danger la [conduite à tenir](/urgence) est transmise avant même que le dossier n'existe.
