---
slug: garde-fous-ia-service-public
title: "Les garde-fous d’une IA de service public"
description: "Règles déterministes, gravité qui ne peut que monter, sources obligatoires, audit chaîné : les garde-fous d’une IA de service public, et ce qui manque encore."
lang: fr
category: Sécurité et gouvernance
cluster: gouvernance-ia
pillar: true
publishedAt: 2026-09-06
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: architecture de sécurité et de gouvernance
reviewer: Comité de risque modèle
reviewerRole: relecture des règles de sécurité et du journal d’audit
keywords: [garde-fous d’une IA de service public, règles déterministes et IA générative, journal d’audit chaîné, vecteur de confiance, neutralité des fournisseurs d’IA, modes dégradés d’un service public]
entities: [règles déterministes, moteur de protocoles, niveau de gravité, journal d’audit, chaîne de hachage, passerelle IA, comités de revue, supervision humaine, mode dégradé, ancrage documentaire]
tags: [Gouvernance, Sécurité, Audit, Transparence, RDC]
imageAlt: "Schéma de séparation entre le moteur de règles déterministes et le modèle génératif dans une chaîne de décision publique"
takeaways:
  - "La sécurité n’est pas confiée au modèle : détection des signes de danger, niveau de gravité, escalade et texte d’urgence relèvent de règles écrites, versionnées et rejouables."
  - "Le système peut relever une gravité, jamais l’abaisser ; seule une personne habilitée peut la réduire, avec un motif écrit conservé à côté de la valeur d’origine."
  - "Une recommandation sans source approuvée n’est pas servie : un texte de repli la remplace, une violation de contrat est enregistrée et une revue humaine devient obligatoire."
  - "Le journal d’audit est chaîné par empreintes et vérifié chaque jour ; une ligne modifiée, supprimée ou insérée après coup est détectée et alerte un responsable."
faq:
  - q: "Qu’est-ce qu’un garde-fou déterministe, concrètement ?"
    a: "C’est une règle écrite dans le code ou dans un fichier de configuration versionné, qui produit toujours le même résultat pour la même entrée, indépendamment de tout modèle. La détection par mots-clés des signes de danger dans les cinq langues, l’arbre de décision qui calcule un niveau de gravité de zéro à quatre, ou le refus de nommer un produit absent du registre agricole en sont des exemples."
  - q: "Le modèle peut-il contredire une règle de sécurité ?"
    a: "Non. Les règles s’exécutent avant et après la génération. Avant, elles décident de la gravité et peuvent court-circuiter entièrement l’appel au modèle. Après, elles filtrent la réponse rédigée : toute phrase qui pose un diagnostic ou qui donne une posologie chiffrée est retirée, et la coupure est enregistrée."
  - q: "Que se passe-t-il si aucune source approuvée ne correspond à la question ?"
    a: "La réponse rédigée est remplacée par un texte de repli qui n’affirme rien et oriente vers un professionnel, un événement de violation de contrat est enregistré avec le protocole, sa version et les identifiants revendiqués, et le niveau de risque ne peut pas rester sous le seuil qui déclenche une revue humaine."
  - q: "Pourquoi ne pas publier un score de confiance unique ?"
    a: "Parce qu’un chiffre unique donne l’illusion de la précision et masque l’endroit où le système a douté. Plusieurs dimensions sont conservées séparément — transcription, identification de la langue, intention, éléments recueillis, couverture documentaire — et c’est la plus faible, non la moyenne, qui gouverne le comportement du service."
  - q: "Que se passe-t-il quand le budget d’intelligence artificielle d’un programme est épuisé ?"
    a: "L’IA non urgente bascule en mode scripté : menus, textes approuvés, arbres de décision. Les chemins de sécurité ne contiennent aucun appel de modèle et continuent donc de fonctionner à l’identique. Un plafond budgétaire ne peut jamais éteindre un garde-fou, par construction et non par promesse."
sources:
  - label: "National Institute of Standards and Technology (NIST) — travaux sur la gestion des risques liés à l’intelligence artificielle"
    url: "https://www.nist.gov/"
  - label: "Organisation de coopération et de développement économiques (OCDE) — principes sur l’intelligence artificielle"
    url: "https://www.oecd.org/"
  - label: "Organisation mondiale de la santé (OMS)"
    url: "https://www.who.int/"
related: [ia-vocale-langues-congolaises, ia-agricole-vocale-petits-producteurs, ia-triage-sante-communautaire, signes-de-danger-detection-automatique]
---

