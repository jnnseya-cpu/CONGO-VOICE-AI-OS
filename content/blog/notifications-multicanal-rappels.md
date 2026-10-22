---
slug: notifications-multicanal-rappels
title: "Notifications multicanal : WhatsApp, SMS, puis appel"
description: "Les notifications multicanal suivent une politique écrite : repli de canal, heures de silence, plafond hebdomadaire, consentement aux rappels et accusé de réception."
lang: fr
category: Produit et canaux
cluster: canaux
pillar: false
publishedAt: 2026-10-22
updatedAt: 2026-10-22
author: Direction technique CONGO VOICE AI OS
authorRole: canaux de communication et politique d'envoi
reviewer: Comité de revue clinique (en cours de constitution)
reviewerRole: relecture des alertes d'escalade et des messages sensibles
keywords: [notifications multicanal, heures de silence, plafond hebdomadaire, consentement aux rappels, accusé de réception]
entities: [repli de canal, heures de silence, plafond hebdomadaire, accusé de réception, consentement, gabarit, journal de livraison, opérateur]
tags: [Canaux, Produit, Confidentialité, Gouvernance, RDC]
imageAlt: "Chaîne de repli d'un message : WhatsApp, puis SMS, puis appel vocal sortant, avec chaque tentative enregistrée"
takeaways:
  - "Aucun message n'est envoyé sans avoir d'abord été enregistré : tentatives, canal utilisé, identifiant du prestataire, heure de livraison et motif d'échec."
  - "Un message part sur WhatsApp, puis sur SMS, puis en appel vocal sortant, avec deux tentatives par canal avant de passer au suivant."
  - "Entre 21 h et 6 h, heure de Kinshasa, les messages non urgents attendent la fenêtre suivante. Les urgences partent immédiatement."
  - "Trois messages non urgents par citoyen et par semaine glissante, au maximum. Au-delà, le message est supprimé avec son motif, pas perdu."
  - "Un sujet sensible ne sort de la plateforme que dans une formulation lisible sans danger sur un écran verrouillé."
faq:
  - q: "Pourquoi commencer par WhatsApp plutôt que par le SMS ?"
  - a: "Parce qu'il est gratuit pour le programme, qu'il accepte des messages longs et qu'il confirme la livraison. Mais il suppose un téléphone compatible et des données : c'est pourquoi l'échec bascule vers le SMS, puis vers un appel vocal sortant, qui est le seul canal qui fonctionne pour une personne qui ne lit pas."
  - q: "Que devient un message bloqué par le plafond hebdomadaire ?"
  - a: "Il est enregistré avec le statut supprimé et le motif « plafond de fréquence ». Il n'est pas envoyé et il n'est pas perdu : on peut compter combien de messages ont été retenus, pour qui et pourquoi, et corriger une campagne trop bavarde au lieu de la découvrir par des plaintes."
  - q: "Les urgences sont-elles soumises aux mêmes règles ?"
  - a: "Non, et c'est délibéré. Une urgence ignore les heures de silence, le plafond hebdomadaire, le consentement aux rappels et le retrait d'accord. Ces protections existent pour éviter le harcèlement par un service public, pas pour empêcher d'alerter un relais communautaire à deux heures du matin."
  - q: "Comment sait-on qu'une alerte a été vue par un agent de santé ?"
  - a: "Par un accusé de réception explicite. Pour les alertes urgentes, « envoyé » et « acquitté » sont deux états distincts, et seul le second compte : une escalade non acquittée au bout du délai prévu est relancée vers le niveau supérieur."
  - q: "Que se passe-t-il si aucun prestataire n'est configuré ?"
  - a: "La plateforme utilise un prestataire de journalisation qui écrit le message au lieu de l'envoyer. C'est ce qui permet de faire tourner et de tester l'ensemble du système hors ligne, sans contrat et sans qu'un message de test parte vers un vrai numéro."
