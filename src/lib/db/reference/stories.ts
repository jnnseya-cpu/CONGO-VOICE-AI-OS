/**
 * Read-aloud library (FR-ED-05).
 *
 * Twelve original short stories written for this platform — two per platform language,
 * primary level, 150 to 250 words, set in Congolese daily life. They carry no third-party
 * rights: `licence` is "programme", meaning they belong to the national programme and may be
 * read, printed and recorded freely by schools.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { LanguageCode } from "@/lib/db/schema";

export interface StorySeed {
  language: LanguageCode;
  title: string;
  level: string;
  body: string;
  /** Reading focus, used by the lesson that follows the reading. */
  focus: string;
  comprehensionQuestions: string[];
}

export const STORIES: StorySeed[] = [
  {
    language: "fr",
    title: "Le panier de Mama Nzuzi",
    level: "primaire",
    focus: "lecture à voix haute et compréhension d'un récit court",
    comprehensionQuestions: ["Que vend Mama Nzuzi au marché ?", "Pourquoi Kito revient-il en courant ?", "Qu'apprend Kito à la fin de l'histoire ?"],
    body: `Chaque matin, Mama Nzuzi part au marché avec son grand panier sur la tête. Dedans, elle range des tomates rouges, des feuilles de manioc bien vertes et quelques mangues encore dures.

Son fils Kito marche derrière elle. Il compte les pas jusqu'au marché : cent, deux cents, trois cents. Quand ils arrivent, le soleil commence à chauffer et les vendeuses installent leurs nattes.

Ce jour-là, une dame achète toutes les tomates d'un coup. Mama Nzuzi est contente, mais elle remarque que la dame a laissé tomber un billet en s'en allant. Kito voit le billet lui aussi. Il le ramasse, le regarde longtemps, puis regarde sa mère.

« Cours », dit Mama Nzuzi.

Kito court entre les étals, saute par-dessus un panier de charbon et rattrape la dame près des mangues. Il lui tend le billet, essoufflé. La dame sourit, prend le billet et lui donne une petite pièce.

En revenant, Kito demande : « Mama, pourquoi tu m'as dit de courir ? On aurait pu garder l'argent. »

Mama Nzuzi pose son panier, s'accroupit et répond : « Cet argent nourrissait déjà une autre famille. Ce qui est à nous, c'est le travail de nos mains, pas ce qui tombe de la poche des autres. »

Le soir, Kito raconte l'histoire à sa petite sœur. Il n'oublie pas la pièce, mais il retient surtout la phrase de sa mère.`,
  },
  {
    language: "fr",
    title: "La pirogue de Tantine Élodie",
    level: "primaire",
    focus: "récit et suite logique des événements",
    comprehensionQuestions: ["Où Élodie emmène-t-elle les enfants ?", "Quel problème arrive sur la rivière ?", "Comment les enfants résolvent-ils le problème ?"],
    body: `Tantine Élodie possède la seule pirogue du village. Le samedi, elle emmène les enfants de l'autre côté de la rivière pour ramasser du bois mort.

Ce matin-là, six enfants montent : Kito, Nsimba, Mwamba, Bijou, Landu et la petite Ngalula, qui a peur de l'eau. Élodie leur explique la règle : on s'assoit, on ne se lève pas, on rame ensemble.

Au milieu de la rivière, la pagaie d'Élodie se casse en deux. La pirogue commence à descendre avec le courant. Ngalula veut se lever ; Nsimba la retient doucement par le bras.

« Personne ne bouge », dit Élodie calmement. « Réfléchissons. »

Mwamba montre les longues perches de bambou attachées sous le banc. Landu propose de les utiliser comme pagaies. Les enfants les détachent, deux d'un côté, deux de l'autre, et ils rament en comptant : un, deux, un, deux.

Lentement, la pirogue traverse et touche le sable de l'autre rive. Ngalula descend la première et éclate de rire.

Sur le chemin du retour, Élodie porte la pagaie cassée sur l'épaule. Elle dit aux enfants : « Vous voyez ? La peur voulait vous faire lever. La réflexion vous a fait avancer. »

Depuis ce jour, il y a toujours quatre perches de bambou dans la pirogue.`,
  },
  {
    language: "ln",
    title: "Mwana ya bilanga",
    level: "primaire",
    focus: "botangi ya makomi mpe boyebi ya lisolo",
    comprehensionQuestions: ["Nani akendaki na bilanga?", "Likambo nini esalemaki na mbula?", "Mwana ayekolaki nini?"],
    body: `Mokolo moko ya ntongo, Bosembo alamukaki liboso ya bato nyonso ya ndako. Mama na ye alobaki: « Kende na bilanga, tala soki masangu ekoli malamu. »

Bosembo akamataki mbeli moke mpe akendaki. Nzela ezalaki molai, kasi ayebaki yango malamu: liboso nzete ya mangolo, na sima libulu ya mayi, na sima bilanga.

Tango akomaki, amonaki ete makasa mingi ekomi na madusu. Bankeni ezalaki kolia masangu na kati ya cornet. Bosembo atalaki malamu mpe abandaki kolongola bankeni moko na moko, atiaki yango na kati ya saki.

Na midi, mbula ebandaki. Bosembo akimaki te. Atikalaki na nse ya nzete mpe azelaki. Ntango mbula esilaki, akobaki mosala na ye kino nzete nyonso ya liboso esilaki kotalama.

Na pokwa, azongaki na ndako na saki na ye. Mama atalaki mpe atunaki: « Osali nini mokolo mobimba? »

Bosembo alobaki: « Nakangaki bankeni nyonso oyo namonaki. Lobi nakozonga mpo na oyo etikali. »

Mama asepelaki mpe alobaki: « Mosala ya bilanga ezali mosala ya mokolo na mokolo. Moto oyo azelaka mbula esila liboso ya kosala, akobuka eloko te. »

Sanza misato na sima, bilanga ya Bosembo epesaki masangu koleka bilanga nyonso ya mboka.`,
  },
  {
    language: "ln",
    title: "Ndeko mibale mpe motuya",
    level: "primaire",
    focus: "kotanga mpe kokabola na biteni ekokani",
    comprehensionQuestions: ["Bandeko bazwaki nini?", "Bakabolaki ndenge nini?", "Nani asalisaki bango?"],
    body: `Lisumu mpe Kembo bazali bandeko. Mokolo moko, tata na bango apesaki bango bambuma zomi na mibale ya mangolo mpe alobaki: « Bokabola yango kaka ndenge moko. »

Lisumu azalaki mokolo koleka. Alobaki: « Ngai nakozwa nsambo, yo okozwa mitano. » Kembo alelaki: « Yango ekokani te! »

Bakendaki epai ya koko na bango. Koko azalaki kofanda na nse ya nzete ya bananas. Ayokaki bango mpe abengaki mwana ya moke ya mboka, Alima, oyo azalaki na kelasi ya minei.

Alima azwaki mabele ya moke mpe akomaki bilembo. Atiaki bambuma na milongo mibale, mbuma moko awa, mbuma moko kuna, kino nyonso esilaki. Milongo mibale ezalaki na bambuma motoba mokomoko.

« Zomi na mibale kokabola na mibale, ezali motoba », alobaki Alima. « Yango nde bokabola ya solo. »

Lisumu atalaki milongo. Amonaki ete Alima alobi solo. Azwaki motoba, apesaki Kembo motoba.

Koko alobaki: « Motuya ezali monguna te. Ezali moninga oyo akabolaka kaka ndenge moko mpo na bato nyonso. »

Uta mokolo wana, Lisumu na Kembo bakabolaka biloko na bango na milongo mibale, mpe soki bayebi te, babengaka Alima.`,
  },
  {
    language: "kg",
    title: "Nkento ya mbizi",
    level: "primaire",
    focus: "kutanga mpi kubakisa ntangu ya lusadisu",
    comprehensionQuestions: ["Nani vandaka kuloba mbizi?", "Nki diambu bwa na nzadi?", "Beto ke longuka nki?"],
    body: `Na mwanda ya nzadi, Nsimba vandaka kuloba mbizi ti tata na yandi. Konso mbasi, bo ke kwenda ti bulungu mpi ti nsinga ya nene.

Kilumbu mosi, tata bwaka bela. Nsimba tubaka: « Mono ta kwenda mono mosi. » Mama na yandi pesaka yandi lukanu: « Kwenda, kansi kuvutuka ntete ntangu ntoto me yela. »

Nsimba kwendaka. Yandi tulaka bulungu na masa mpi vingilaka. Ntangu mosi, zole, tatu — kima ve. Ntima na yandi bandaka kubwa.

Na ntangu ya midi, yandi monaka nde bantu ya nkaka na simu ke bakisa mbizi mingi. Yandi kwendaka penepene mpi yulaka: « Beno ke sala nki ya mono ke sala ve? »

Muntu ya nunu, Ta Lemba, sekaka mpi songaka yandi masa. « Mbizi ke lala ve na kati ya masa ya mbote. Yo ke lala na nsi ya matiti, na kisika ya mvula ke kwisa. Tula bulungu na kati ya matiti. »

Nsimba salaka mutindu Ta Lemba songaka yandi. Ntangu fioti na nima, bulungu ninganaka. Yandi bakisaka mbizi zole ya nene.

Na nzo, mama sekaka: « Nge bakisaka mbizi, kansi nge bakisaka mpi diambu ya nene: kuyula muntu ya me longuka ntete. »

Uta kilumbu yina, Nsimba ke yula ntete, mpi ke loba mbote.`,
  },
  {
    language: "kg",
    title: "Kiti ya kelasi",
    level: "primaire",
    focus: "kutanga mpi kuzaba mfunu ya kisalu ya kimvuka",
    comprehensionQuestions: ["Nki kima vandaka kukonda na kelasi?", "Bana salaka nki?", "Nani sadisaka bo?"],
    body: `Na kelasi ya Ta Mbemba, bana kumi na tanu vandaka kufonda na ntoto, sambu bakiti vandaka kaka nana.

Kilumbu mosi, Landu tubaka: « Beto lenda sala bakiti na beto mosi. » Bana yonso sekaka. Kansi Landu vandaka na lukanu.

Na mposo, bana kwendaka na fioti ya mfinda mpi bakisaka banti ya me bwa. Bo nataka yo na kelasi. Ta Mbemba pesaka bo nsinga ti misumari.

Bana salaka kimvuka: bantu tanu ke tenda banti, bantu tanu ke kanga, bantu tanu ke kombula. Konso mposo, bo salaka kiti mosi.

Na nsuka ya ngonda, kelasi vandaka na bakiti kumi na nana. Muntu ya kukonda kiti vandaka diaka ve.

Ta Mbemba tubaka na bana: « Beno longukaka ve kaka na kusala bakiti. Beno longukaka nde kisalu ya kimvuka ke sukisa mambu yina muntu mosi lenda sukisa ve. »

Landu vutulaka: « Mpi beto longukaka kutanga mpi kutanga banti! »

Kelasi yonso sekaka, mpi Ta Mbemba sonikaka na tablo: kumi na nana bakiti, kumi na tanu bana, tatu ya kubikala sambu na banzenza.`,
  },
  {
    language: "sw",
    title: "Kikapu cha Bibi Amina",
    level: "primaire",
    focus: "kusoma kwa sauti na kuelewa hadithi fupi",
    comprehensionQuestions: ["Bibi Amina anauza nini?", "Nini kilitokea sokoni?", "Hadithi inatufundisha nini?"],
    body: `Bibi Amina anaishi karibu na soko la Kadutu. Kila asubuhi anajaza kikapu chake kwa nyanya, majani ya muhogo na ndizi.

Mjukuu wake, Zawadi, humsaidia kubeba kikapu kidogo. Njiani wanahesabu magari yanayopita: moja, mawili, matatu.

Siku moja, mwanamke mmoja alinunua nyanya zote mara moja. Alipoondoka, noti ilianguka kutoka mfukoni mwake. Zawadi aliiona kwanza.

Aliinama, akaichukua, na akamtazama bibi yake kwa muda mrefu.

« Kimbia », alisema Bibi Amina.

Zawadi alikimbia kati ya wauzaji, akaruka juu ya kikapu cha mkaa, na akamfikia yule mwanamke karibu na mizani. Alimpa noti huku akihema.

Mwanamke alitabasamu, akachukua noti, na akampa Zawadi sarafu ndogo.

Wakirudi, Zawadi aliuliza: « Bibi, kwa nini uliniambia nikimbie? Tungeweza kuiweka. »

Bibi Amina aliweka kikapu chini, akachuchumaa, na akajibu: « Fedha ile ilikuwa tayari inalisha familia nyingine. Kilicho chetu ni kazi ya mikono yetu, si kile kinachoanguka kutoka mfuko wa mwingine. »

Jioni, Zawadi aliwasimulia wadogo zake. Hakusahau sarafu, lakini alikumbuka zaidi maneno ya bibi yake.`,
  },
  {
    language: "sw",
    title: "Shamba la Baba Kalala",
    level: "primaire",
    focus: "kusoma na kufuata mfuatano wa matukio",
    comprehensionQuestions: ["Baba Kalala alipanda nini?", "Tatizo lilikuwa nini?", "Watoto walisaidiaje?"],
    body: `Baba Kalala alipanda mahindi katika shamba lililo nyuma ya nyumba. Mvua ilinyesha vizuri, na mahindi yakachipuka haraka.

Lakini siku moja, alikuta majani yametobolewa. Ndani ya kila kichipukizi kulikuwa na viwavi wadogo wenye njaa.

Aliwaita watoto wake watatu: Neema, Baraka na Tumaini.

« Tutafanya kazi asubuhi na mapema », alisema. « Viwavi hujificha jua likiwaka. »

Siku iliyofuata, walitoka wakiwa na ndoo. Neema alikagua safu ya kwanza, Baraka ya pili, Tumaini ya tatu. Kila mmoja alikusanya viwavi na kuwaweka ndani ya ndoo.

Baada ya siku tatu, majani mapya yalianza kuota tena. Baba Kalala aliwaonyesha watoto tofauti kati ya mmea ulioshambuliwa na mmea uliopona.

« Hatukutumia dawa yoyote », alisema. « Tulitumia macho yetu na mikono yetu, na tulikuja mapema. »

Neema aliuliza: « Je, watarudi? »

« Labda », alijibu baba. « Ndiyo maana tutakagua kila wiki. Shamba linalotazamwa halipotei. »

Mwaka ule, familia ilivuna magunia kumi na mbili, mengi kuliko mwaka uliopita.`,
  },
  {
    language: "lua",
    title: "Muana wa mu budimi",
    level: "primaire",
    focus: "kubala ne kumvua muyuki mukese",
    comprehensionQuestions: ["Nganyi wakaya mu budimi?", "Bualu kayi buakenzeka?", "Muana wakalonga tshinyi?"],
    body: `Dituku dimue mu dinda, Kabedi wakabika kumpala kua bantu bonso ba mu nzubu. Mamuende wakamba ne: « Ndaku mu budimi, tangila bikala mataba adi akola bimpe. »

Kabedi wakangata mueji mukese, kuyaye. Njila yakadi mule, kadi yeye wakadi umanye bimpe: kumpala mutshi wa mangu, panyima dina dia mâyi, panyima budimi.

Pakafikaye, wakamona ne makasa a bungi adi ne mensu. Bishipa bivua bidia mataba munkatshi. Kabedi wakatangila bimpe, kutuadijaye kumbusha bishipa bimue ne bimue, kubiela mu tshibutu.

Ku munda kua dituku, mvula yakatuadija. Kabedi kakanyema to. Wakashala muinshi mua mutshi, kuindilaye. Pakajika mvula, wakatungunuka ne mudimu wende too ne pakajika mutshi wa kumpala wonso.

Ku dilolo, wakapingana ku nzubu ne tshibutu tshiende. Mamu wakatangila, kuebejaye: « Wenzele tshinyi dituku dijima? »

Kabedi wakamba: « Ngakuata bishipa bionso bimvua mumone. Malaba nengapingane bua bidi bishale. »

Mamu wakasanka, kuambaye: « Mudimu wa budimi udi mudimu wa dituku ne dituku. Muntu udi uindila mvula ijike bua kuenza mudimu, kena upeta bintu to. »

Ngondo isatu panyima, budimi bua Kabedi buakafila mataba a bungi kupita budimi buonso bua mu tshimenga.`,
  },
  {
    language: "lua",
    title: "Bana babidi ne mabele",
    level: "primaire",
    focus: "kubala ne kuabanya mu bitupa bidi bifuanangana",
    comprehensionQuestions: ["Tatu wakapesha bana tshinyi?", "Bakabanya munyi?", "Nganyi wakabambuluisha?"],
    body: `Ilunga ne Kalombo mbana ba mamu umue. Dituku dimue, tatuabu wakabapesha mangu dikumi ne abidi, kuambaye: « Nubanye anu mushindu umue. »

Ilunga uvua mukole kupita. Wakamba ne: « Meme nengangate muanda mutekete, wewe neuangate itanu. » Kalombo wakadila: « Kabiena bifuanangana to! »

Bakaya kudi nkambua wabu. Nkambua uvua musombe muinshi mua mutshi wa bitota. Wakabumvua, kubikilaye muana mukese wa mu tshimenga, Ngalula, uvua mu kalasa ka inayi.

Ngalula wakangata mafuma, kufundaye bimanyinu panshi. Wakateka mangu mu mikoloni ibidi: dimue apa, dimue apa, too ne pakajika onso. Mikoloni yonso ibidi yakadi ne mangu asambombo.

« Dikumi ne abidi kuabanya ne bibidi, bidi bisambombo », wakamba Ngalula. « Ebu mbuabanyi bulelela. »

Ilunga wakatangila mikoloni. Wakamona ne Ngalula udi wamba bulelela. Wakangata asambombo, kupeshaye Kalombo asambombo.

Nkambua wakamba: « Dibala kadiena muena lukuna to. Ndilunda didi diabanya anu mushindu umue bua bantu bonso. »

Katuadi dituku adi, Ilunga ne Kalombo badi babanya bintu biabu mu mikoloni ibidi, ne bikalabu kabayi bamanye, badi babikila Ngalula.`,
  },
  {
    language: "fr",
    title: "Le puits du village",
    level: "primaire",
    focus: "sciences : l'eau propre et l'hygiène",
    comprehensionQuestions: ["Pourquoi les enfants tombaient-ils malades ?", "Qu'a proposé l'infirmière ?", "Qu'est-ce qui a changé dans le village ?"],
    body: `Au village de Kimwenza, tout le monde puisait l'eau dans la rivière. L'eau était fraîche, mais chaque saison des pluies, beaucoup d'enfants avaient mal au ventre.

L'infirmière du centre de santé, Maman Furaha, réunit les habitants sous le grand manguier. Elle apporta deux verres d'eau : l'un pris à la rivière, l'autre bouilli puis refroidi.

« Ils se ressemblent, dit-elle. Mais dans l'un, il y a des choses trop petites pour vos yeux, et ce sont elles qui rendent vos enfants malades. »

Les habitants décidèrent trois choses. D'abord, creuser un puits plus haut que le village, loin des latrines. Ensuite, couvrir le puits d'un couvercle en bois. Enfin, faire bouillir l'eau des plus petits enfants.

Le creusement dura deux mois. Les jeunes creusaient le matin, les femmes montaient la terre, les anciens vérifiaient la profondeur.

Quand l'eau apparut, elle était trouble. Maman Furaha demanda d'attendre trois jours. Le quatrième jour, l'eau était claire.

Six mois plus tard, l'infirmière compta ses fiches : trois fois moins d'enfants venaient pour des maux de ventre.

« Ce n'est pas un miracle, dit-elle aux élèves venus visiter. C'est de l'hygiène, et l'hygiène s'apprend. »`,
  },
  {
    language: "fr",
    title: "Kalala et les mangues du marché",
    level: "primaire",
    focus: "mathématiques : multiplication et monnaie",
    comprehensionQuestions: ["Combien coûte une mangue ?", "Combien Kalala doit-il payer pour cinq mangues ?", "Comment vérifie-t-il la monnaie ?"],
    body: `Kalala a douze ans. Sa mère lui confie deux mille francs et une liste : cinq mangues et un paquet de sel.

Au marché, la vendeuse annonce : « Trois cents francs la mangue. »

Kalala réfléchit. Trois cents, cinq fois. Il compte dans sa tête : trois cents, six cents, neuf cents, mille deux cents, mille cinq cents. Cinq mangues font mille cinq cents francs.

Le sel coûte quatre cents francs. Mille cinq cents plus quatre cents font mille neuf cents.

Il tend les deux mille francs. La vendeuse lui rend cent francs.

Kalala vérifie : deux mille moins mille neuf cents, cela fait bien cent. La monnaie est juste.

En rentrant, un ami lui demande comment il calcule si vite. Kalala répond : « Je ne calcule pas vite. Je calcule par bonds. Trois cents, c'est facile à ajouter : je saute de trois cents en trois cents. »

Sa mère compte les mangues, pèse le sel, et regarde la pièce de cent francs.

« Tu as bien fait, dit-elle. Mais dis-moi : et si elle avait annoncé deux cent cinquante francs la mangue ? »

Kalala s'assied, prend un bâton et dessine cinq traits dans le sable. Il commence à compter.`,
  },
];

/** Idempotent: loads the read-aloud library. */
export async function seedStories(): Promise<{ inserted: number }> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.stories);
  if (Number(n) > 0) return { inserted: 0 };
  await db.insert(schema.stories).values(
    STORIES.map((s) => ({ language: s.language, title: s.title, level: s.level, body: s.body, licence: "programme" })),
  );
  return { inserted: STORIES.length };
}

let ensured: Promise<void> | undefined;
export function ensureStories(): Promise<void> {
  return (ensured ??= seedStories()
    .then(() => undefined)
    .catch((e) => {
      console.error("[stories] seed failed", e);
    }));
}

export function resetStoriesCache() {
  ensured = undefined;
}

/** Word count of each story, used to check the 150-250 word target. */
export function storyWordCount(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

export function storyMeta(title: string): StorySeed | undefined {
  return STORIES.find((s) => s.title === title);
}
