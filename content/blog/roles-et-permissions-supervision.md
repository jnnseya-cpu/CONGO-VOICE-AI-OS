---
slug: roles-et-permissions-supervision
title: "Rôles et permissions : qui voit quoi, et pourquoi"
description: "Les rôles et permissions du programme : sept rôles, vingt-cinq permissions, une portée par module, et une supervision humaine qui ne dépend pas de la bonne volonté."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: contrôle d'accès et supervision humaine
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des droits de signature clinique
keywords: [rôles et permissions, portée par module, supervision humaine, révocation de session, authentification à deux facteurs]
entities: [rôle, permission, portée, comité de revue, verrouillage, révocation, agent de santé communautaire, administrateur]
tags: [Gouvernance, Sécurité, Conformité, Architecture, RDC]
imageAlt: "Tableau des sept rôles du programme et des permissions associées, avec la portée par module"
takeaways:
  - "Sept rôles, vingt-cinq permissions nommées, déclarées dans un seul fichier : une route ne contient jamais un test de rôle écrit à la main."
  - "Un agent de terrain ne voit que les dossiers de son module : santé, agriculture ou éducation, jamais les trois."
  - "Détenir la permission de signer une décision clinique ne suffit pas à signer : l'appartenance au comité est vérifiée séparément."
  - "Les comptes d'administration exigent une authentification à deux facteurs, avec une re-vérification toutes les quinze minutes pour les actions sensibles."
  - "Un changement de rôle ou une suspension invalide immédiatement les sessions en cours, sans attendre leur expiration."
faq:
  - q: "Pourquoi déclarer les permissions au lieu de tester le rôle dans chaque route ?"
  - a: "Parce qu'un test de rôle écrit à la main dans une route est invisible depuis l'extérieur. Avec une table unique, on peut répondre à la question « qui peut exporter un rapport ? » en lisant un fichier, et un audit n'a pas besoin de parcourir deux cents routes pour reconstituer la réponse."
  - q: "Une organisation partenaire peut-elle modifier un dossier de santé ?"
  - a: "Non. Le rôle partenaire donne la lecture des dossiers, les tableaux de bord et l'export de rapports, mais ni l'écriture, ni l'affectation, ni l'escalade. Une organisation qui finance ou évalue un programme n'a pas à pouvoir changer la conduite d'un cas."
  - q: "Que se passe-t-il si l'on retire son rôle à un agent ?"
  - a: "Ses sessions en cours cessent de fonctionner à la requête suivante. Le jeton reste cryptographiquement valide, mais la plateforme compare son horodatage à celui du compte et refuse une session émise avant le changement. Sans cela, un droit retiré resterait actif jusqu'à l'expiration du jeton."
  - q: "Un administrateur peut-il lire les conversations d'un citoyen ?"
  - a: "Un administrateur gouvernemental ou plateforme détient la lecture de toutes les interactions, parce que la supervision d'un service national l'exige. Chaque lecture est inscrite au journal d'audit avec son auteur et sa finalité, et un accès exceptionnel hors de ces droits passe par un accès de secours justifié, borné dans le temps et révocable."
  - q: "Combien de tentatives faut-il pour bloquer un compte ?"
  - a: "Cinq échecs déclenchent un verrouillage de quinze minutes, et chaque série supplémentaire double la durée, jusqu'à un maximum d'un jour. Le comptage se fait par compte et par adresse réseau, parce qu'un code à quatre chiffres ne tient que par la limitation du nombre d'essais."
sources:
  - label: "NIST — Computer Security Resource Center"
  - url: "https://csrc.nist.gov/"
  - label: "Organisation mondiale de la santé — gouvernance des données de santé"
  - url: "https://www.who.int/"
related: [revue-clinique-protocoles-signes, journal-audit-chaine-verifiable, protection-donnees-personnelles]
---

