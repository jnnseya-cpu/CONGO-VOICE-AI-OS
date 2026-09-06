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
import { seedAgricultureReference } from "./reference/agriculture";
import { seedStories } from "./reference/stories";
import { seedReferenceData } from "./reference";
import { PILOT_PROVINCES, territoriesOf } from "./reference/geography";
import { queueNameFor, slaDueFor, SEVERITY_TO_LEVEL } from "@/lib/ai/agents/workflow";
import { ACU_CONFIG_KEY, DEFAULT_ACU_CONVERSION } from "@/lib/core/metering";
import type { LanguageCode, ModuleType, Role } from "./schema";

export const DEMO_PIN = "1234";

export const DEMO_ACCOUNTS: Array<{
  phone: string;
  name: string;
  role: Role;
  language: LanguageCode;
  province: string;
  organisation?: string;
  /** Territories the worker covers — the first routing tier (FR-CS-02). */
  territories?: string[];
  territory?: string;
  onDuty?: boolean;
  /** Organisation key used to attach the account to a seeded organisation. */
  org?: string;
}> = [
  { phone: "+243900000001", name: "Admin Congo Voice", role: "platform_admin", language: "fr", province: "Kinshasa", organisation: "CONGO VOICE AI OS", org: "platform", territory: "Gombe", territories: ["Gombe"] },
  { phone: "+243900000002", name: "Direction Programme National", role: "gov_admin", language: "fr", province: "Kinshasa", organisation: "Ministère du Numérique", org: "ministry_digital", territory: "Gombe", territories: ["Gombe"] },
  { phone: "+243900000003", name: "Marie Kabongo", role: "chw", language: "ln", province: "Kinshasa", organisation: "Zone de santé de Kimbanseke", org: "hz_kimbanseke", territory: "Kimbanseke", territories: ["Kimbanseke", "Masina"], onDuty: true },
  { phone: "+243900000004", name: "Jean-Pierre Mbala", role: "agri_officer", language: "kg", province: "Kongo-Central", organisation: "Inspection agricole Kongo-Central", org: "agri_kongo_central", territory: "Mbanza-Ngungu", territories: ["Mbanza-Ngungu", "Songololo", "Kasangulu"], onDuty: true },
  { phone: "+243900000005", name: "Esther Tshibanda", role: "teacher", language: "lua", province: "Kasaï-Oriental", organisation: "École primaire Dibindi", org: "school_dibindi", territory: "Mbuji-Mayi", territories: ["Mbuji-Mayi", "Tshilenge"], onDuty: true },
  { phone: "+243900000006", name: "Partenaire ONG", role: "ngo", language: "fr", province: "Tshopo", organisation: "ONG Santé pour tous", org: "ngo_sante_pour_tous", territory: "Kisangani", territories: ["Kisangani", "Isangi"] },
  { phone: "+243900000007", name: "Dr Amani Bahati", role: "chw", language: "sw", province: "Nord-Kivu", organisation: "Zone de santé de Goma", org: "hz_goma", territory: "Goma", territories: ["Goma", "Nyiragongo"], onDuty: true },
  { phone: "+243900000008", name: "Pascal Ilunga", role: "chw", language: "sw", province: "Haut-Katanga", organisation: "Zone de santé de Lubumbashi", org: "hz_lubumbashi", territory: "Lubumbashi", territories: ["Lubumbashi", "Kipushi"], onDuty: false },
];

/** One national tenant; organisations are the operational units under it. */
export const DEMO_TENANT = {
  name: "Programme national CONGO VOICE AI OS",
  type: "national",
  legalName: "République Démocratique du Congo — Programme national d'IA vocale",
  /** Monthly ACU allowance; beyond it, non-emergency answers degrade to scripted mode. */
  acuMonthlyCap: 250_000,
};