sources:
  - label: "GSMA — connectivité mobile en Afrique subsaharienne"
  - url: "https://www.gsma.com/"
  - label: "Union internationale des télécommunications — mesurer le développement numérique"
  - url: "https://www.itu.int/"
related: [acces-sans-smartphone-ivr-ussd-sms, escalade-relais-communautaires, protection-donnees-personnelles]
---

Un service de santé qui parle doit aussi savoir rappeler : une dose à reprendre, un suivi à trois jours, un agent de santé à alerter parce qu'un signe de danger vient d'être détecté. C'est la partie du produit qui semble triviale et qui casse le plus souvent, parce qu'elle dépend d'opérateurs, de réseaux et de téléphones que le programme ne contrôle pas. Les **notifications multicanal** ne sont donc pas un appel d'interface : ce sont une politique écrite, appliquée par le code, et dont chaque décision laisse une trace.

## Pourquoi un message est enregistré avant d'être envoyé

L'ordre des opérations est inversé par rapport à l'intuition. La plateforme écrit d'abord la ligne, puis tente la livraison. Jamais le contraire.

La raison est qu'un envoi est une opération qui échoue partiellement. Un opérateur accepte le message et ne le livre jamais ; un numéro est injoignable pendant six heures ; une passerelle répond une erreur temporaire qu'il faudra réessayer. Si l'enregistrement suit l'envoi, tout ce qui s'est passé entre les deux est perdu — et c'est exactement ce qu'un responsable de programme demande quand une famille affirme n'avoir rien reçu.

Chaque ligne conserve donc le destinataire, la langue, le type, le gabarit qui a produit le texte, le nombre de tentatives, le canal finalement utilisé, l'identifiant attribué par le prestataire, l'heure de livraison et le motif d'échec s'il y en a un. Les **notifications multicanal** du programme sont auditables au même titre que les décisions cliniques : on peut reconstituer, pour un cas donné, qui a été prévenu, par quel moyen et quand.

## Le repli de canal : WhatsApp, puis SMS, puis un appel

Un canal unique est une hypothèse sur l'équipement de la personne. Dans un pays où, selon les mesures de la [GSMA](https://www.gsma.com/) sur l'Afrique subsaharienne, une part importante des abonnés mobiles n'utilise pas de smartphone, cette hypothèse exclut précisément les ménages que le programme doit servir.

Le repli de canal est donc ordonné.

| Rang | Canal | Pourquoi à cette place | Ce qu'il suppose |
|---|---|---|---|
| 1 | WhatsApp | Gratuit pour le programme, texte long, accusé de livraison | Un smartphone et des données |
| 2 | SMS | Fonctionne sur tout téléphone, même sans données | Savoir lire |
| 3 | Appel vocal sortant | Le seul canal qui parle | Rien d'autre qu'une ligne active |

Deux tentatives sont faites par canal, espacées d'un délai croissant, avant de passer au suivant. Une exception est importante : une erreur de configuration — prestataire absent, destination inexistante — n'est pas réessayée. Elle ne se corrigera pas d'elle-même dans huit cents millisecondes, et insister ne fait que retarder le canal suivant.

Chaque tentative est consignée, y compris celles qui ont échoué. Cette piste permet de répondre à une question que les équipes se posent au bout de quelques semaines : lequel de nos canaux fonctionne réellement, dans quelle province, à quelle heure ? Les constats de l'[Union internationale des télécommunications](https://www.itu.int/) sur la qualité de service donnent le contexte ; seul le journal de livraison donne le chiffre local.

Pour une personne qui ne lit pas, l'appel vocal sortant n'est pas un dernier recours, c'est le canal principal. Cette logique est la même que celle décrite dans l'article sur l'[accès sans smartphone](/blog/acces-sans-smartphone-ivr-ussd-sms) : la voix est le format de base du service, pas une option d'accessibilité ajoutée après coup.

## Les cinq raisons pour lesquelles un message n'est pas envoyé

