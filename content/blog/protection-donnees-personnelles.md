---
slug: protection-donnees-personnelles
title: "Protection des données personnelles : ce qui est chiffré"
description: "La protection des données personnelles tient en quatre mécanismes vérifiables : chiffrement au repos, index aveugle, conservation bornée, effacement audité."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: sécurité des données et conformité du programme
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des règles de conservation en santé
keywords: [protection des données personnelles, chiffrement au repos, index aveugle, droit à l'effacement, conservation des médias]
entities: [chiffrement, index aveugle, pierre tombale, conservation, consentement, résidence des données, journal d'audit, accès de secours]
tags: [Gouvernance, Confidentialité, Sécurité, Conformité, RDC]
imageAlt: "Schéma des données détenues par le programme : voix, photographie, numéro, cas, et ce qui est chiffré au repos"
takeaways:
  - "Les trois champs dont la fuite serait immédiatement nuisible — la voix enregistrée, le numéro de téléphone et le secret de second facteur — sont chiffrés en AES-256-GCM avec une clé par finalité."
  - "Le numéro reste cherchable sans être lisible, grâce à un index aveugle qui ne révèle que l'égalité entre deux lignes."
  - "Les photographies sont réencodées, ce qui supprime les coordonnées GPS que l'appareil y avait inscrites par défaut."
  - "La voix est conservée 90 jours par défaut, les images 365, et la purge est un événement audité, pas une règle de stockage silencieuse."
  - "L'effacement est nommé table par table : vingt-deux tables sont traitées, et le journal d'audit est conservé parce qu'il ne contient pas de texte libre."
faq:
  - q: "Que détient le programme sur une personne qui a posé une seule question ?"
  - a: "Son numéro de téléphone sous forme chiffrée, l'enregistrement vocal s'il y en a eu un, la transcription, la traduction en français, la réponse donnée, le niveau de gravité calculé, la langue, le canal, la province, l'horodatage et la version des règles appliquées. Tout cela est restituable sur demande d'accès, en un seul paquet."
  - q: "Le chiffrement au repos protège-t-il contre un serveur compromis ?"
  - a: "Non, et il serait malhonnête de le laisser croire. Un serveur qui fonctionne doit pouvoir déchiffrer, donc un attaquant qui contrôle le processus voit les données en clair. Ce que le chiffrement au repos protège, c'est une sauvegarde qui fuit, un export de table, une vue en lecture seule ou un disque récupéré."
  - q: "Combien de temps l'enregistrement de ma voix est-il conservé ?"
  - a: "Quatre-vingt-dix jours par défaut pour l'audio, trois cent soixante-cinq pour les photographies et les vidéos. La suppression efface d'abord les octets puis la ligne du catalogue, et elle est inscrite au journal d'audit. Si des octets résistent, une alerte part vers l'équipe de l'État plutôt que de disparaître dans un rapport."
  - q: "Qu'est-ce qui reste après une demande d'effacement ?"
  - a: "Le squelette statistique et le journal d'audit. Les mots de la personne, ses médias, son numéro, son nom et ses identifiants partent ; il reste qu'une interaction a eu lieu, dans tel module, avec telle gravité, et la preuve de ce que le programme a fait. L'audit ne contient pas de texte libre, c'est pour cela qu'il peut rester."
  - q: "Mes données sortent-elles du pays ?"
  - a: "Oui, pour l'instant, vers les services de compréhension et de transcription, et le programme publie l'inventaire de ces destinations plutôt que de prétendre le contraire. Chaque déploiement déclare les juridictions qu'il autorise ; un destinataire hors de cette liste n'est pas seulement journalisé, il n'est jamais mis dans la chaîne."
sources:
  - label: "Union africaine — convention sur la cybersécurité et la protection des données à caractère personnel"
  - url: "https://au.int/"
  - label: "NIST — Computer Security Resource Center"
  - url: "https://csrc.nist.gov/"
related: [journal-audit-chaine-verifiable, mode-degrade-securite-sans-reseau, garde-fous-ia-service-public]
---

Un service public vocal de santé collecte, par construction, les informations les plus intimes qu'une famille puisse confier : la voix d'une mère décrivant un enfant fiévreux, une photographie d'une lésion, un numéro de téléphone qui relie ce récit à un ménage identifiable. La **protection des données personnelles** ne peut donc pas être, ici, une page de conditions générales. Elle doit être un ensemble de mécanismes que l'on peut nommer, ouvrir et tester.

Cet article décrit ces mécanismes tels qu'ils existent dans le code, avec leurs limites. Il indique aussi, explicitement, ce qu'ils ne protègent pas — parce qu'une promesse de confidentialité trop large est elle-même un risque.

## Ce que la plateforme détient réellement sur une personne

Avant de parler de protection, il faut parler d'inventaire. Un programme qui ne sait pas précisément ce qu'il détient ne peut ni l'effacer, ni le restituer, ni le borner dans le temps.

| Donnée | Pourquoi elle existe | Traitement au repos |
|---|---|---|
| Enregistrement vocal | C'est la question posée, dans la langue de la personne | Chiffré, puis supprimé à l'échéance de conservation |
| Numéro de téléphone | Rappeler, relancer, relier un cas à un ménage | Chiffré, avec un index aveugle pour la recherche |
| Transcription et traduction | Comprendre, et pouvoir relire ce que le service a compris | En clair en base, effaçable sur demande |
| Photographie | Diagnostic agricole ou lésion cutanée | Réencodée sans métadonnées, supprimée à l'échéance |
| Province et territoire | Orienter vers une structure réelle | En clair, au niveau administratif utilisé |
| Secret de second facteur | Protéger un compte d'agent, pas un citoyen | Chiffré |
| Gravité, langue, canal, version des règles | Mesurer, auditer, corriger | En clair, sans contenu personnel |

Cet inventaire est ce qui alimente une demande d'accès : la plateforme sait produire, pour une personne donnée, un paquet unique contenant son profil, ses consentements, ses interactions avec leurs transcriptions, ses cas, ses dossiers de triage, ses rapports agricoles et ses sessions éducatives. Pas une sélection confortable : ce qui est réellement là.

## Chiffrement au repos : ce qu'il protège, ce qu'il ne protège pas

Trois champs sont chiffrés au niveau applicatif : l'enregistrement vocal, le numéro de téléphone et le secret de second facteur d'un compte d'agent. Le choix n'est pas esthétique. Ce sont les trois champs dont l'apparition dans un export de table serait immédiatement nuisible à une personne.

Le format est volontairement ordinaire : AES-256-GCM, un vecteur d'initialisation de douze octets tiré au hasard pour chaque valeur, une étiquette d'authentification vérifiée à la lecture, et une enveloppe versionnée. Rien d'inventé, parce qu'un chiffrement original est un chiffrement non audité. Les paramètres suivent les publications du [Computer Security Resource Center du NIST](https://csrc.nist.gov/), qui sont la référence que tout auditeur connaît déjà.

Deux décisions méritent d'être signalées.

- **Une clé par finalité, dérivée d'une racine.** La clé qui lit les secrets de second facteur ne peut pas lire les enregistrements. Une fuite se limite à son périmètre, et faire tourner la racine fait tourner toutes les finalités d'un coup.
- **Pas de clé, pas de production.** En production, l'absence de la clé fait échouer le démarrage au lieu d'écrire en clair silencieusement. En développement, une clé est dérivée du secret de session pour que la plateforme fonctionne sans configuration — un comportement qui n'est jamais atteint en production, puisqu'elle refuse de démarrer avant.

Reste la limite, qui doit être dite dans la même phrase que la promesse : le **chiffrement au repos** ne protège pas contre un serveur compromis. Un processus qui doit répondre à un citoyen doit pouvoir déchiffrer. Ce mécanisme protège une sauvegarde exfiltrée, un export de table, une vue en lecture seule accordée à un prestataire, un disque mal effacé. Ce sont les scénarios les plus fréquents, pas les plus spectaculaires.

Une conséquence opérationnelle a été apprise à nos dépens. Lorsqu'une valeur ne se déchiffre pas — clé remplacée, base restaurée depuis un autre environnement — la lecture renvoie une absence plutôt qu'une erreur fatale, et l'incident est compté et exposé sur le point d'état du système. La proportionnalité est délibérée : une notification qui ne trouve pas son destinataire et qui est enregistrée comme échouée, ce n'est pas la même chose qu'une réponse de santé perdue parce qu'un numéro était illisible.

## Comment chercher un numéro que l'on ne peut pas lire

C'est l'objection classique au chiffrement des identifiants : un service doit pouvoir retrouver un compte à partir d'un numéro, et l'on ne cherche pas ce que l'on ne sait pas lire. C'est la raison pour laquelle, dans la plupart des systèmes, le numéro de téléphone reste en clair.

La sortie tient en deux colonnes. Le numéro lui-même est chiffré. À côté se trouve un **index aveugle** : une empreinte à clé, non réversible, identique pour deux numéros identiques. Toutes les recherches passent par cette empreinte.

Ce que cela fuite, et rien de plus : l'égalité. Une personne qui obtient la table peut dire que deux lignes partagent un numéro, sans savoir lequel. Surtout, elle ne peut pas tester une hypothèse — essayer un million de numéros congolais plausibles pour voir lequel correspond — parce que l'empreinte dépend d'une clé qu'elle n'a pas. Un simple condensé sans clé, lui, serait cassé en quelques minutes : l'espace des numéros de téléphone est minuscule.

Pour l'affichage et pour les journaux, le numéro est réduit aux quatre derniers chiffres. C'est assez pour qu'une personne reconnaisse le sien, et insuffisant pour qu'un tiers l'utilise.

Cette conception a un coût que nous avons payé en vrai : si la clé change, l'index ne correspond plus et les comptes concernés deviennent introuvables par leur numéro. Le mécanisme est correct, l'exploitation des clés doit l'être aussi. C'est le genre de dépendance qu'il faut documenter avant de la découvrir un dimanche.

## La photographie et ses coordonnées GPS

Une photographie de plante ou de lésion arrive avec plus que des pixels. Un téléphone y inscrit par défaut un horodatage, un modèle d'appareil et, très souvent, les coordonnées GPS du lieu de la prise de vue — c'est-à-dire, pour une photo prise à la maison, celles du ménage.

Le traitement des images est donc une opération de confidentialité autant qu'une opération technique. Chaque photographie est réencodée avant d'être stockée ou envoyée à un service d'analyse. Le réencodage applique d'abord la rotation que l'appareil avait seulement déclarée — un agent de santé qui regarde une lésion de travers, c'est un coût réel — puis supprime l'ensemble des métadonnées, GPS inclus.

La localisation n'est pas pour autant perdue : elle est enregistrée lorsque la personne la donne, au niveau de province ou de territoire que le service utilise réellement pour orienter. La différence entre « une province » et « un point à cinq mètres près » est exactement la différence entre une donnée utile et une donnée dangereuse.

L'image est également réduite à 2 048 pixels sur son plus grand côté. C'est une borne mémoire, et c'est aussi moins d'octets à faire traverser un réseau mobile et à conserver.

## Combien de temps la voix d'un citoyen est-elle conservée ?

La durée de conservation est le mécanisme de protection le plus simple et le plus souvent négligé : ce qui n'existe plus ne fuit pas.

Les valeurs par défaut sont de quatre-vingt-dix jours pour l'audio, trois cent soixante-cinq jours pour les images, les vidéos et les documents générés, chacune réglable par l'exploitant. L'audio est plus court parce que c'est la donnée la plus sensible que la plateforme détienne : une voix identifie une personne, et le récit qu'elle porte concerne souvent un enfant.

Deux choix d'implémentation comptent ici.

1. **La purge est exécutée par la plateforme, pas par le stockage.** Mettre la règle sur le seau de stockage aurait été plus simple, mais elle ne s'appliquerait plus sur une installation locale dans une zone de santé, ni sur la base embarquée.
2. **La purge est un événement audité.** Chaque passage inscrit ce qui a été supprimé, par type, et ce qui a résisté. Un objet dont la ligne est partie mais dont les octets demeurent produit une alerte nominative vers l'équipe de l'État, parce qu'un échec de suppression silencieux est une fuite différée.

La conservation des médias est donc vérifiable après coup : on peut demander au programme de montrer, pour un mois donné, combien d'enregistrements ont été détruits et combien d'échecs ont été traités. C'est le même raisonnement que celui du [journal d'audit en chaîne](/blog/journal-audit-chaine-verifiable) — une affirmation ne vaut que si quelqu'un peut la contrôler sans nous croire.

## Le droit à l'effacement, nommé table par table

C'est la partie où la plupart des systèmes mentent, sans intention de mentir. On écrit une fonction d'effacement, elle traite les tables auxquelles on pense, et le message adressé au citoyen affirme que « le texte de vos échanges a été supprimé » alors que huit autres tables le contiennent encore.

Le programme a connu exactement cette situation, et la correction a consisté à énumérer les endroits oubliés plutôt qu'à reformuler le message. Y figurent le brouillon de question à demi saisi, le commentaire libre laissé en retour, l'identifiant d'appelant de la session, l'état d'une conversation reprise en cours, une réponse d'interface mise en cache qui contenait la transcription complète, les tours de parole capturés hors ligne par un appareil, les notes de la chronologie d'un cas, ce qu'un agent avait consigné après un suivi, et l'adresse réseau conservée dans le journal des requêtes — une adresse étant une donnée personnelle à elle seule.

Vingt-deux tables sont traitées au total. Le principe appliqué partout est le même : **le squelette analytique reste, les mots de la personne partent.** Un brouillon sans contenu, une note sans texte, une session sans son état, une notification dont le corps est remplacé par une mention d'effacement. Ce que le programme a fait reste comptable ; ce que la personne a dit ne reste pas lisible.

Le compte lui-même devient une pierre tombale : nom retiré, numéro retiré, code d'accès retiré, second facteur désactivé, statut « effacé », et un jeton de remplacement stable et non réversible écrit là où la personne était nommée. Les sessions actives sont invalidées par le même mouvement.

Deux éléments survivent délibérément, et il faut savoir pourquoi.

- **Le journal d'audit.** Il est la preuve de ce que le programme a fait, il est exigé d'un service public, et il ne contient pas de texte libre personnel. L'effacer reviendrait à supprimer la trace de l'effacement.
- **Les statistiques dés-identifiées.** Le nombre d'interactions, de cas et d'escalades par province reste nécessaire au pilotage sanitaire, et il ne désigne plus personne.

Enfin, une demande d'accès ou d'effacement a un délai : trente jours, calculé à la création de la demande, avec une échéance stockée et un balayage automatique des demandes en retard. Une rétention légale peut bloquer un effacement — un cas sous enquête, par exemple — et la demande passe alors explicitement en attente plutôt que d'être exécutée ou oubliée.

## Consentement : neuf finalités plutôt qu'une case à cocher

Un consentement unique « j'accepte le traitement de mes données » n'informe personne. La plateforme distingue neuf finalités, dont le service lui-même, les rappels, la localisation précise, les statistiques, la recherche, le partage avec un partenaire, les données de grossesse, le profil d'un enfant et l'orientation entre programmes.

Chacune est enregistrée séparément, avec sa date, et elle est vérifiée au moment de l'usage et non au moment de l'inscription. Un rappel vocal, par exemple, est contrôlé deux fois : à la planification et à l'envoi. Une personne qui retire son accord un mardi ne reçoit rien le mercredi, et la suppression est enregistrée avec son motif plutôt que de disparaître. C'est ce qui permet de répondre à la question « pourquoi n'a-t-elle rien reçu ? » sans spéculer.

Il existe aussi un accès de secours, pour les situations où un agent doit consulter un dossier en dehors de ses droits normaux. Il n'est pas discrétionnaire : il exige une justification écrite, un périmètre et une date d'expiration, il est révocable, et il laisse une trace. Un service public honnête ne prétend pas que ces situations n'existent pas ; il les encadre et les rend visibles.

## Ce que la protection des données personnelles ne couvre pas ici

Quatre limites, pour que cette page ne se lise pas comme une garantie.

- **Les données sortent du pays.** Les services de compréhension et de transcription sont hébergés hors de la République démocratique du Congo. Le programme déclare les juridictions autorisées par déploiement, refuse tout destinataire non déclaré, publie l'inventaire sur sa [page de protection des données](/confidentialite), et travaille à une alternative régionale. Il ne prétend pas que la souveraineté est acquise.
- **La transcription reste en clair en base.** Elle doit être relue, corrigée et évaluée par des locuteurs natifs pour que la qualité progresse. Elle est effaçable sur demande ; elle n'est pas chiffrée champ par champ, et le dire est plus utile que de laisser supposer le contraire.
- **Le téléphone de la personne n'est pas sous notre contrôle.** Un appareil partagé dans un ménage, un message lu par un tiers, une carte SIM revendue : aucun chiffrement côté serveur ne traite cela. C'est pourquoi le service parle de [ce qu'il faut faire en urgence](/urgence) sans jamais nommer un diagnostic dans un message sortant.
- **La conformité n'est pas la sécurité.** Le programme s'aligne sur la [convention de l'Union africaine sur la cybersécurité et la protection des données à caractère personnel](https://au.int/) et sur le cadre national applicable, mais une case cochée n'a jamais arrêté une attaque. Les mécanismes décrits ici valent par leur test, pas par leur déclaration — et les règles de [gouvernance et de supervision humaine](/gouvernance) existent justement parce qu'aucun mécanisme n'est suffisant seul.

Ce que le programme s'engage à tenir est donc modeste et vérifiable : nommer ce qu'il détient, chiffrer ce dont la fuite serait nuisible, borner la durée, effacer là où il dit effacer, et rendre chacune de ces affirmations contrôlable par quelqu'un qui ne nous fait pas confiance.
