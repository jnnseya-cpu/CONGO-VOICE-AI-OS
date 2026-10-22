---
slug: transcription-inventee-detection
title: "Transcription inventée : reconnaître ce qui n'a pas été dit"
description: "Une transcription inventée est rejetée avant toute analyse : les crédits de sous-titrage et les boucles de répétition ne sont pas de la parole."
lang: fr
category: Langues et parole
cluster: langues
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: chaîne de reconnaissance vocale et filtrage
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des cas d'alerte issus d'une transcription rejetée
keywords: [transcription inventée, boucle de répétition, crédit de sous-titrage, niveau sonore, mots porteurs]
entities: [sous-titrage, crédit de générique, boucle, répétition, silence, micro coupé, escalade inutile, relais communautaire]
tags: [Voix, Sécurité, Langues, Qualité, RDC]
imageAlt: "Chaîne de filtrage d'une transcription inventée avant qu'elle n'atteigne les agents d'analyse"
takeaways:
  - "Un modèle de reconnaissance vocale privé de parole intelligible ne rend pas le silence : il rend le texte qu'il juge le plus probable."
  - "Les crédits de sous-titrage et les formules de fin de vidéo sont détectés par des règles et traités comme du silence."
  - "Une phrase longue répétée mot pour mot trois fois ou plus n'est pas un message : c'est un décodeur bloqué."
  - "Un enregistrement sans niveau sonore ne part plus du téléphone : il n'y a rien à transcrire, donc rien à inventer."
faq:
  - q: "Pourquoi un modèle de reconnaissance vocale invente-t-il du texte ?"
  - a: "Parce qu'il a été entraîné sur d'énormes quantités de sous-titres et qu'il produit toujours la suite la plus probable. Devant du vent, un marché ou une langue qu'il ne connaît pas, la suite la plus probable n'est pas le silence : c'est une phrase de sous-titre. Il la produit avec la même assurance qu'une transcription correcte, et rien dans sa sortie ne signale la différence."
  - q: "Quel danger représente une transcription inventée dans un service de santé ?"
  - a: "Elle est traitée comme la parole du citoyen. Elle est classée, elle déclenche une orientation, elle peut ouvrir un cas et mobiliser un relais communautaire pour une situation qui n'existe pas. À l'échelle d'un pays, cela revient à envoyer des alertes fabriquées à des agents de santé qui sont une ressource rare."
  - q: "Comment distingue-t-on une invention d'un message mal transcrit ?"
  - a: "Par des règles déterministes portant sur la forme, pas sur le sens : présence de formules de générique, répétition mot pour mot d'une phrase longue, absence de mots porteurs une fois les formules retirées. Un message réellement mal transcrit conserve une structure irrégulière ; une invention a la régularité d'un texte modèle."
  - q: "Le filtre peut-il supprimer un vrai message de détresse ?"
  - a: "Les règles sont volontairement étroites pour l'éviter. « Aidez-moi. Aidez-moi. Aidez-moi. » passe : la phrase est courte. Un message qui se répète puis ajoute une information passe aussi, parce qu'il contient autre chose. Seule la répétition intégrale d'une phrase longue, sans rien d'autre, est écartée."
  - q: "Que voit l'usager quand sa transcription est rejetée ?"
  - a: "Il est invité à répéter plus près du téléphone ou à écrire sa question. Aucun cas n'est ouvert et aucun agent n'est alerté, puisque rien n'a été entendu. Le texte rejeté reste enregistré pour l'audit, afin qu'un relecteur puisse vérifier que le filtre n'a pas écarté une parole réelle."
sources:
  - label: "OpenAI — carte du modèle Whisper, limites et comportements connus"
  - url: "https://github.com/openai/whisper"
  - label: "Mozilla Common Voice — jeux de données vocaux ouverts et multilingues"
  - url: "https://commonvoice.mozilla.org/"
related: [reconnaissance-vocale-lingala, seuils-qualite-par-langue, garde-fous-ia-service-public]
---

