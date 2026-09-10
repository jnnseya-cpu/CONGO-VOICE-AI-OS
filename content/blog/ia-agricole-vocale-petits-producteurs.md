---
slug: ia-agricole-vocale-petits-producteurs
title: "IA agricole vocale : le guide des petits producteurs"
description: "Contexte de l’exploitation, hypothèses honnêtes, actions gratuites d’abord, registre des intrants : comment une IA agricole vocale conseille sans nuire."
lang: fr
category: Agriculture
cluster: agriculture-vocale
pillar: true
publishedAt: 2026-09-02
updatedAt: 2026-09-10
author: Direction technique CONGO VOICE AI OS
authorRole: conception du module agriculture et élevage
reviewer: Comité de contenu agricole
reviewerRole: relecture agronomique et validation du registre des intrants
keywords: [IA agricole vocale, conseil agricole par téléphone en RDC, registre des intrants autorisés, diagnostic des maladies des cultures par photo, détection de foyers phytosanitaires]
entities: [manioc, mouche blanche, chenille légionnaire d’automne, registre des intrants, agent agricole, calendrier cultural, mosaïque africaine du manioc, striure brune du manioc, maladies à déclaration obligatoire, lutte intégrée]
tags: [Agriculture, Élevage, Sécurité des intrants, Surveillance phytosanitaire, RDC]
imageAlt: "Producteur photographiant une feuille de manioc atteinte avec un téléphone simple, au bord de sa parcelle"
takeaways:
  - "Aucun conseil n’est produit avant que la culture, le stade, la proportion atteinte et les intrants récents soient connus : sans contexte, une hypothèse n’est qu’une devinette."
  - "Une correspondance visuelle reste formulée comme « possible » tant que la première hypothèse n’atteint pas soixante pour cent, et le cas part vers un humain sous quarante pour cent."
  - "Les recommandations sont ordonnées en trois niveaux : sans dépense, petits moyens locaux, puis achat — et le troisième niveau passe toujours par l’agent agricole."
  - "Aucun produit chimique ou vétérinaire n’est nommé s’il ne correspond pas à une entrée homologuée du registre, avec son étiquette, sa protection et son délai avant récolte."
faq:
  - q: "Une IA agricole vocale peut-elle diagnostiquer une maladie à partir d’une simple photo ?"
    a: "Non, et le service ne le prétend pas. Il classe au plus trois hypothèses avec ce qui plaide pour et ce qui plaide contre chacune. Au-dessus de soixante pour cent, la première est présentée comme la correspondance la plus probable, à confirmer sur le terrain ; en dessous, elle reste une correspondance possible et une deuxième photo est demandée."
  - q: "Pourquoi le service refuse-t-il de me conseiller un pesticide ?"
    a: "Parce qu’un nom de produit sans homologation vérifiée est un risque sanitaire, économique et environnemental. Toute phrase mentionnant un produit est confrontée au registre officiel des intrants ; sans correspondance homologuée, le conseil est retiré et remplacé par des actions non chimiques et une orientation vers l’agent agricole."
  - q: "Que se passe-t-il si ma photo est floue ou trop sombre ?"
    a: "Elle est écartée avant toute analyse visuelle, et le service explique comment reprendre la prise de vue : lumière du jour, environ trente centimètres, téléphone immobile, sans contre-jour. Une vidéo est conservée comme preuve pour l’agent agricole mais n’est pas analysée automatiquement."
  - q: "Le service peut-il déclarer une épidémie dans mon territoire ?"
    a: "Non. Quand cinq signalements ou plus décrivent le même problème sur la même culture, dans le même territoire, sur quatorze jours glissants, un foyer est ouvert avec le statut « non vérifié » et le réseau agricole est alerté. Seul un agent qualifié confirme, rejette ou clôt ce foyer."
  - q: "Faut-il un smartphone pour utiliser le module agricole ?"
    a: "Non. La description orale suffit pour la plupart des questions : calendrier de semis, prix relevés, conduite d’un élevage familial. La photo améliore le tri des hypothèses quand elle est possible, elle n’est pas une condition d’accès au service."
sources:
  - label: "Organisation des Nations unies pour l’alimentation et l’agriculture (FAO)"
    url: "https://www.fao.org/"
  - label: "Institut international d’agriculture tropicale (IITA)"
    url: "https://www.iita.org/"
  - label: "Convention internationale pour la protection des végétaux (CIPV)"
    url: "https://www.ippc.int/"
  - label: "CABI — travaux sur la santé des plantes et l’appui aux petits producteurs"
    url: "https://www.cabi.org/"