Dans un service public national, la question « qui a le droit de voir ce dossier ? » n'est pas une question d'interface. C'est une question juridique, déontologique et, très concrètement, une question de sécurité pour la personne dont le dossier parle. Les **rôles et permissions** de la plateforme sont donc écrits à un seul endroit, nommés, testés, et contrôlés avant qu'une route ne fasse quoi que ce soit.

Cet article décrit ce modèle, les choix qui le rendent vérifiable, et les quatre choses qu'il ne protège pas.

## Sept rôles, vingt-cinq permissions, une seule table

Le programme reconnaît sept rôles. Chacun correspond à une fonction réelle sur le terrain ou dans l'administration, pas à un niveau de privilège abstrait.

| Rôle | Fonction | Ce qu'il peut faire de particulier |
|---|---|---|
| Citoyen | La personne servie | Poser une question, relire ses propres échanges, donner un avis |
| Agent de santé communautaire | Prise en charge des cas de santé | Lire, écrire, affecter et escalader les cas de santé |
| Agent agricole | Appui aux producteurs | Les mêmes droits, limités à l'agriculture |
| Enseignant | Appui éducatif | Les mêmes droits, limités à l'éducation |
| ONG ou partenaire | Financement, évaluation, appui | Lecture des cas, tableaux de bord, export de rapports |
| Administrateur gouvernemental | Supervision du service national | Lecture de toutes les interactions, audit, diffusion, export |
| Administrateur plateforme | Exploitation technique | En plus : configuration et gestion des comptes |

À ces rôles correspondent vingt-cinq permissions nommées — créer une interaction, lire les siennes, lire toutes les interactions, lire un cas, l'écrire, l'affecter, l'escalader, ouvrir chacun des tableaux de bord, exporter un rapport, lire le journal d'audit, modifier la configuration, gérer les comptes, diffuser une notification, relire et exporter le corpus linguistique, lire, soumettre et signer une revue.

La règle d'ingénierie qui compte ici est négative : **aucune route ne contient de test de rôle écrit à la main.** Chaque point d'entrée de l'interface de programmation déclare la permission qu'il exige, et une couche commune vérifie l'authentification, la permission, la limitation de débit, la journalisation et le traitement des erreurs avant d'exécuter la moindre ligne de logique métier.

Ce choix n'est pas esthétique, il est auditable. Un contrôle réparti dans deux cents routes ne peut pas être vérifié ; une table unique se lit, se teste et se présente à un auditeur. Les recommandations du [Computer Security Resource Center du NIST](https://csrc.nist.gov/) sur le contrôle d'accès fondé sur les rôles insistent sur cette centralisation pour la même raison : ce qui est dispersé n'est pas gouverné.

## Pourquoi un agent de santé ne voit pas les dossiers agricoles

Un rôle seul ne suffit pas à décider. Trois rôles de terrain portent en plus une **portée par module** : l'agent de santé communautaire ne voit que la santé, l'agent agricole que l'agriculture, l'enseignant que l'éducation.