Un service public qui envoie trop devient un service que l'on bloque. La politique prévoit donc cinq motifs de suppression, chacun enregistré avec le message qu'il a retenu.

- **Destinataire inactif.** Un compte suspendu ou effacé ne reçoit rien, et la tentative est tracée au lieu d'échouer silencieusement.
- **Doublon.** Deux déclenchements du même événement dans une fenêtre de vingt-quatre heures produisent un seul message. Une alerte dupliquée est une alerte que l'on cesse de lire.
- **Retrait d'accord.** Une personne peut arrêter tous les messages non essentiels, par le mot-clé d'arrêt, par le menu vocal ou en le demandant à un agent.
- **Absence de consentement aux rappels.** Les rappels et les diffusions exigent un accord explicite pour cette finalité précise. Sans accord enregistré, rien ne part.
- **Plafond de fréquence.** Trois messages non urgents par citoyen et par semaine glissante, au maximum.

Ces cinq motifs ont une propriété commune : ils produisent une ligne, pas un silence. Un programme qui supprime sans enregistrer ne peut pas distinguer « nous avons choisi de ne pas envoyer » de « nous avons essayé et échoué », et ces deux phrases n'engagent pas la même responsabilité.

Les alertes destinées aux agents de santé et aux relais communautaires échappent au consentement et au plafond : ce ne sont pas des sollicitations commerciales, c'est leur travail. La distinction est faite sur le rôle du destinataire, dans le code, et non sur l'intention de celui qui déclenche l'envoi.

## Les gabarits, et pourquoi ils existent dans cinq langues

Un détail d'implémentation décide de la qualité perçue : le texte d'un message n'est pas écrit à l'endroit où l'envoi est déclenché. Il vient d'un catalogue de gabarits, identifiés par une clé, déclinés dans les cinq langues du service, et le code appelant fournit seulement des variables — un prénom, une date, le nom d'une structure de santé.

Trois bénéfices en découlent, et le troisième est celui que l'on sous-estime.

- **La traduction est relue une fois, pas à chaque appel.** Un rappel de suivi existe en français canonique puis en lingala, kikongo, swahili et tshiluba, validé par des locuteurs, et non reconstitué à la volée par un modèle au moment de l'envoi.
- **Le message est reproductible.** La clé du gabarit est conservée sur la ligne enregistrée, donc on peut réafficher exactement ce qui a été dit à une personne, même après une mise à jour du texte.
- **Une formulation dangereuse se corrige partout d'un coup.** Lorsqu'une relecture clinique signale qu'un rappel pourrait être lu comme un conseil de dose, la correction se fait dans le catalogue, pas dans quinze endroits du code.

Les notifications multicanal partagent ainsi la même discipline que le reste du service : le texte adressé à un citoyen est une donnée relue et versionnée, pas une chaîne de caractères improvisée dans une fonction.

## Les heures de silence et le plafond hebdomadaire

Deux protections visent la même chose : qu'un service public ne devienne pas une nuisance.

Les **heures de silence** couvrent la plage de 21 heures à 6 heures, à l'heure de Kinshasa — un fuseau sans heure d'été, ce qui simplifie le calcul et évite une classe entière de bogues saisonniers. Un message non urgent créé dans cette plage n'est pas annulé : il est programmé pour la fenêtre d'envoi suivante. Un rappel de vaccination qui réveille un ménage à deux heures du matin coûte, en confiance, bien plus que ce qu'il apporte en observance.

Le **plafond hebdomadaire** compte les messages non urgents réellement partis — envoyés ou lus — sur sept jours glissants, et non par semaine calendaire. Un plafond calendaire permettrait d'envoyer six messages en quarante-huit heures à cheval sur un dimanche, ce qui respecterait la règle en violant son intention.

Ces deux bornes s'appliquent aux notifications multicanal destinées aux citoyens et à elles seules. Les urgences traversent les deux protections sans condition. C'est la même asymétrie que l'on retrouve partout dans la plateforme : les garde-fous protègent le citoyen de l'excès de zèle du service, jamais le service de son devoir d'alerter.

