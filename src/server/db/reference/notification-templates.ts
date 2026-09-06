/**
 * Notification template catalogue — reference data, seeded into `notification_templates`.
 *
 * French is canonical (PRD wording) and the four national languages follow. Placeholders
 * use `{{name}}`; unknown placeholders are dropped at render time so a missing variable can
 * never leak `undefined` to a citizen.
 *
 * `sensitivity: "sensitive"` templates are the lock-screen-safe variants: they say that a
 * message is waiting and nothing about health, pregnancy, safeguarding or a child.
 *
 * REFERENCE DATA — the four national-language strings were produced by the programme
 * language team and must be validated by native speakers before national rollout.
 */
import type { LanguageCode, ModuleType } from "../schema";

export type TemplateChannel = "in_app" | "sms" | "whatsapp" | "email";

export interface TemplateDefinition {
  key: string;
  module: ModuleType;
  channel: TemplateChannel;
  sensitivity: "normal" | "sensitive";
  riskLevel?: string;
  /** Title + body per language. */
  text: Record<LanguageCode, { title: string; body: string }>;
}

const L = (fr: [string, string], ln: [string, string], kg: [string, string], sw: [string, string], lua: [string, string]) => ({
  fr: { title: fr[0], body: fr[1] },
  ln: { title: ln[0], body: ln[1] },
  kg: { title: kg[0], body: kg[1] },
  sw: { title: sw[0], body: sw[1] },
  lua: { title: lua[0], body: lua[1] },
});