Un service public qui parle de santé, d’agriculture et d’école à des millions de personnes ne peut pas faire reposer la sécurité des gens sur la bonne volonté d’un modèle génératif. Les garde-fous d’une IA de service public ne sont donc pas des consignes écrites dans une invite : ce sont des règles compilées, testées, versionnées et rejouables, qui s’exécutent avant et après chaque génération de texte. Ce document décrit celles qui sont en place dans CONGO VOICE AI OS, la façon dont elles se vérifient, et — aussi précisément — celles qui ne sont pas encore en place.

## Deux systèmes, deux rôles, aucune confusion

La distinction entre règles déterministes et IA générative n’est pas une figure de style : elle correspond à deux parties du logiciel écrites, testées et déployées séparément. Le partage des rôles est fixe.

| Ce que décident les règles | Ce que fait le modèle |
|---|---|
| La détection des signes de danger, par mots-clés, dans les cinq langues, avant tout appel à un modèle | Transcrire la parole, reconnaître la langue, gérer les phrases qui mélangent deux langues |
| Le niveau de gravité de 0 à 4, calculé par un arbre de décision versionné | Extraire ce qui a été dit — symptômes, durées, âge — pour alimenter l’arbre |
| Le déclenchement d’un drapeau rouge, qui impose immédiatement la gravité maximale | Expliquer, dans la langue de la personne, une décision déjà prise et figée |
| L’obligation d’escalader, la file d’attente destinataire et le délai de prise en charge | Résumer l’échange pour l’agent qui rappellera |
| Le texte d’urgence et les consignes de route, fixes et traduits à l’avance | Décrire ce qu’une photo de culture ou d’animal montre |
| Le refus de toute formulation de diagnostic ou de posologie dans la réponse finale | Proposer des hypothèses classées, avec leurs indices favorables et contraires |

Cette séparation a une conséquence pratique décisive : les chemins de sécurité ne contiennent aucun appel de modèle. Un mot comme « convulsions » déclenche la même réponse, avec le même texte, que tous les fournisseurs d’IA soient disponibles ou non. Les listes de signes de danger et la conduite à tenir sont publiées côté citoyen sur [la page urgence du service](/urgence), dans les mots exacts que le système prononce.

## Pourquoi le modèle peut-il relever une gravité, mais jamais l’abaisser ?

C’est la règle la plus importante de tout l’édifice, et elle est asymétrique à dessein.

Le niveau de gravité — de 0, auto-prise en charge, à 4, urgence immédiate — est produit par un moteur de protocoles : un arbre de décision versionné, relu, rejoué à l’identique, dans lequel aucun modèle de langage n’intervient. Ce niveau constitue un plancher. Les autres signaux du système ne peuvent que le relever :

- une confiance basse sur un échange de santé ne reste jamais classée en risque faible ;
- une grossesse ou un nourrisson relèvent le niveau, même quand les symptômes décrits paraissent bénins ;
- une divulgation relevant de la protection des personnes impose une revue humaine quelle que soit l’évaluation clinique, et relève le risque au minimum au seuil de la consultation du jour ;
- l’absence de source approuvée relève également le niveau et bloque la réponse rédigée.

Abaisser un niveau reste possible, mais uniquement pour une personne habilitée, et jamais pour le système. L’opération exige un motif écrit, et elle conserve côte à côte la valeur proposée par le système, la valeur retenue par la personne, son nom, son rôle et l’horodatage. Un service qui ne pourrait jamais être corrigé par un professionnel serait aussi dangereux qu’un service qui se corrigerait tout seul ; la différence tient à la trace laissée.