## Un message qui n'en dit pas trop sur un écran verrouillé

Un SMS s'affiche sur un écran verrouillé, et un téléphone est souvent partagé dans un ménage. Un rappel qui mentionne une grossesse, un traitement ou un dépistage peut donc exposer une personne auprès de son entourage — un risque que les services de santé connaissent bien et que les plateformes numériques reproduisent régulièrement.

Les sujets marqués comme sensibles ne sortent donc jamais de la plateforme dans leur formulation complète. Le message externe devient une invitation neutre à consulter le service, et le corps réel reste accessible dans l'application, après authentification. La ligne enregistrée indique explicitement que le corps complet a été retenu, pour qu'une relecture ultérieure ne confonde pas cette prudence avec un message tronqué par erreur.

Cette règle s'articule avec le reste du dispositif décrit dans l'article sur la [protection des données personnelles](/blog/protection-donnees-personnelles), et avec la politique de résidence : une destination qu'un déploiement n'autorise pas n'est pas appelée du tout. Un prestataire d'envoi est un destinataire de données personnelles comme un autre — un numéro de téléphone et un texte sur la santé — et il figure à ce titre dans l'inventaire publié sur la [page de protection des données](/confidentialite).

## Envoyé n'est pas reçu, et reçu n'est pas lu

La distinction la plus utile de toute cette mécanique est aussi la plus simple à oublier dans un tableau de bord : un message envoyé n'est pas un message reçu.

Pour les alertes urgentes, le programme traite donc « envoyé » et « acquitté » comme deux états différents. Une escalade vers un agent de santé n'est considérée comme prise en charge que lorsqu'une personne l'a explicitement acquittée ; sans accusé de réception dans le délai prévu, elle est relancée vers le niveau suivant. Le mécanisme complet est décrit dans l'article sur l'[escalade vers les relais communautaires](/blog/escalade-relais-communautaires).

Cette règle a une conséquence que les équipes techniques n'aiment pas et que les équipes de terrain réclament : le taux de livraison des prestataires n'est pas un indicateur de performance du programme. Le seul chiffre qui compte pour une urgence est la proportion d'alertes acquittées dans le délai, par province et par tranche horaire. C'est beaucoup moins flatteur, et c'est le seul qui prédit si une famille sera effectivement rappelée.

## Ce que cette politique ne résout pas

Trois limites, pour ne pas vendre une fiabilité qui n'existe pas.

- **Le réseau n'est pas sous notre contrôle.** Une coupure prolongée chez un opérateur retarde les trois canaux à la fois. Le programme peut l'enregistrer, l'agréger et le signaler ; il ne peut pas l'éviter.
- **Un numéro change de mains.** Une carte SIM revendue envoie des rappels de santé à une personne qui n'a rien demandé. C'est l'une des raisons de la formulation neutre des messages sensibles, et une raison supplémentaire de borner la durée de conservation.
- **Le consentement aux rappels n'est pas une protection suffisante.** Un accord donné à l'oral, dans un contexte d'asymétrie, se retire plus difficilement qu'il ne se donne. C'est pourquoi le retrait doit rester possible par le canal le plus simple disponible — un mot-clé, une touche du menu vocal, une phrase à un agent — et pourquoi le programme mesure les retraits comme un signal de qualité, et non comme une perte.

Aucune de ces trois limites ne se corrige par du code, et c'est précisément pour cela qu'elles sont écrites ici : les notifications multicanal réduisent le nombre de personnes injoignables, elles ne le ramènent pas à zéro.

Ce que la plateforme garantit est donc borné et vérifiable : chaque message a une ligne, chaque tentative a une trace, chaque suppression a un motif, et devant un signe de danger la [conduite à tenir](/urgence) est transmise sans attendre qu'une règle de politesse le permette.