related: [mosaique-manioc-diagnostic-photo, chenille-legionnaire-mais, garde-fous-ia-service-public, ia-vocale-langues-congolaises]
---

Un producteur de Kwilu qui décrit au téléphone des feuilles jaunies ne demande pas un article de vulgarisation. Il demande quoi faire cette semaine, avec ce qu’il a. Une **IA agricole vocale** utile n’est donc pas celle qui reconnaît le mieux une maladie sur une photo : c’est celle qui refuse de conseiller avant d’avoir compris la parcelle, qui commence par ce qui ne coûte rien, et qui sait dire qu’elle n’est pas sûre. Ce texte décrit comment le module agriculture et élevage de CONGO VOICE AI OS est construit, quelles règles sont écrites dans le code plutôt que confiées au modèle, et ce que le programme n’a pas encore tranché.

## Ce qu’une IA agricole vocale doit savoir avant de conseiller quoi que ce soit

Le premier travail du système n’est pas de reconnaître une des maladies des cultures ou de l’élevage, c’est de reconstituer une situation. Neuf éléments de contexte sont extraits de la parole du producteur avant toute recommandation, et la réponse change selon leur valeur. Quand un élément manque, le service pose une question de plus au lieu de combler le vide.

| Élément de contexte | Pourquoi il change la réponse | D’où il vient |
|---|---|---|
| Culture ou espèce animale | Le même symptôme n’a pas la même cause sur manioc, sur maïs ou sur volaille | Déclaration du producteur, confirmée si besoin |
| Variété ou race | Certaines variétés sont tolérantes ; l’historique de la bouture compte | Déclaration du producteur |
| Stade de développement | Préparation, semis, levée, croissance, floraison, récolte : les gestes possibles ne sont pas les mêmes | Déclaration, recoupée avec la saison |
| Proportion atteinte | Quelques plants, un quart, la moitié, plus de la moitié, tout le champ | Déclaration, cadrée en catégories |
| Intrants récents | Semences, engrais, traitements, aliments : une brûlure d’engrais n’est pas une maladie | Déclaration du producteur |
| Date d’apparition | Une évolution en trois jours et une évolution en trois mois n’orientent pas vers la même chose | Déclaration du producteur |
| Province et territoire | Détermine la zone agro-écologique, la saison et le calendrier cultural | Profil de session, jamais deviné |
| Saison en cours | Saison A, saison B, saison sèche ou petite saison sèche | Calcul déterministe à partir de la province et de la date |
| Pièces jointes | Photos exploitables, vidéos conservées comme preuve | Contrôle technique automatique |

La saison mérite une précision. Elle n’est jamais demandée au modèle : elle est calculée à partir d’une table qui associe chacune des vingt-six provinces à une zone de pluies — nord, équatorial, sud ou altitude — et du mois en cours. Au sud de l’équateur, la saison A court de septembre à décembre ; au nord, elle court de mars à juin. Un conseil de semis qui se tromperait de saison serait pire qu’un silence, et ce genre d’erreur n’a pas à dépendre d’un modèle génératif.

### La proportion atteinte n’est pas un détail de formulaire

Cette seule valeur décide de plusieurs comportements. Au-dessus de la moitié de la parcelle ou du troupeau, le cas est marqué urgent, la gravité monte et un agent agricole est saisi, quelle que soit la confiance du diagnostic. C’est une règle écrite, pas une appréciation : une infestation généralisée est un problème de moyens et d’organisation, pas un problème de reconnaissance d’image.

## Pourquoi une correspondance visuelle reste-t-elle « possible » tant que les seuils ne sont pas atteints ?

Le vocabulaire du service est contraint par des seuils numériques, et non par le ton du modèle. Le mot « diagnostic » n’est jamais employé comme une affirmation.

Avant toute analyse visuelle, chaque pièce jointe passe un contrôle technique lisible : dimensions lues dans l’en-tête du fichier, densité d’information — le nombre d’octets compressés par pixel, un bon indicateur d’une photo très sombre, floue ou trop compressée — et détection des fichiers incomplets. Une photo dont le plus petit côté descend sous quatre cent quatre-vingts pixels, ou dont la densité tombe sous le seuil, n’est pas envoyée à un modèle de vision : le service demande une nouvelle prise de vue et explique comment la réussir. C’est une économie de moyens autant qu’une règle de prudence, et cela évite de facturer au programme une analyse qui ne pouvait rien donner.

Une fois l’image jugée exploitable, le classement des hypothèses obéit à deux seuils :