Cette restriction n'est pas une précaution bureaucratique. Un agent de santé qui pourrait parcourir les signalements agricoles d'un territoire y lirait des informations sur les ménages — récoltes perdues, cheptel malade, revenus — qui n'ont aucun rapport avec son mandat et dont la divulgation peut nuire. La minimisation défendue par l'[Organisation mondiale de la santé](https://www.who.int/) dans la gouvernance des données de santé s'applique symétriquement aux autres domaines.

La même table sert à décider qui reçoit une escalade : un cas de santé remonte vers un agent de santé communautaire, un cas agricole vers un agent agricole, un cas éducatif vers un enseignant, et tout le reste vers l'administration. L'[escalade vers les relais communautaires](/blog/escalade-relais-communautaires) repose donc sur la même source de vérité que le contrôle d'accès, et non sur une liste de destinataires maintenue à part — qui aurait divergé dès le premier changement d'organisation.

Un détail révélateur du modèle : le rôle partenaire peut lire les cas et exporter des rapports, mais il ne peut ni les écrire, ni les affecter, ni les escalader. Une organisation qui évalue ou cofinance un programme a besoin de voir ; elle n'a pas à pouvoir modifier la conduite d'un cas de santé. Cette asymétrie est volontaire et elle a été discutée plutôt que subie.

## Détenir le droit de signer ne suffit pas à signer

C'est la subtilité la plus importante de tout le modèle, et celle qu'un système de permissions classique ne sait pas exprimer.

Plusieurs rôles détiennent la permission de signer une revue. Cela ne veut pas dire qu'ils peuvent signer n'importe quelle revue. L'approbation d'un protocole de santé, d'une liste de signes de danger ou d'un script d'urgence exige une **composition** précise du comité : deux médecins et un expert en santé communautaire pour la santé, deux agronomes pour l'agriculture, un pédagogue et un responsable de la protection de l'enfance pour l'éducation.

La permission ouvre la porte ; l'appartenance au comité décide de la signature, et elle est vérifiée séparément. Le raisonnement est développé dans l'article sur la [revue clinique des protocoles](/blog/revue-clinique-protocoles-signes), et il tient en une phrase : un quorum est une composition, pas un décompte. Trois personnes dont aucune n'est médecin ne forment pas un comité clinique, quel que soit leur nombre.

L'asymétrie est assumée dans l'autre sens aussi : un seul membre peut suspendre un contenu, alors qu'il faut le comité complet pour l'approuver. Arrêter quelque chose de dangereux doit être facile ; autoriser quelque chose doit être difficile.

## Comptes d'agents : deux facteurs, verrouillage, révocation

Les comptes d'administration sont la cible la plus rentable pour un attaquant, parce qu'ils voient tout. Trois mesures les encadrent.

- **L'authentification à deux facteurs est obligatoire** pour les administrateurs gouvernementaux et plateforme — pas recommandée, obligatoire. Les actions sensibles exigent en outre une re-vérification si la dernière a plus de quinze minutes, ce qui limite la valeur d'un poste laissé déverrouillé.
- **Le verrouillage est progressif et compté deux fois.** Cinq échecs verrouillent quinze minutes ; chaque série suivante double la durée, jusqu'à un jour au maximum. Le comptage se fait par compte *et* par adresse réseau, pour qu'une attaque répartie sur mille comptes soit aussi freinée qu'une attaque sur un seul.
- **La révocation de session est immédiate.** Chaque compte porte un horodatage de référence ; une session émise avant celui-ci est refusée, même si son jeton est encore valide. Un changement de rôle, une suspension ou une réinitialisation de code d'accès avancent cet horodatage. Sans ce mécanisme, retirer un droit n'aurait d'effet qu'à l'expiration du jeton — c'est-à-dire trop tard.

S'y ajoute une limitation de débit différenciée : les routes ordinaires, les routes qui appellent un modèle d'intelligence artificielle et les routes d'authentification n'ont pas le même budget de requêtes par minute, parce qu'elles n'ont pas le même coût ni le même profil d'abus.

Une précision honnête sur le code d'accès des citoyens : il est court parce qu'il doit être saisi sur un téléphone à touches. Ce n'est pas un bon secret, et le programme ne prétend pas le contraire. Ce qui le rend défendable, c'est exactement le dispositif ci-dessus — la limitation du nombre d'essais, pas la longueur du secret.

## Ce que l'on gagne à nommer les permissions une par une

Nommer vingt-cinq permissions au lieu de trois niveaux de privilège paraît bavard. C'est pourtant ce qui rend certaines conversations possibles.

La première est la conversation avec un ministère. « Qui peut diffuser un message à tous les usagers d'une province ? » a une réponse exacte, qui tient en une ligne, et non une réponse approximative du type « les administrateurs ». La différence compte lorsqu'une diffusion sanitaire doit être autorisée par une autorité précise.

La deuxième est la conversation avec un auditeur. Une permission nommée est testable : la suite de tests vérifie qu'un rôle qui ne devrait pas pouvoir exporter un rapport se voit refuser la route, et pas seulement qu'il ne voit pas le bouton dans l'interface. Un contrôle d'accès qui n'existe que dans l'interface n'existe pas : il suffit d'appeler la route directement.

La troisième est la conversation interne, celle qui évite les dérives. Lorsqu'une équipe demande un droit supplémentaire pour résoudre un problème d'exploitation, la demande devient un changement visible dans un fichier versionné, relu par quelqu'un d'autre. Le coût d'un élargissement devient légèrement supérieur au coût d'une solution propre, ce qui suffit, en pratique, à ce que la solution propre soit choisie plus souvent.

Enfin, une permission nommée documente une intention. « Lire le journal d'audit » et « modifier la configuration » sont deux pouvoirs très différents, souvent confondus sous le mot « administrateur » ; les séparer permet de confier le premier à une autorité de contrôle sans lui confier le second.

## La supervision humaine n'est pas un bouton

Un modèle de **rôles et permissions** décrit qui peut agir. Il ne garantit pas que quelqu'un agit réellement. C'est une confusion fréquente dans les documents de conformité : on y lit « supervision humaine » là où il n'existe qu'un écran que personne ne regarde.

Le programme traite donc la **supervision humaine** comme un circuit, pas comme une permission.

1. Une décision à risque n'est pas prise par un modèle : les signes de danger, les seuils et les protocoles sont du code et de la configuration relus, et une détection déclenche une alerte nominative vers un rôle précis.
2. Cette alerte doit être acquittée. Un envoi n'est pas une prise en charge ; sans accusé de réception dans le délai prévu, elle remonte d'un niveau.
3. Chaque lecture, chaque modification, chaque export et chaque signature laissent une ligne dans le [journal d'audit en chaîne](/blog/journal-audit-chaine-verifiable), avec l'auteur, son rôle, l'horodatage et la finalité déclarée.
4. Les accès exceptionnels existent et sont encadrés : un accès de secours exige une justification écrite, un périmètre et une date d'expiration, et il est révocable — le mécanisme est décrit dans l'article sur la [protection des données personnelles](/blog/protection-donnees-personnelles).

Ce qui transforme ces quatre points en supervision réelle, c'est le quatrième : la trace. Une organisation qui ne peut pas montrer qui a lu quoi ne supervise rien, elle l'affirme.

## Ce que les rôles et permissions ne protègent pas

Quatre limites, parce qu'un modèle de droits présenté sans elles donne une fausse assurance.

- **Un compte légitime détourné reste légitime.** Le contrôle d'accès vérifie un droit, pas une intention. C'est la trace d'audit et la détection d'usages anormaux qui traitent ce cas, pas la table des permissions.
- **Un droit correct n'empêche pas une mauvaise décision.** Un agent habilité peut clore un cas trop vite. La réponse à cela est la relecture des cas escaladés et le suivi des résultats, pas un privilège supplémentaire.
- **Trop de droits par confort est la dérive la plus commune.** La pression opérationnelle pousse à élargir un rôle pour débloquer une situation un vendredi soir. Le seul garde-fou durable est que tout élargissement se voit dans un fichier unique, versionné, et se discute.
- **Un modèle de droits ne remplace pas une protection physique.** Un ordinateur partagé dans un bureau de zone de santé, une session laissée ouverte, un code noté sur un cahier : ces risques se traitent par la formation et par des délais d'expiration courts, pas par une permission.

Le reste des règles qui encadrent le service — supervision humaine, revue clinique, audit et comportement en urgence — est décrit sur la page de [gouvernance du programme](/gouvernance). Et devant un signe de danger, aucune de ces couches ne modifie la seule chose qui compte pour une famille : la [conduite à tenir immédiatement](/urgence).
