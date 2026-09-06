/**
 * Demo seed: institutional accounts for every role and a realistic multilingual history
 * generated through the real pipeline (offline provider) so every dashboard has data.
 *
 *   npm run seed            (embedded database)
 *   DATABASE_URL=... npm run seed
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "./client";
import { hashPin } from "@/lib/core/auth";
import { runInteraction } from "@/lib/ai/agents/orchestrator";
import { reviewSample } from "@/lib/ai/agents/learning";
import type { LanguageCode, ModuleType, Role } from "./schema";

export const DEMO_PIN = "1234";

export const DEMO_ACCOUNTS: Array<{ phone: string; name: string; role: Role; language: LanguageCode; province: string; organisation?: string }> = [
  { phone: "+243900000001", name: "Admin Congo Voice", role: "platform_admin", language: "fr", province: "Kinshasa", organisation: "CONGO VOICE AI OS" },
  { phone: "+243900000002", name: "Direction Programme National", role: "gov_admin", language: "fr", province: "Kinshasa", organisation: "Ministère du Numérique" },
  { phone: "+243900000003", name: "Marie Kabongo", role: "chw", language: "ln", province: "Kinshasa", organisation: "Zone de santé de Kimbanseke" },
  { phone: "+243900000004", name: "Jean-Pierre Mbala", role: "agri_officer", language: "kg", province: "Kongo-Central", organisation: "Inspection agricole Kwilu" },
  { phone: "+243900000005", name: "Esther Tshibanda", role: "teacher", language: "lua", province: "Kasaï-Oriental", organisation: "École primaire Dibindi" },
  { phone: "+243900000006", name: "Partenaire ONG", role: "ngo", language: "fr", province: "Tshopo", organisation: "ONG Santé pour tous" },
  { phone: "+243900000007", name: "Dr Amani Bahati", role: "chw", language: "sw", province: "Nord-Kivu", organisation: "Zone de santé de Goma" },
];

const PROVINCES = ["Kinshasa", "Kongo-Central", "Kwilu", "Kasaï", "Kasaï-Oriental", "Tshopo", "Maï-Ndombe", "Équateur", "Nord-Kivu", "Haut-Katanga", "Tanganyika", "Ituri"];

const SAMPLES: Array<{ text: string; module: ModuleType; language: LanguageCode; province?: string }> = [
  { text: "Mon enfant de 3 ans a de la fièvre depuis deux jours et il vomit tout ce qu'il boit", module: "health", language: "fr", province: "Tshopo" },
  { text: "Mwana na ngai azali na fièvre makasi, azali kolela te mpe akoki komela te", module: "health", language: "ln", province: "Kinshasa" },
  { text: "Nina mimba ya miezi saba na nina damu nyingi tangu asubuhi", module: "health", language: "sw", province: "Nord-Kivu" },
  { text: "Mtoto wangu ana kuhara tangu jana na hataki kunywa maji", module: "health", language: "sw", province: "Haut-Katanga" },
  { text: "Je suis enceinte de six mois, j'ai des maux de tête très forts et je vois flou", module: "health", language: "fr", province: "Kongo-Central" },
  { text: "Mwana na ngai azali na convulsions, nasala nini?", module: "health", language: "ln", province: "Kinshasa" },
  { text: "Mono kele na fièvre ti mpasi ya ntu banda kilumbu tatu", module: "health", language: "kg", province: "Kongo-Central" },
  { text: "Muana wanyi udi ne tshibindu ne kabeela kadi katshiena umvua", module: "health", language: "lua", province: "Kasaï-Oriental" },
  { text: "Quand dois-je faire vacciner mon bébé de deux mois ?", module: "health", language: "fr", province: "Maï-Ndombe" },
  { text: "Ma fille de 8 ans tousse beaucoup la nuit et a un peu de fièvre", module: "health", language: "fr", province: "Kwilu" },
  { text: "Bilanga na ngai ya manioc ezali na makasa ya jaune mpe ekomi kokufa, ezali kopanzana na bilanga mobimba", module: "agriculture", language: "ln", province: "Maï-Ndombe" },
  { text: "Les feuilles de mon manioc jaunissent et se recroquevillent, la maladie se propage à tout le champ", module: "agriculture", language: "fr", province: "Maï-Ndombe" },
  { text: "Il y a des chenilles dans le cornet de mon maïs, plusieurs plants sont troués", module: "agriculture", language: "fr", province: "Kwilu" },
  { text: "Mahindi yangu yana viwavi, majani yametobolewa na shamba lote linaathirika", module: "agriculture", language: "sw", province: "Haut-Katanga" },
  { text: "Mes chèvres ont la diarrhée et deux sont déjà mortes cette semaine", module: "agriculture", language: "fr", province: "Kasaï" },
  { text: "Quel est le bon moment pour planter le maïs avec les pluies qui commencent ?", module: "agriculture", language: "fr", province: "Kongo-Central" },
  { text: "Ntaba na mono ke na pulupulu, beto sala nki?", module: "agriculture", language: "kg", province: "Kongo-Central" },
  { text: "Quel engrais utiliser pour mon champ d'arachide sur sol sableux ?", module: "agriculture", language: "fr", province: "Kasaï-Oriental" },
  { text: "Bei ya mihogo sokoni Lubumbashi ni ngapi wiki hii?", module: "agriculture", language: "sw", province: "Haut-Katanga" },
  { text: "Mes poules meurent une par une, elles ont le cou tordu", module: "agriculture", language: "fr", province: "Équateur" },
  { text: "Je ne comprends pas les fractions, mon professeur dit que 2/4 c'est pareil que 1/2", module: "education", language: "fr", province: "Kasaï" },
  { text: "Nalingi koyekola division, 36 divisé par 4 c'est combien et pourquoi ?", module: "education", language: "ln", province: "Kinshasa" },
  { text: "Nataka msaada wa somo la hesabu, sielewi kugawanya", module: "education", language: "sw", province: "Nord-Kivu" },
  { text: "Comment conjuguer le verbe aller au futur ?", module: "education", language: "fr", province: "Kwilu" },
  { text: "Mon fils de 10 ans a du mal à lire, comment l'aider à la maison ?", module: "education", language: "fr", province: "Tshopo" },
  { text: "Ndi musue kulonga bualu bua fractions, tshiena mumvue", module: "education", language: "lua", province: "Kasaï-Oriental" },
  { text: "Pourquoi les plantes ont besoin de la lumière du soleil ?", module: "education", language: "fr", province: "Ituri" },
  { text: "Je prépare l'examen d'État, comment organiser mes révisions ?", module: "education", language: "fr", province: "Kinshasa" },
  { text: "Mbote, nazali na motuna", module: "general", language: "ln", province: "Kinshasa" },
];

export async function seed(options: { interactions?: number; log?: (m: string) => void } = {}) {
  const log = options.log ?? (() => {});
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n > 0) {
    log("Base déjà initialisée, seed ignoré.");
    return { seeded: false };
  }

  for (const a of DEMO_ACCOUNTS) {
    await db.insert(schema.users).values({ phone: a.phone, pinHash: hashPin(DEMO_PIN), name: a.name, role: a.role, languagePreference: a.language, province: a.province, organisation: a.organisation, consentStatus: "granted" });
  }
  log(`${DEMO_ACCOUNTS.length} comptes créés (PIN ${DEMO_PIN}).`);

  const citizens: Array<{ id: string; language: LanguageCode; province: string }> = [];
  for (let i = 0; i < 24; i++) {
    const language = (["fr", "ln", "sw", "kg", "lua"] as LanguageCode[])[i % 5];
    const province = PROVINCES[i % PROVINCES.length];
    const [u] = await db.insert(schema.users).values({ isAnonymous: true, role: "citizen", languagePreference: language, province, consentStatus: "granted" }).returning();
    citizens.push({ id: u.id, language, province });
  }

  const total = options.interactions ?? 90;
  const DAY = 24 * 3600 * 1000;
  for (let i = 0; i < total; i++) {
    const s = SAMPLES[i % SAMPLES.length];
    const c = citizens[i % citizens.length];
    const province = s.province ?? c.province;
    const out = await runInteraction({ user: { userId: c.id, role: "citizen", language: s.language, province }, moduleHint: s.module, text: s.text, province, wantsAudio: false });
    // Backdate so trends and "today" figures look alive.
    const ago = i < 18 ? Math.random() * 0.8 * DAY : Math.random() * 14 * DAY;
    const at = new Date(Date.now() - ago);
    await db.update(schema.interactions).set({ createdAt: at, updatedAt: at, channel: i % 3 === 0 ? "voice" : "text" }).where(eq(schema.interactions.id, out.interactionId));
    if (out.caseId) await db.update(schema.cases).set({ createdAt: at, updatedAt: at }).where(eq(schema.cases.id, out.caseId));
    await db.update(schema.healthTriageRecords).set({ createdAt: at }).where(eq(schema.healthTriageRecords.interactionId, out.interactionId));
    await db.update(schema.agricultureReports).set({ createdAt: at }).where(eq(schema.agricultureReports.interactionId, out.interactionId));
    await db.update(schema.educationSessions).set({ createdAt: at }).where(eq(schema.educationSessions.interactionId, out.interactionId));
    await db.update(schema.languageCorpus).set({ createdAt: at }).where(eq(schema.languageCorpus.interactionId, out.interactionId));
  }
  log(`${total} interactions générées.`);

  // A few native-speaker verifications so the learning loop has verified examples.
  const chw = (await db.select().from(schema.users).where(eq(schema.users.phone, "+243900000003")))[0];
  const pending = await db.select().from(schema.languageCorpus).where(eq(schema.languageCorpus.language, "ln")).limit(4);
  for (const p of pending) {
    await reviewSample(p.id, { userId: chw.id, role: "chw" }, { status: "verified", lexicon: p.sourceText.includes("mwana") ? [{ term: "mwana", meaningFr: "enfant", pronunciation: "MWA-na" }] : undefined });
  }
  await db.insert(schema.languageLexicon).values([
    { language: "ln", term: "malali", meaningFr: "maladie", domain: "health", verified: true },
    { language: "ln", term: "bilanga", meaningFr: "champ", domain: "agriculture", verified: true },
    { language: "sw", term: "homa", meaningFr: "fièvre", domain: "health", verified: true },
    { language: "sw", term: "shamba", meaningFr: "champ", domain: "agriculture", verified: true },
    { language: "kg", term: "kimbeefo", meaningFr: "maladie", domain: "health", verified: true },
    { language: "lua", term: "kabeela", meaningFr: "fièvre", domain: "health", verified: true },
  ]);
  log("Lexique initial ajouté.");
  return { seeded: true };
}