Un service vocal qui se trompe de réponse est un problème ordinaire. Un service vocal auquel on attribue des mots que personne n'a prononcés est un problème d'une autre nature, parce que rien, dans la chaîne, ne permet de s'en apercevoir. La **transcription inventée** est la défaillance la plus silencieuse de la reconnaissance vocale, et c'est aussi la plus facile à prendre pour un fonctionnement normal.

## D'où vient une transcription inventée

Les modèles de reconnaissance vocale actuels ont été entraînés sur d'immenses volumes de sous-titres : films, vidéos en ligne, conférences. Leur tâche consiste à produire la suite la plus probable, pas à déterminer si une parole a eu lieu.

Devant un enregistrement sans parole intelligible — du vent, un marché, un micro couvert, une langue absente de leur répertoire — ils ne renvoient donc pas une chaîne vide. Ils renvoient ce qui, dans leur entraînement, accompagne le plus souvent ce genre de signal : un crédit de générique, une formule de fin de vidéo, un remerciement à un public.

Trois exemples réellement produits par le service du programme, en production, avec un citoyen à l'autre bout :

- `Sous-titrage ST' 501`
- `Je vous remercie pour votre attention et je vous remercie pour votre appropriation de la saison.`
- `Les enfants de la République démocratique du Congo ont besoin d'un soutien médical et d'un soutien sanitaire.` — quatre fois de suite, mot pour mot, en réponse à une question sur un champ.

Aucune de ces phrases n'a été prononcée. Toutes ont été présentées au citoyen comme « ce que vous avez dit ».

## Pourquoi le troisième exemple est le plus grave

Les deux premiers sont manifestement absurdes : un crédit de sous-titrage ou un remerciement à une audience n'a aucun rapport avec une question de santé, et un lecteur attentif le voit.

Le troisième est d'une autre catégorie. C'est une phrase plausible, bien construite, dans le registre exact du service. Un relais communautaire qui la lirait dans un dossier n'aurait aucune raison de la mettre en doute.

Et elle a une origine précise, qu'il faut raconter parce qu'elle est instructive. Le programme avait ajouté au modèle une amorce décrivant le domaine — habitant de la République démocratique du Congo, santé, enfant malade, agriculture — dans l'espoir de l'éloigner du vocabulaire des sous-titres. Le résultat fut l'inverse de l'intention : privé de parole intelligible, le modèle s'est mis à inventer **dans le vocabulaire fourni**. L'amorce a été retirée.

La leçon est générale et contre-intuitive : orienter un modèle de reconnaissance vocale vers le domaine dans lequel il va se tromper rend ses erreurs indiscernables de la réalité. Une invention évidente est moins dangereuse qu'une invention vraisemblable.

## Reconnaître une transcription inventée à sa forme, pas à son sens

Le filtre ne juge pas le sens de la phrase — ce serait demander à un modèle de dire s'il a inventé, c'est-à-dire interroger la partie défaillante. Il juge la **forme**, par des règles déterministes exécutées avant que le moindre agent d'analyse ne voie le texte.

| Signal observé | Règle appliquée | Traitement |
|---|---|---|
| Formules de générique et de sous-titrage | Liste de tournures connues, accents et casse neutralisés | Retirées du texte |
| Rien de porteur une fois les formules retirées | Moins de trois mots porteurs restants, chiffres et mots-outils exclus | Traité comme rien d'entendu |
| Phrase longue répétée à l'identique | Huit mots ou plus, trois répétitions ou plus, rien d'autre dans le texte | Traité comme rien d'entendu |
| Répétition partielle, mesurée sur des fenêtres de trois mots | Au-delà d'un seuil, la transcription est conservée mais sa confiance est plafonnée | Réponse prudente, aucun chiffre repris |

La quatrième ligne illustre la prudence du dispositif : toute répétition n'est pas une invention. Une personne inquiète se répète. Le filtre distingue le bégaiement humain d'un décodeur bloqué, et dans le doute il conserve le message en abaissant la confiance plutôt qu'en le supprimant.

## Comment éviter d'effacer une vraie détresse ?

C'est la question qui décide de la valeur du filtre, et elle a été traitée en écrivant d'abord les cas qui doivent passer.