- **au-dessus de 60 %** pour la première hypothèse, la formulation devient « correspondance la plus probable, à confirmer sur le terrain » ;
- **en dessous de 60 %**, chaque hypothèse reste une « correspondance possible » et une deuxième photo est demandée, sous un autre angle — face inférieure des feuilles, ou l’animal entier puis la partie atteinte ;
- **en dessous de 40 %**, le cas est orienté vers un agent agricole quelle que soit l’urgence, parce qu’un avis à distance trop incertain ne doit engager aucune dépense.

Trois hypothèses au maximum sont présentées, chacune avec les indices retenus et les indices contraires ou manquants. Cette dernière colonne est celle qui rend l’avis utilisable : elle dit au producteur ce qu’il doit aller regarder lui-même. Quand aucune photo exploitable n’a été reçue, la confiance globale de la réponse est plafonnée par construction, même si la description orale est excellente.

## Trois niveaux d’action, dans un ordre qui n’est pas négociable

Une **IA agricole vocale** qui commence par proposer un achat est une machine à endetter des ménages. L’ordre des recommandations est donc imposé par le code, et non laissé à la rédaction du modèle.

1. **Sans dépense.** Retirer et détruire les plants ou parties atteints loin de la parcelle, prélever les boutures uniquement sur des pieds sains, respecter les écartements, sarcler, isoler les animaux malades, nettoyer l’abreuvoir et la mangeoire à l’eau savonneuse, noter la date, la parcelle et le nombre de plants ou d’animaux touchés.
2. **Avec de petits moyens locaux.** Ce qui se trouve au village ou au marché voisin : cendre de bois, sable sec, extrait de feuilles de neem, associations culturales qui favorisent les prédateurs naturels, paillage, boutures tolérantes obtenues auprès du service agricole ou d’un multiplicateur agréé.
3. **Si un achat s’avère nécessaire.** Et seulement à ce stade, un produit homologué peut être nommé — jamais sans passer par l’agent agricole du secteur, qui doit avoir vu la parcelle ou les animaux.