Cette asymétrie répond à une caractéristique connue des modèles génératifs : leur tendance à produire une réponse plausible et rassurante quand les éléments manquent. Les cadres de gestion des risques publiés par [le National Institute of Standards and Technology](https://www.nist.gov/) comme les principes adoptés par [l’Organisation de coopération et de développement économiques](https://www.oecd.org/) insistent sur le même point : la fiabilité d’un système ne se décrète pas, elle se contraint.

## Aucune recommandation sans source, et un repli quand la source manque

L’ancrage documentaire est le deuxième pilier. Toute recommandation de santé ou d’agriculture doit citer au moins un document de la base de connaissances approuvée, ou l’identifiant du protocole dont elle découle.

Les documents sont des fichiers versionnés portant leur autorité d’origine, leur version, leur zone géographique, leur niveau de preuve, leur approbateur et leur date de revue. Ils sont chargés avec une empreinte, et seuls ceux dont le statut est « approuvé » peuvent être retrouvés par le service. La recherche documentaire s’exécute **avant** la rédaction, et les identifiants annoncés ensuite par le modèle sont revérifiés en base : un identifiant inexistant ou non approuvé est écarté sans discussion.

S’il ne reste aucune source après cette vérification, trois choses se produisent ensemble :

1. la réponse rédigée est remplacée par **un texte de repli** qui n’affirme rien et oriente vers un professionnel ou un centre de santé ;
2. **un événement de violation de contrat** est enregistré, avec le protocole, sa version, le niveau de gravité et les identifiants revendiqués ;
3. **la revue humaine devient obligatoire** et le niveau de gravité ne peut pas rester en dessous du seuil de consultation.

Le même filet existe pour les formulations interdites : toute phrase qui pose un diagnostic ou qui donne une posologie chiffrée est retirée de la réponse, et la coupure est journalisée. Côté agriculture, la règle prend une forme spécifique — aucun produit n’est nommé s’il ne correspond pas à une entrée homologuée du registre des intrants, avec son étiquette, sa protection obligatoire et son délai avant récolte. Ce mécanisme est décrit en détail dans le guide de l’[IA agricole vocale pour les petits producteurs](/blog/ia-agricole-vocale-petits-producteurs).

## Un vecteur de confiance plutôt qu’un score opaque

Un chiffre unique donne l’illusion de la précision et cache l’endroit exact où le système a douté. Chaque échange conserve donc plusieurs dimensions distinctes, stockées avec l’interaction et visibles par l’agent qui reprend le cas.

| Dimension du vecteur de confiance | Ce qu’elle mesure | Ce qu’une valeur basse déclenche |
|---|---|---|
| Qualité de la transcription | La fiabilité de ce qui a été entendu | Confirmation ciblée, puis orientation vers un humain |
| Identification de la langue | La langue et le mélange de langues reconnus | Bascule en mode guidé pour cette langue |
| Reconnaissance de l’intention | Ce que la personne demande réellement | Question de clarification plutôt que réponse |
| Solidité des éléments recueillis | Ce qui manque pour trancher | Deuxième photo, question de suivi, ou renvoi vers un agent |
| Couverture documentaire | L’existence d’une source approuvée sur le sujet | Texte de repli et revue humaine obligatoire |

C’est la dimension **la plus faible**, et non la moyenne, qui gouverne le comportement du système. Une transcription douteuse suffit à faire relever le risque d’un échange de santé, même si tout le reste paraît clair. Et aucune de ces valeurs n’est jamais présentée au citoyen comme une probabilité clinique : le service dit ce qu’il a compris et à quel point il en est sûr, pas ce dont la personne souffre. La façon dont ces seuils sont fixés langue par langue est développée dans l’article sur [l’IA vocale en langues congolaises](/blog/ia-vocale-langues-congolaises).

## Un journal d’audit que l’on ne peut pas réécrire sans que cela se voie

Toute action privilégiée et tout changement significatif d’un cas écrivent une ligne d’audit : l’auteur, son rôle, l’entité concernée, l’état avant, l’état après, la finalité, l’identifiant de trace, l’organisation et l’adresse d’origine.

Cette ligne est ensuite chaînée. Son empreinte est calculée à partir de l’empreinte de la ligne précédente et de son propre contenu, sérialisé de façon canonique — clés triées à chaque niveau, dates en format normalisé — pour que le calcul soit reproductible. La chaîne repart d’une valeur d’origine à chaque journée civile, ce qui permet de vérifier une journée isolément et d’en archiver une à la fois. Les écritures sont sérialisées, afin que la chaîne ne puisse pas se dédoubler quand plusieurs actions arrivent en même temps.

Une vérification quotidienne recalcule la chaîne de la veille et détecte trois choses : une ligne modifiée, une ligne supprimée et une ligne insérée après coup. Une rupture déclenche une alerte à accusé de réception obligatoire, avec la position et l’action de la première ligne fautive. La consultation du journal est elle-même journalisée. Enfin, le journal survit à une demande d’effacement : il ne contient aucune donnée personnelle en texte libre, et il constitue la preuve de ce que le programme a fait. Les droits des personnes et les durées de conservation sont détaillés sur [la page de protection des données](/confidentialite).

## Des fournisseurs interchangeables, et invisibles

La neutralité des fournisseurs d’IA est une exigence de souveraineté autant qu’une précaution technique. Un seul module de la plateforme sait quel fournisseur est appelé ; tout le reste demande une capacité — transcrire, comprendre, expliquer, décrire une image, synthétiser une voix — et ignore qui l’exécute.

- **Des chaînes de repli configurables.** Chaque capacité dispose d’un ordre de fournisseurs modifiable par configuration, terminé par un fournisseur de règles hors ligne. Changer de fournisseur est un paramètre, pas une réécriture.
- **Une validation stricte des sorties.** Une réponse de modèle qui ne respecte pas le schéma attendu est traitée comme une panne et la demande passe au fournisseur suivant.
- **Rien ne fuit vers le client.** Ni nom de fournisseur, ni consigne système, ni clé d’interface n’atteint un navigateur ou un téléphone, y compris dans les messages d’erreur.
- **Aucun identifiant n’accompagne un appel.** Le fournisseur reçoit le strict nécessaire — un extrait audio, un texte pseudonymisé, une photo dont les métadonnées ont été retirées — jamais un nom, un numéro ou un identifiant de dossier.
- **Aucun entraînement par défaut.** Les données des citoyens ne servent pas à entraîner des modèles de tiers ; les échantillons de corpus ne sont exportables que dé-identifiés et sous consentement de recherche.
- **Tout appel est mesuré.** Capacité, clé interne du fournisseur, durée, succès ou échec, unités consommées : la dépendance à un fournisseur devient visible et chiffrable.

## Modes dégradés et plafonds de budget : ce qui ne s’éteint jamais

La question n’est pas de savoir si un fournisseur tombera, mais ce que reçoit le citoyen ce jour-là. Les modes dégradés d’un service public doivent être décidés à l’avance, pas improvisés pendant l’incident.

| Ce qui tombe | Ce que fait le service |
|---|---|
| Un fournisseur d’IA | Passage au suivant dans la chaîne, même requête, le citoyen ne voit rien |
| Tous les fournisseurs d’IA | Fournisseur de règles hors ligne : les arbres de protocoles tournent, les explications viennent du texte approuvé, la confiance est signalée comme basse |
| La reconnaissance vocale | Mode écrit ou menu guidé par touches, sur USSD ou par serveur vocal |
| Le plafond mensuel d’un programme | L’IA non urgente bascule en mode scripté ; les garde-fous ne s’éteignent pas |
| Le téléphone du citoyen, hors ligne | Notes vocales et photos attendent dans l’appareil et repartent seules, sans doublon |
| Un canal de notification | Bascule d’un canal à l’autre, avec relances et événements de livraison |

Le quatrième cas mérite d’être explicité, parce qu’il est le plus souvent mal conçu ailleurs. La consommation d’intelligence artificielle est mesurée en unités normalisées, indépendantes du vocabulaire commercial des fournisseurs, et chaque programme dispose d’un plafond mensuel. Quand ce plafond est atteint, ce qui se dégrade est le confort — la conversation libre, la reformulation, le résumé — jamais la sécurité. Les urgences ne sont jamais dégradées, et pour une raison structurelle : le chemin d’urgence ne dépend d’aucun appel payant.

## Ce qui n’est pas encore en place

Publier ses manques fait partie des garde-fous d’une IA de service public, au même titre que les règles elles-mêmes. À ce jour :

- **Les six comités de revue ne sont pas constitués.** Comité de revue clinique, comité de protection de l’enfance et d’éducation, comité de contenu agricole, comité d’inclusion linguistique, comité d’éthique des données, comité de risque modèle : la structure de données qui enregistre leurs décisions existe, les versions de protocoles portent la mention d’un approbateur en attente et non le nom d’une personne. Aucun contenu de santé ne doit atteindre la production dans cet état.
- **Le cloisonnement au niveau des lignes de la base de données est prévu pour une phase ultérieure.** Il est aujourd’hui appliqué par l’application et non par le moteur de base de données : c’est le point de sécurité ouvert le plus important du programme.
- **Aucun audit indépendant n’a eu lieu.** Ni sur la sécurité, ni sur l’accessibilité, ni sur la conformité des traitements. Les vérifications décrites ici sont internes et automatisées ; elles ne remplacent pas un tiers.
- **Le corpus adverse multilingue complet reste à constituer.** Chaque garde-fou déterministe dispose de ses tests ciblés, mais les campagnes systématiques dans les cinq langues sont encore partielles.
- **Le déploiement par paliers et le retour arrière automatiques** sont prévus plus tard ; ces deux étapes sont opérées manuellement aujourd’hui.
- **L’export quotidien du journal vers un stockage froid** n’est pas encore en place.

Ce qui précède est vérifiable dans le code et dans les tests, pas seulement affirmé. Le détail des décisions, de leurs responsables et de ce qui en reste est publié sur [la page sécurité et gouvernance](/gouvernance), et l’ambition générale du service sur [la page du programme](/programme). Un garde-fou dont personne ne peut vérifier l’existence n’est pas un garde-fou : c’est une promesse.