1. **« Aidez-moi. Aidez-moi. Aidez-moi. »** passe. Les phrases sont courtes, et la détresse s'exprime ainsi.
2. **Un message répété deux fois puis complété** — « Mon enfant a de la fièvre depuis trois jours. Mon enfant a de la fièvre depuis trois jours. Il respire vite aussi. » — passe, parce qu'il contient autre chose que la répétition.
3. **Un message réel terminé par une politesse** — « Mon enfant convulse depuis ce matin. Merci pour votre attention. » — passe, et seule la formule de politesse est retirée.

Seule la répétition intégrale d'une phrase longue, sans aucun autre contenu, est écartée. Ces trois cas sont couverts par des tests automatisés, au même titre que les cas à rejeter : un filtre de sécurité dont on ne vérifie que les succès finit par mordre sur ce qu'il devait protéger.

## Le niveau sonore, vérifié sur le téléphone avant tout envoi

Le filtre de transcription inventée décrit ci-dessus traite le texte revenu du modèle. Une seconde protection agit plus tôt, sur l'appareil lui-même.

Pendant l'enregistrement, le téléphone mesure le niveau sonore. Si ce niveau ne s'élève jamais — micro coupé, micro couvert, autorisation accordée mais appareil muet — l'enregistrement **n'est pas envoyé**. L'usager voit un message lui demandant de vérifier son micro et de réessayer.

Le raisonnement est économique autant que prudent : un enregistrement silencieux n'a aucune chance de produire une transcription utile, et il a toutes les chances d'en produire une inventée. Le seuil est délibérément bas, pour qu'une personne qui parle doucement, à bout de bras ou dans une langue peu reconnue, passe malgré tout.

## Ce que le filtre a changé dans le service rendu

Avant, une transcription inventée suivait le même chemin qu'une parole réelle : classée, orientée, escaladée. Dans un cas observé, le service a ouvert un dossier, alerté un agent de santé, puis demandé à la personne de confirmer qu'elle avait bien dit « ST' 501 ».

Désormais, ce texte est traité comme du silence : le service répond qu'il n'a pas entendu et propose de répéter ou d'écrire. **Aucun cas n'est ouvert, aucun agent n'est mobilisé.** À l'échelle d'un pays, c'est la différence entre un dispositif d'alerte crédible et un dispositif que les relais communautaires apprendront à ignorer — ce qui serait la pire issue possible, et elle est irréversible.