export const DEMO_ORGANISATIONS: Array<{ key: string; name: string; type: string; provinceScope: string[]; territoryScope?: string[]; routingSkills?: string[] }> = [
  { key: "platform", name: "CONGO VOICE AI OS — Plateforme", type: "platform", provinceScope: [] },
  { key: "ministry_digital", name: "Ministère du Numérique", type: "ministry", provinceScope: [] },
  { key: "ministry_health", name: "Ministère de la Santé — Direction des soins de santé primaires", type: "ministry", provinceScope: [], routingSkills: ["health"] },
  { key: "hz_kimbanseke", name: "Zone de santé de Kimbanseke", type: "clinic_network", provinceScope: ["Kinshasa"], territoryScope: ["Kimbanseke", "Masina"], routingSkills: ["health"] },
  { key: "hz_goma", name: "Zone de santé de Goma", type: "clinic_network", provinceScope: ["Nord-Kivu"], territoryScope: ["Goma", "Nyiragongo"], routingSkills: ["health"] },
  { key: "hz_lubumbashi", name: "Zone de santé de Lubumbashi", type: "clinic_network", provinceScope: ["Haut-Katanga"], territoryScope: ["Lubumbashi", "Kipushi"], routingSkills: ["health"] },
  { key: "agri_kongo_central", name: "Inspection agricole du Kongo-Central", type: "extension_service", provinceScope: ["Kongo-Central"], territoryScope: ["Mbanza-Ngungu", "Songololo", "Kasangulu"], routingSkills: ["agriculture"] },
  { key: "school_dibindi", name: "Sous-division EPST Mbuji-Mayi", type: "school_cluster", provinceScope: ["Kasaï-Oriental"], territoryScope: ["Mbuji-Mayi", "Tshilenge"], routingSkills: ["education"] },
  { key: "ngo_sante_pour_tous", name: "ONG Santé pour tous", type: "ngo", provinceScope: ["Tshopo"], territoryScope: ["Kisangani", "Isangi"], routingSkills: ["health", "education"] },
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

  // Reference data is not demo data: it is loaded on every environment, every time.
  await seedReferenceData(log);
  await db
    .insert(schema.adminConfig)
    .values({ key: ACU_CONFIG_KEY, value: DEFAULT_ACU_CONVERSION })
    .onConflictDoNothing();

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n > 0) {
    log("Base déjà initialisée, seed ignoré.");
    return { seeded: false };
  }

  // One national tenant and its organisations.
  const [tenant] = await db.insert(schema.tenants).values(DEMO_TENANT).returning();
  const orgIds = new Map<string, string>();
  for (const o of DEMO_ORGANISATIONS) {
    const [row] = await db
      .insert(schema.organisations)
      .values({
        tenantId: tenant.id,
        name: o.name,
        type: o.type,
        provinceScope: o.provinceScope,
        territoryScope: o.territoryScope ?? [],
        routingSkills: o.routingSkills ?? [],
      })
      .returning();
    orgIds.set(o.key, row.id);
  }
  log(`Tenant national « ${tenant.name} » et ${DEMO_ORGANISATIONS.length} organisations créés.`);

  for (const a of DEMO_ACCOUNTS) {
    await db.insert(schema.users).values({
      phone: a.phone,
      pinHash: hashPin(DEMO_PIN),
      name: a.name,
      role: a.role,
      languagePreference: a.language,
      province: a.province,
      territory: a.territory ?? null,
      territories: a.territories ?? (a.territory ? [a.territory] : []),
      onDuty: a.onDuty ?? true,
      organisation: a.organisation,
      organisationId: a.org ? (orgIds.get(a.org) ?? null) : null,
      tenantId: tenant.id,
      consentStatus: "granted",
    });
  }
  log(`${DEMO_ACCOUNTS.length} comptes créés (PIN ${DEMO_PIN}), territoires et tours de garde inclus.`);

  const citizens: Array<{ id: string; language: LanguageCode; province: string }> = [];
  for (let i = 0; i < 24; i++) {
    const language = (["fr", "ln", "sw", "kg", "lua"] as LanguageCode[])[i % 5];
    const province = PROVINCES[i % PROVINCES.length];
    const territories = territoriesOf(province);
    const territory = territories.length ? territories[i % territories.length] : null;
    const [u] = await db
      .insert(schema.users)
      .values({ isAnonymous: true, role: "citizen", languagePreference: language, province, territory, tenantId: tenant.id, consentStatus: "granted" })
      .returning();
    citizens.push({ id: u.id, language, province });
    // Two citizens in three opt in to reminders; the rest exercise the consent gate.
    await db.insert(schema.consents).values({
      userId: u.id,
      purpose: "reminders",
      status: i % 3 === 2 ? "revoked" : "granted",
      version: "1.0",
      method: i % 2 === 0 ? "voice" : "button",
      language,
    });
    await db.insert(schema.consents).values({ userId: u.id, purpose: "service", status: "granted", version: "1.0", method: "voice", language });
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
  await seedAgricultureReference();
  await seedStories();
  log("Calendriers agricoles, registre des intrants, prix et histoires ajoutés.");
  log("Lexique initial ajouté.");

  // Operations backfill: every case gets a queue, an SLA clock and a severity level so the
  // workflow, the queue board and the SLA sweep have realistic data from the first minute.
  const allCases = await db.select().from(schema.cases);
  for (const c of allCases) {
    const severityLevel = c.severityLevel ?? SEVERITY_TO_LEVEL[c.severity];
    const territories = territoriesOf(c.province ?? "");
    const territory = c.territory ?? (territories.length ? territories[0] : null);
    await db
      .update(schema.cases)
      .set({
        tenantId: tenant.id,
        territory,
        queue: queueNameFor({ module: c.module, province: c.province, territory }),
        severityLevel,
        aiSeverityLevel: c.aiSeverityLevel ?? severityLevel,
        slaDueAt: c.acknowledgedAt ? null : slaDueFor(severityLevel, c.createdAt),
      })
      .where(eq(schema.cases.id, c.id));
  }
  log(`${allCases.length} cas complétés (file, horloge SLA, niveau de gravité).`);
  log(`Provinces pilotes : ${PILOT_PROVINCES.join(", ")}.`);

  return { seeded: true, tenantId: tenant.id, cases: allCases.length };
}