Cet ordre reflète l’état des connaissances agronomiques autant qu’une position politique. Les travaux de gestion intégrée diffusés par [l’Organisation des Nations unies pour l’alimentation et l’agriculture](https://www.fao.org/) et les programmes de sélection variétale conduits par [l’Institut international d’agriculture tropicale](https://www.iita.org/) convergent sur le même point : sur les systèmes de petite taille, les pratiques culturales et le matériel végétal sain déterminent l’essentiel du résultat, bien avant le recours chimique.

À chaque niveau s’ajoute une liste de ce qu’il ne faut surtout pas faire. Elle est aussi importante que les actions elles-mêmes : ne pas replanter des boutures issues d’un champ malade, ne pas jeter les plants arrachés au bord de la parcelle, ne pas traiter un virus à l’insecticide, ne pas mélanger plusieurs produits, ne pas déplacer d’animaux hors de l’exploitation quand une maladie à déclaration obligatoire est suspectée.

## La règle du registre : aucun produit nommé sans homologation vérifiée

C’est le garde-fou le plus strict du module. Toute phrase de conseil qui mentionne un pesticide, un herbicide, un fongicide, un engrais minéral, un antibiotique, un vermifuge, un antiparasitaire ou un vaccin est confrontée au registre officiel des intrants autorisés tenu par la plateforme. Le mot suffit à déclencher la vérification, et un nom de produit sans mot générique la déclenche aussi.

Le conseil n’est conservé que si le registre classe le produit comme homologué. Dans ce cas, quatre informations sont ajoutées d’office à la réponse, parce qu’un nom de produit seul est un conseil dangereux :

- le mode d’emploi homologué, tel qu’il figure sur l’étiquette ;
- l’équipement de protection obligatoire ;
- le délai avant récolte ou avant consommation ;
- le délai avant de retourner dans la parcelle traitée.

Dans tous les autres cas, la phrase est supprimée. Un produit interdit en République Démocratique du Congo est nommé uniquement pour être déconseillé. Un produit réservé au vétérinaire est signalé comme tel, avec la mention qu’il ne s’achète pas au marché. Quand une phrase pourrait correspondre à deux entrées du registre, c’est toujours la plus restrictive qui l’emporte : le blocage plutôt que l’autorisation. Le texte de repli qui remplace le conseil retiré est fixe, relu et traduit : n’achetez rien sur simple conseil, passez par l’agent agricole ou le vétérinaire de votre secteur, qui confirmera le diagnostic et, si un produit est nécessaire, indiquera un produit homologué et sa dose.

Une conséquence assumée : le service est parfois moins « utile » qu’un vendeur de marché, qui, lui, nommera toujours quelque chose. C’est exactement l’effet recherché. Le détail de cette règle et la liste des refus explicites figurent sur [la page publique des services du programme](/services#agriculture).

## Comment des signalements isolés deviennent-ils un foyer à vérifier ?

La détection de foyers phytosanitaires repose sur ce qu’un producteur isolé ne peut pas voir : la répétition. La règle de regroupement est déterministe et publiée. Quand au moins cinq signalements décrivent le même problème sur la même culture, dans le même territoire — ou à défaut la même province — sur une fenêtre glissante de quatorze jours, un foyer est ouvert avec le statut « non vérifié », un événement est enregistré et le réseau des agents agricoles est alerté.

Trois précautions encadrent ce mécanisme. La plateforme ne déclare jamais une épidémie : seul un agent qualifié fait passer un foyer de « non vérifié » à « confirmé » ou « rejeté ». Un foyer dont le nombre de signalements reste sous le seuil de confidentialité est publié sans son territoire, pour qu’une poignée d’exploitations ne puisse pas être reconnue. Enfin, les seuils — cinq signalements, quatorze jours — sont des paramètres de configuration modifiables par l’autorité agricole, sans changement de code.

Certaines situations n’attendent pas le seuil. Une liste de maladies et de ravageurs à déclaration obligatoire — mosaïque africaine du manioc, striure brune, chenille légionnaire d’automne, bunchy top du bananier, invasion acridienne, maladie de Newcastle, peste des petits ruminants, peste porcine africaine — déclenche une alerte dès la première suspicion, même isolée, même si la gravité individuelle du cas est faible. Ce principe de notification est celui que promeut [la Convention internationale pour la protection des végétaux](https://www.ippc.int/) : un foyer non signalé coûte infiniment plus cher qu’un signalement inutile.

## Ce que la voix change pour un producteur qui ne lit pas

Le choix de la voix n’est pas une préférence d’interface. Une part importante des exploitations familiales est conduite par des personnes qui ne lisent pas couramment le français, et pour lesquelles une application écrite n’existe pas. Une **IA agricole vocale** accessible par appel, par message vocal ou par menu à touches change la population atteinte, pas seulement le confort d’usage.

Trois contraintes de terrain en découlent. La bande passante impose un audio compressé et un envoi par morceaux, avec reprise après coupure ; c’est aussi pourquoi la photo est vérifiée sur le téléphone avant d’être transmise. L’électricité intermittente interdit les sessions longues : un échange interrompu doit pouvoir reprendre où il s’est arrêté. Le téléphone partagé interdit d’assimiler l’identité à un numéro. Les canaux disponibles et leurs limites sont décrits sur [la page d’accès au service](/acces), et la couverture par langue sur [la page des langues nationales](/langues-nationales).

Les données factuelles ne sont jamais produites par le modèle. Les prix viennent de relevés de marché datés, cités avec le marché, la date et la source. La météo vient d’un service de prévision interrogé pour le centroïde de la province, avec repli sur une réponse saisonnière quand le réseau manque. Les calendriers de semis viennent d’une table province par culture. Le modèle explique ces chiffres ; il ne les invente pas.

## Ce que ce module ne fait pas, et ce qui n’est pas encore décidé

La transparence sur les limites fait partie du dispositif, au même titre que les seuils.

- Le service **n’affirme jamais un diagnostic** à distance, n’invente ni prix, ni date de semis, ni prévision, et ne conseille aucun produit absent du registre.
- Le **comité de contenu agricole n’est pas encore constitué**. Les calendriers culturaux, le registre des intrants et la liste des maladies à déclaration portent aujourd’hui la mention d’un approbateur en attente, et non le nom d’une autorité désignée. C’est une condition de lancement, décrite avec les autres sur [la page sécurité et gouvernance](/gouvernance).
- La **couverture du registre est partielle**. Il contient les entrées nécessaires aux cas les plus fréquents, y compris des produits interdits inscrits pour être refusés ; il n’est pas encore le miroir complet de l’homologation nationale.
- Les **prix de marché** disponibles proviennent d’une série initiale de préparation, pas encore d’un flux quotidien consolidé à l’échelle du pays.
- La **reconnaissance visuelle des maladies de l’élevage** est nettement moins fiable que celle des maladies foliaires : sur un animal, le service demande presque toujours le passage d’un agent.

Deux articles détaillent des cas concrets de cette mécanique : le [diagnostic photo de la mosaïque du manioc](/blog/mosaique-manioc-diagnostic-photo) et la conduite à tenir face à la [chenille légionnaire d’automne sur le maïs](/blog/chenille-legionnaire-mais). La logique commune — des règles déterministes autour d’un modèle qui explique sans décider — est exposée dans l’article consacré aux [garde-fous d’une IA de service public](/blog/garde-fous-ia-service-public).