Le texte rejeté n'est pas effacé pour autant : il est enregistré avec le motif du rejet, conformément aux principes décrits dans l'article sur le [journal d'audit](/blog/journal-audit-chaine-verifiable). Un relecteur peut ainsi vérifier que le filtre n'a pas écarté une parole réelle, et le taux de rejet par langue devient un indicateur de qualité plutôt qu'un angle mort.

## Pourquoi ce problème frappe plus durement les langues congolaises

Un modèle produit d'autant plus d'inventions qu'il connaît mal la langue qu'il entend. Pour le français, le phénomène existe mais reste marginal. Pour le kikongo et le tshiluba, absents du répertoire des moteurs du marché, chaque enregistrement est par construction de l'audio « non reconnu » — c'est-à-dire exactement la condition qui déclenche l'invention.

Cela signifie qu'un service vocal déployé naïvement dans ces langues ne serait pas simplement médiocre : il serait **systématiquement inventif**, tout en paraissant fonctionner. C'est l'argument central des [seuils de qualité par langue](/blog/seuils-qualite-par-langue), et la raison pour laquelle une langue non mesurée reste en mode scripté.

La [carte du modèle Whisper publiée par OpenAI](https://github.com/openai/whisper) documente elle-même ce comportement et déconseille l'usage en haut risque sans garde-fous. Les corpus ouverts comme [Mozilla Common Voice](https://commonvoice.mozilla.org/) montrent la voie inverse : seule une donnée vocale réelle, collectée auprès de locuteurs, réduit le phénomène à la source. La collecte est décrite dans l'article sur le [corpus vocal des langues nationales](/blog/corpus-vocal-langues-nationales), et l'état par langue est publié sur la [page des langues nationales](/langues-nationales).

## Un filtre de forme, et pourquoi ce n'est pas un aveu de faiblesse

L'objection naturelle est la suivante : si le modèle invente, pourquoi ne pas simplement prendre un meilleur modèle ?

Parce que l'invention n'est pas un défaut de qualité, c'est une propriété du procédé. Un modèle qui produit toujours la suite la plus probable produira toujours quelque chose, y compris quand il n'y a rien. Un meilleur modèle invente moins souvent et plus crédiblement — ce qui, pour un service de santé, déplace le problème sans le résoudre.

C'est pourquoi le filtre porte sur la forme et non sur le sens. Demander à un modèle de langage si une transcription a été inventée revient à interroger la partie défaillante sur sa propre défaillance. Une règle qui compte des mots porteurs, repère un crédit de sous-titrage ou mesure une répétition ne dépend d'aucune inférence : elle produit le même verdict aujourd'hui et dans deux ans, et elle s'exécute même quand tous les fournisseurs sont indisponibles.

C'est le même raisonnement que celui qui place la détection des signes de danger avant l'appel au modèle, décrit dans l'article sur les [garde-fous d'un service public](/blog/garde-fous-ia-service-public) : la partie du système dont dépend la sécurité d'une personne ne doit pas être celle qui change toute seule.

## Comment vérifier ce comportement en trois minutes

Un partenaire peut tester ce dispositif sans accès au code, et le résultat est immédiatement lisible.

1. **Enregistrer dix secondes de silence, micro couvert, puis envoyer.** Le service doit répondre qu'il n'a rien entendu — et non produire une phrase. Si une phrase apparaît, le service n'a pas de filtre.
2. **Enregistrer du bruit ambiant sans parler**, dans un marché ou près d'une route. Même attente.
3. **Vérifier qu'aucun dossier n'a été créé** à la suite de ces deux essais. Un service qui ouvre un cas sur du silence mobilisera des agents de santé pour rien, et apprendra à ses relais à ignorer ses alertes.

Ces trois tests ne mesurent pas l'intelligence du système. Ils mesurent s'il sait reconnaître qu'il n'a rien entendu, ce qui est une qualité plus rare et, dans un service de santé, plus déterminante.

## Ce que cet épisode a appris au programme sur ses propres corrections

Il y a une seconde leçon dans cette histoire, plus inconfortable que la première, et elle concerne la manière dont on corrige un défaut de ce type.

La première correction tentée fut l'amorce de domaine déjà évoquée. Elle partait d'un raisonnement juste — éloigner le modèle du vocabulaire des sous-titres — et a produit un résultat strictement pire, puisqu'elle a rendu les inventions plausibles. Une deuxième correction, appliquée en même temps, consistait à fixer le décodage au mode le plus déterministe possible, dans l'idée de supprimer les variations. Elle a au contraire favorisé les boucles : le mécanisme qui permet à ces modèles de sortir d'une répétition est précisément celui qui avait été désactivé.

Deux corrections raisonnables, appliquées de bonne foi, qui ont aggravé le problème qu'elles visaient. Elles n'ont été identifiées comme telles que parce qu'un usager a signalé une réponse absurde et que le texte exact a pu être relu.

Le programme en a tiré une règle de conduite : on ne corrige pas un défaut de reconnaissance vocale en orientant le modèle vers le résultat souhaité. On mesure, on filtre en aval sur des critères qui ne dépendent pas du modèle, et on garde la trace de ce qui a été rejeté pour pouvoir vérifier que le filtre ne se trompe pas à son tour.

## Ce que ce filtre ne résout pas

Il écarte le texte inventé ; il ne rend pas le service capable d'entendre. Une personne dont la langue est mal reconnue obtiendra plus souvent « je n'ai pas compris » qu'une réponse — une expérience frustrante, et honnête.

Il ne corrige pas non plus une transcription partiellement fausse mais plausible : trois mots erronés dans une phrase par ailleurs correcte passent le filtre. C'est le rôle des seuils de qualité et de la [politique de confiance](/gouvernance) de limiter ce que le service ose dire dans ces conditions.

Enfin, il ne remplace pas un agent de santé. Devant un signe de danger, la [conduite à tenir](/urgence) est de se rendre immédiatement à la structure la plus proche, sans attendre une réponse du service.