export const NOTIFICATION_TEMPLATES: TemplateDefinition[] = [
  {
    key: "emergency.worker_alert",
    module: "health",
    channel: "sms",
    sensitivity: "normal",
    riskLevel: "critical",
    text: L(
      ["Alerte urgente — {{province}}", "Ce cas de santé nécessite une revue urgente. {{title}} ({{province}}). Réf. {{caseRef}}."],
      ["Likebisi ya mbangu — {{province}}", "Likambo oyo ya bokolongono esengeli botala yango mbangu. {{title}} ({{province}}). Réf. {{caseRef}}."],
      ["Nsangu ya nswalu — {{province}}", "Diambu diadi dia mavimpi difwete talwa nswalu. {{title}} ({{province}}). Réf. {{caseRef}}."],
      ["Tahadhari ya haraka — {{province}}", "Kesi hii ya afya inahitaji ukaguzi wa haraka. {{title}} ({{province}}). Kumb. {{caseRef}}."],
      ["Dimanya dia lukasa — {{province}}", "Bualu ebu bua makanda budi ne bua kutangibua lukasa. {{title}} ({{province}}). Réf. {{caseRef}}."],
    ),
  },
  {
    key: "case.assigned",
    module: "general",
    channel: "in_app",
    sensitivity: "normal",
    text: L(
      ["Nouveau cas assigné", "Un cas vous a été assigné : {{title}} ({{province}}). À accuser réception avant {{dueAt}}."],
      ["Likambo ya sika epesameli yo", "Likambo epesameli yo : {{title}} ({{province}}). Yamba yango liboso ya {{dueAt}}."],
      ["Diambu diampa bapesa nge", "Diambu bapesa nge : {{title}} ({{province}}). Ndima yo na ntwala ya {{dueAt}}."],
      ["Kesi mpya umepewa", "Umepewa kesi : {{title}} ({{province}}). Thibitisha kabla ya {{dueAt}}."],
      ["Bualu bupiabupia bakupesha", "Bakupesha bualu : {{title}} ({{province}}). Itaba kumpala kua {{dueAt}}."],
    ),
  },
  {
    key: "case.sla_breach",
    module: "general",
    channel: "in_app",
    sensitivity: "normal",
    text: L(
      ["Délai de suivi dépassé", "Ce cas n'a pas été suivi dans le délai requis. {{title}} ({{province}}) — échéance {{dueAt}}."],
      ["Ntango ya kolanda eleki", "Likambo oyo elandamaki te na ntango esengeli. {{title}} ({{province}}) — ntango {{dueAt}}."],
      ["Ntangu ya kulanda me luta", "Diambu diadi ka dialandama ve na ntangu yina fwete. {{title}} ({{province}}) — {{dueAt}}."],
      ["Muda wa ufuatiliaji umepita", "Kesi hii haikufuatiliwa ndani ya muda unaotakiwa. {{title}} ({{province}}) — {{dueAt}}."],
      ["Dîba dia kulonda diakupita", "Bualu ebu kabuvua bulondibue mu dîba diakanyibua to. {{title}} ({{province}}) — {{dueAt}}."],
    ),
  },
  {
    key: "followup.due",
    module: "general",
    channel: "sms",
    sensitivity: "normal",
    text: L(
      ["Suivi à faire", "Merci de rappeler la personne concernée par le cas {{caseRef}} aujourd'hui et d'enregistrer le résultat."],
      ["Bolandi esengeli", "Benga moto ya likambo {{caseRef}} lelo mpe koma eyano na ye."],
      ["Kulanda mfunu", "Bokila muntu ya diambu {{caseRef}} bubu, sonika mvutu."],
      ["Ufuatiliaji unahitajika", "Tafadhali mpigie simu mhusika wa kesi {{caseRef}} leo na uandike matokeo."],
      ["Kulonda kudi ne mushinga", "Bikila muntu wa bualu {{caseRef}} lelu, ufunde tshialua."],
    ),
  },
  {
    key: "reminder.vaccination",
    module: "health",
    channel: "sms",
    sensitivity: "normal",
    text: L(
      ["Rappel vaccination", "{{childLabel}} doit recevoir le vaccin {{vaccine}} vers le {{dueDate}}. Rendez-vous au centre de santé le plus proche. C'est gratuit."],
      ["Bokundoli ya mangwele", "{{childLabel}} asengeli kozwa mangwele {{vaccine}} pene ya {{dueDate}}. Kende na centre de santé ya pene. Ezali ofele."],
      ["Nsungimina ya nkisi", "{{childLabel}} fwete baka nkisi {{vaccine}} penepene ya {{dueDate}}. Kwenda na kimbanza kia mavimpi. Yo kele ya mpamba."],
      ["Kumbusho la chanjo", "{{childLabel}} anapaswa kupata chanjo {{vaccine}} karibu na {{dueDate}}. Nenda kituo cha afya kilicho karibu. Ni bure."],
      ["Divuluija dia mankenda", "{{childLabel}} udi ne bua kuangata mankenda {{vaccine}} pabuipi ne {{dueDate}}. Ndaya ku tshibambalu tshia makanda. Ndi tshia mpata."],
    ),
  },
  {
    key: "reminder.anc",
    module: "health",
    channel: "sms",
    sensitivity: "sensitive",
    text: L(
      ["Rendez-vous de santé", "Vous avez un rendez-vous de santé prévu vers le {{dueDate}}. Présentez-vous au centre de santé le plus proche."],
      ["Rendez-vous ya bokolongono", "Ozali na rendez-vous ya bokolongono pene ya {{dueDate}}. Kende na centre de santé ya pene."],
      ["Lukutakanu lua mavimpi", "Nge kele na lukutakanu lua mavimpi penepene ya {{dueDate}}. Kwenda na kimbanza kia mavimpi."],
      ["Miadi ya afya", "Una miadi ya afya karibu na {{dueDate}}. Fika kituo cha afya kilicho karibu."],
      ["Disangisha dia makanda", "Udi ne disangisha dia makanda pabuipi ne {{dueDate}}. Luaku ku tshibambalu tshia makanda."],
    ),
  },
  {
    key: "reminder.planting",
    module: "agriculture",
    channel: "sms",
    sensitivity: "normal",
    text: L(
      ["Calendrier cultural — {{crop}}", "La période de semis du {{crop}} commence vers le {{dueDate}} dans votre zone ({{province}}). Préparez vos semences et votre champ."],
      ["Kalandriye ya bilanga — {{crop}}", "Eleko ya kolona {{crop}} ebandi pene ya {{dueDate}} na esika na yo ({{province}}). Bongisa nkona mpe elanga."],
      ["Kalandriye ya bilanga — {{crop}}", "Ntangu ya kukuna {{crop}} ke yantika penepene ya {{dueDate}} na zunga na nge ({{province}}). Yidika mbuma ti bilanga."],
      ["Kalenda ya kilimo — {{crop}}", "Msimu wa kupanda {{crop}} unaanza karibu na {{dueDate}} eneo lako ({{province}}). Andaa mbegu na shamba."],
      ["Kalandriye wa madimi — {{crop}}", "Tshikondo tshia kukuna {{crop}} tshidi tshituadija pabuipi ne {{dueDate}} mu tshitupa tshiebe ({{province}}). Longolola mbutu ne budimi."],
    ),
  },
  {
    key: "reminder.revision",
    module: "education",
    channel: "sms",
    sensitivity: "normal",
    text: L(
      ["Révision — {{exam}}", "Il reste {{daysLeft}} jours avant {{exam}}. Révisez {{subject}} aujourd'hui : posez une question au numéro habituel pour un exercice."],
      ["Bozongeli — {{exam}}", "Etikali mikolo {{daysLeft}} liboso ya {{exam}}. Zongela {{subject}} lelo : tuna motuna na nimero ya momesano mpo na exercice."],
      ["Kulonguka diaka — {{exam}}", "Bilumbu {{daysLeft}} me bikala na ntwala ya {{exam}}. Longuka diaka {{subject}} bubu : yula kiuvu na nimero ya kikalulu."],
      ["Marudio — {{exam}}", "Zimebaki siku {{daysLeft}} kabla ya {{exam}}. Rudia {{subject}} leo: uliza swali kwa namba ya kawaida upate zoezi."],
      ["Kupetulula — {{exam}}", "Kudi matuku {{daysLeft}} kumpala kua {{exam}}. Petulula {{subject}} lelu: ela lukonko ku nimero wa tshibidilu."],
    ),
  },
  {
    key: "alert.cluster",
    module: "agriculture",
    channel: "in_app",
    sensitivity: "normal",
    text: L(
      ["Alerte foyer — {{territory}}", "Les signalements de maladie des cultures augmentent dans cette zone. {{count}} signalements « {{issue}} » sur {{crop}} en {{days}} jours ({{province}} / {{territory}})."],
      ["Likebisi ya foyer — {{territory}}", "Ba signalement ya maladie ya milona ezali komata na esika oyo. Ba signalement {{count}} « {{issue}} » na {{crop}} na mikolo {{days}} ({{province}} / {{territory}})."],
      ["Nsangu ya foyer — {{territory}}", "Bansangu ya kimbeefo ya bilanga ke kutomboka na zunga yai. Bansangu {{count}} « {{issue}} » na {{crop}} na bilumbu {{days}} ({{province}} / {{territory}})."],
      ["Tahadhari ya mlipuko — {{territory}}", "Ripoti za magonjwa ya mazao zinaongezeka eneo hili. Ripoti {{count}} « {{issue}} » kwa {{crop}} ndani ya siku {{days}} ({{province}} / {{territory}})."],
      ["Dimanya dia diboko — {{territory}}", "Mapepa a masama a bidime adi aenda abanda mu tshitupa etshi. Mapepa {{count}} « {{issue}} » ku {{crop}} mu matuku {{days}} ({{province}} / {{territory}})."],
    ),
  },
  {
    key: "alert.learner_support",
    module: "education",
    channel: "in_app",
    sensitivity: "normal",
    text: L(
      ["Apprenant à accompagner", "Cet apprenant demande souvent de l'aide sur {{topic}}. {{count}} demandes en {{days}} jours — prévoyez un appui en classe."],
      ["Moyekoli asengeli lisalisi", "Moyekoli oyo asengaka lisalisi mbala mingi na {{topic}}. Ba demande {{count}} na mikolo {{days}} — bongisa lisalisi na kelasi."],
      ["Nlonguki fwete sadisa", "Nlonguki yai ke lomba lusadisu mbala mingi na {{topic}}. Balomba {{count}} na bilumbu {{days}} — yidika lusadisu na kelasi."],
      ["Mwanafunzi anahitaji msaada", "Mwanafunzi huyu huomba msaada mara kwa mara kuhusu {{topic}}. Maombi {{count}} ndani ya siku {{days}} — panga msaada darasani."],
      ["Mulongi udi ukeba diambuluisha", "Mulongi eu udi ulomba diambuluisha misangu ya bungi bua {{topic}}. Malomba {{count}} mu matuku {{days}} — longolola diambuluisha mu kalasa."],
    ),
  },
  {
    key: "broadcast.generic",
    module: "general",
    channel: "sms",
    sensitivity: "normal",
    text: L(
      ["{{title}}", "{{message}} — CONGO VOICE AI OS. Répondez STOP pour ne plus recevoir ces messages."],
      ["{{title}}", "{{message}} — CONGO VOICE AI OS. Zongisa STOP soki olingi lisusu te kozwa ba messages oyo."],
      ["{{title}}", "{{message}} — CONGO VOICE AI OS. Vutula STOP kana nge zola diaka ve kubaka bansangu yai."],
      ["{{title}}", "{{message}} — CONGO VOICE AI OS. Jibu STOP ili usipokee tena ujumbe huu."],
      ["{{title}}", "{{message}} — CONGO VOICE AI OS. Andamuna STOP bikala kuupidia kabidi mikenji eyi."],
    ),
  },
  {
    key: "report.ready",
    module: "general",
    channel: "in_app",
    sensitivity: "normal",
    text: L(
      ["Rapport prêt — {{reportName}}", "Votre rapport « {{reportName}} » ({{period}}) est prêt. Lien valable jusqu'au {{expiresAt}}."],
      ["Lapolo esili — {{reportName}}", "Lapolo na yo « {{reportName}} » ({{period}}) esili. Lien ezali malamu tii {{expiresAt}}."],
      ["Lapolo me lunga — {{reportName}}", "Lapolo na nge « {{reportName}} » ({{period}}) me lunga. Lien ke tii {{expiresAt}}."],
      ["Ripoti tayari — {{reportName}}", "Ripoti yako « {{reportName}} » ({{period}}) iko tayari. Kiungo kinafanya kazi hadi {{expiresAt}}."],
      ["Lapolo mmane — {{reportName}}", "Lapolo webe « {{reportName}} » ({{period}}) mmane kulua. Lien udi too ne {{expiresAt}}."],
    ),
  },
  {
    key: "sensitive.generic",
    module: "general",
    channel: "sms",
    sensitivity: "sensitive",
    text: L(
      ["Message en attente", "Vous avez un nouveau message de CONGO VOICE AI OS. Appelez le numéro habituel pour l'écouter."],
      ["Message ezali kozela", "Ozali na message ya sika ya CONGO VOICE AI OS. Benga nimero ya momesano mpo na koyoka yango."],
      ["Nsangu ke kuvingila", "Nge kele na nsangu ya mpa ya CONGO VOICE AI OS. Bokila nimero ya kikalulu sambu na kuwa yo."],
      ["Ujumbe unakusubiri", "Una ujumbe mpya kutoka CONGO VOICE AI OS. Piga namba ya kawaida ili kuusikiliza."],
      ["Mukenji udi ukuindila", "Udi ne mukenji mupiamupia wa CONGO VOICE AI OS. Bikila nimero wa tshibidilu bua kuumvua."],
    ),
  },
  {
    key: "acu.cap_alert",
    module: "general",
    channel: "in_app",
    sensitivity: "normal",
    text: L(
      ["Consommation IA {{pct}} % — {{tenant}}", "Le plafond mensuel d'unités de calcul est atteint à {{pct}} % ({{used}} / {{cap}} ACU). Au-delà de 100 %, les réponses non urgentes passent en mode scripté."],
      ["Consommation IA {{pct}} % — {{tenant}}", "Plafond ya sanza ya ba unités ya calcul ekomi na {{pct}} % ({{used}} / {{cap}} ACU). Soki eleki 100 %, biyano oyo ezali na urgence te ekokende na mode scripté."],
      ["Consommation IA {{pct}} % — {{tenant}}", "Plafond ya ngonda ya ba unités ya calcul me kuma na {{pct}} % ({{used}} / {{cap}} ACU). Kana yo luta 100 %, bamvutu ya nswalu ve ke kwenda na mode scripté."],
      ["Matumizi ya AI {{pct}} % — {{tenant}}", "Kiwango cha kila mwezi cha vipimo vya kompyuta kimefikia {{pct}} % ({{used}} / {{cap}} ACU). Zaidi ya 100 %, majibu yasiyo ya dharura yatatumia hali ya maandishi."],
      ["Dikuata dia AI {{pct}} % — {{tenant}}", "Tshipimu tshia ngondo tshia bipimu bia kompiutere tshidi ku {{pct}} % ({{used}} / {{cap}} ACU). Pashishe 100 %, mandamuna kaayi a lukasa neenze mu mushindu wa mifundu."],
    ),
  },
];

export const TEMPLATE_KEYS = NOTIFICATION_TEMPLATES.map((t) => t.key);
