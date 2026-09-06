/**
 * Agriculture reference data (RDC): agro-ecological zones, planting calendars by
 * province x crop, the approved input registry (chemical guard AGR-003), an initial
 * market price series and the notifiable pest / disease list.
 *
 * All of it is deterministic, versioned, offline-first data — no model output.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";

/* ------------------------------------------------------------------------------------------
 * Provinces and agro-ecological zones
 * ---------------------------------------------------------------------------------------- */

/** Rainfall regimes used for seasons and planting windows. */
export type AgroZone = "nord" | "equatorial" | "sud" | "altitude";

export const PROVINCE_ZONES: Record<string, AgroZone> = {
  Kinshasa: "sud",
  "Kongo-Central": "sud",
  Kwango: "sud",
  Kwilu: "sud",
  "Maï-Ndombe": "equatorial",
  Équateur: "equatorial",
  "Sud-Ubangi": "nord",
  "Nord-Ubangi": "nord",
  Mongala: "nord",
  Tshuapa: "equatorial",
  Tshopo: "equatorial",
  "Bas-Uélé": "nord",
  "Haut-Uélé": "nord",
  Ituri: "nord",
  "Nord-Kivu": "altitude",
  "Sud-Kivu": "altitude",
  Maniema: "equatorial",
  Sankuru: "sud",
  Kasaï: "sud",
  "Kasaï-Central": "sud",
  "Kasaï-Oriental": "sud",
  Lomami: "sud",
  "Haut-Lomami": "sud",
  Lualaba: "sud",
  "Haut-Katanga": "sud",
  Tanganyika: "sud",
};

export const PROVINCES = Object.keys(PROVINCE_ZONES);

/** Tolerant province lookup: accents, case and common spellings. */
export function normaliseProvince(input?: string | null): string | null {
  if (!input) return null;
  const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const target = key(input);
  return PROVINCES.find((p) => key(p) === target) ?? PROVINCES.find((p) => key(p).startsWith(target) && target.length >= 4) ?? null;
}

export function zoneFor(province?: string | null): AgroZone {
  const p = normaliseProvince(province);
  return (p && PROVINCE_ZONES[p]) || "sud";
}

/* ------------------------------------------------------------------------------------------
 * Seasons
 * ---------------------------------------------------------------------------------------- */

export type SeasonCode = "saison_a" | "saison_b" | "saison_seche" | "petite_saison_seche";

export interface Season {
  code: SeasonCode;
  label: string;
  zone: AgroZone;
  advice: string;
}

/** Month ranges (1-12, inclusive) per zone. Ranges may wrap across the new year. */
const SEASON_MONTHS: Record<AgroZone, Array<{ code: SeasonCode; from: number; to: number }>> = {
  sud: [
    { code: "saison_a", from: 9, to: 12 },
    { code: "saison_b", from: 1, to: 5 },
    { code: "saison_seche", from: 6, to: 8 },
  ],
  nord: [
    { code: "saison_a", from: 3, to: 6 },
    { code: "saison_b", from: 7, to: 11 },
    { code: "saison_seche", from: 12, to: 2 },
  ],
  equatorial: [
    { code: "saison_a", from: 2, to: 5 },
    { code: "petite_saison_seche", from: 6, to: 7 },
    { code: "saison_b", from: 8, to: 12 },
    { code: "saison_seche", from: 1, to: 1 },
  ],
  altitude: [
    { code: "saison_a", from: 9, to: 1 },
    { code: "saison_b", from: 2, to: 6 },
    { code: "saison_seche", from: 7, to: 8 },
  ],
};

const SEASON_LABEL: Record<SeasonCode, string> = {
  saison_a: "saison des pluies A",
  saison_b: "saison des pluies B",
  saison_seche: "saison sèche",
  petite_saison_seche: "petite saison sèche",
};

const SEASON_ADVICE: Record<SeasonCode, string> = {
  saison_a: "période de semis principale : préparez le sol tôt et semez dès que les pluies sont installées.",
  saison_b: "deuxième cycle de culture : privilégiez les variétés à cycle court.",
  saison_seche: "peu ou pas de pluie : récolte, séchage, stockage, préparation des champs et cultures de bas-fonds.",
  petite_saison_seche: "pluies moins régulières : surveillez l'humidité du sol et paillez les planches.",
};

function inRange(month: number, from: number, to: number) {
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/** Deterministic season from the date and the province (never asked to the model). */
export function seasonFor(province: string | null | undefined, date: Date = new Date()): Season {
  const zone = zoneFor(province);
  const month = date.getUTCMonth() + 1;
  const found = SEASON_MONTHS[zone].find((s) => inRange(month, s.from, s.to)) ?? SEASON_MONTHS[zone][0];
  return { code: found.code, label: SEASON_LABEL[found.code], zone, advice: SEASON_ADVICE[found.code] };
}

/* ------------------------------------------------------------------------------------------
 * Planting calendars (province x crop)
 * ---------------------------------------------------------------------------------------- */

export const CALENDAR_CROPS = ["maïs", "manioc", "riz", "haricot", "arachide", "banane plantain", "maraîchage"] as const;
export type CalendarCrop = (typeof CALENDAR_CROPS)[number];

export interface SowWindow {
  from: string; // MM-DD
  to: string; // MM-DD
  label: string;
}

interface CropTemplate {
  windows: SowWindow[];
  notes: string;
}

const ZONE_CROP_TEMPLATES: Record<AgroZone, Record<CalendarCrop, CropTemplate>> = {
  sud: {
    "maïs": {
      windows: [
        { from: "09-15", to: "11-15", label: "Saison A — semis principal" },
        { from: "01-15", to: "02-28", label: "Saison B — cycle court" },
      ],
      notes: "Semer dès 2 à 3 pluies utiles consécutives. Écartement 75 x 25 cm, 1 graine par poquet.",
    },
    manioc: {
      windows: [
        { from: "09-15", to: "12-15", label: "Saison A — bouturage principal" },
        { from: "02-01", to: "04-15", label: "Saison B — bouturage complémentaire" },
      ],
      notes: "Boutures saines de 25 cm, 6 à 8 nœuds, plantées inclinées. Écartement 1 x 1 m.",
    },
    riz: {
      windows: [
        { from: "10-01", to: "12-15", label: "Riz pluvial — saison A" },
        { from: "02-15", to: "04-15", label: "Riz de bas-fond — saison B" },
      ],
      notes: "Riz pluvial en ligne à 20 x 20 cm ; bas-fonds repiqués 20 jours après semis en pépinière.",
    },
    haricot: {
      windows: [
        { from: "09-20", to: "11-10", label: "Saison A" },
        { from: "02-01", to: "03-20", label: "Saison B" },
      ],
      notes: "Cycle 80 à 95 jours. Éviter les semis en pleine saison sèche : la floraison avorte.",
    },
    arachide: {
      windows: [
        { from: "09-15", to: "11-30", label: "Saison A" },
        { from: "02-01", to: "03-31", label: "Saison B" },
      ],
      notes: "Sols sableux ressuyés. Écartement 40 x 15 cm. Ne pas enterrer les graines à plus de 5 cm.",
    },
    "banane plantain": {
      windows: [{ from: "09-15", to: "12-31", label: "Plantation en début de pluies" }],
      notes: "Rejets sains parés et désinfectés à l'eau chaude. Trous 40 x 40 x 40 cm, 3 x 3 m.",
    },
    "maraîchage": {
      windows: [
        { from: "03-01", to: "05-31", label: "Cycle de fin de pluies" },
        { from: "06-01", to: "08-31", label: "Contre-saison irriguée (bas-fonds)" },
      ],
      notes: "Amarante, tomate, oignon, aubergine locale. Pailler les planches et arroser matin et soir.",
    },
  },
  nord: {
    "maïs": {
      windows: [
        { from: "03-15", to: "05-15", label: "Saison A" },
        { from: "08-01", to: "09-15", label: "Saison B" },
      ],
      notes: "Deux cycles possibles avec les pluies d'avril à novembre.",
    },
    manioc: {
      windows: [{ from: "03-15", to: "06-30", label: "Bouturage de début de pluies" }],
      notes: "Boutures de variétés tolérantes à la mosaïque, plantées après le premier sarclage du champ.",
    },
    riz: {
      windows: [{ from: "04-01", to: "06-15", label: "Riz pluvial" }],
      notes: "Semis à plat en ligne ; désherber avant la montaison.",
    },
    haricot: {
      windows: [
        { from: "03-20", to: "05-10", label: "Saison A" },
        { from: "08-10", to: "09-20", label: "Saison B" },
      ],
      notes: "Cycle court ; récolter avant les fortes pluies pour éviter la pourriture des gousses.",
    },
    arachide: {
      windows: [{ from: "03-15", to: "05-31", label: "Saison des pluies" }],
      notes: "Sécher les gousses au soleil sur claie, jamais à même le sol (aflatoxine).",
    },
    "banane plantain": {
      windows: [{ from: "04-01", to: "07-31", label: "Plantation en pleine saison des pluies" }],
      notes: "Paillage épais dès la plantation pour retenir l'eau en saison sèche (décembre à février).",
    },
    "maraîchage": {
      windows: [
        { from: "08-15", to: "10-31", label: "Cycle de fin de pluies" },
        { from: "12-01", to: "02-28", label: "Contre-saison irriguée" },
      ],
      notes: "Prévoir un point d'eau : la saison sèche de décembre à février est marquée.",
    },
  },
  equatorial: {
    "maïs": {
      windows: [
        { from: "02-15", to: "04-30", label: "Cycle A" },
        { from: "08-15", to: "10-31", label: "Cycle B" },
      ],
      notes: "Pluies quasi continues : soigner le drainage et le sarclage.",
    },
    manioc: {
      windows: [{ from: "01-01", to: "12-31", label: "Bouturage possible toute l'année" }],
      notes: "Éviter seulement les périodes d'engorgement du sol. Buttes surélevées en zone humide.",
    },
    riz: {
      windows: [
        { from: "02-15", to: "04-30", label: "Cycle A" },
        { from: "08-15", to: "10-15", label: "Cycle B" },
      ],
      notes: "Bas-fonds aménagés ; contrôler l'eau à la floraison.",
    },
    haricot: {
      windows: [
        { from: "02-15", to: "04-15", label: "Cycle A" },
        { from: "08-15", to: "10-15", label: "Cycle B" },
      ],
      notes: "Sensible à l'excès d'eau : semer sur billons.",
    },
    arachide: {
      windows: [
        { from: "02-15", to: "04-15", label: "Cycle A" },
        { from: "08-15", to: "10-15", label: "Cycle B" },
      ],
      notes: "Choisir les parcelles sableuses bien drainées.",
    },
    "banane plantain": {
      windows: [{ from: "01-01", to: "12-31", label: "Plantation possible toute l'année" }],
      notes: "Culture pilier de la zone forestière ; associer avec le manioc les deux premières années.",
    },
    "maraîchage": {
      windows: [
        { from: "06-01", to: "07-31", label: "Petite saison sèche" },
        { from: "01-01", to: "01-31", label: "Période moins pluvieuse" },
      ],
      notes: "Planches surélevées et abris légers contre les fortes pluies.",
    },
  },
  altitude: {
    "maïs": {
      windows: [
        { from: "09-01", to: "10-31", label: "Saison A" },
        { from: "02-01", to: "03-31", label: "Saison B" },
      ],
      notes: "Variétés d'altitude à cycle plus long ; semis dès l'installation des pluies.",
    },
    manioc: {
      windows: [{ from: "09-01", to: "11-30", label: "Bouturage de saison A" }],
      notes: "Préférer les basses altitudes ; au-dessus de 1 600 m le cycle s'allonge fortement.",
    },
    riz: {
      windows: [{ from: "09-15", to: "11-15", label: "Riz de marais" }],
      notes: "Marais aménagés des hauts plateaux ; maîtriser le niveau d'eau.",
    },
    haricot: {
      windows: [
        { from: "09-01", to: "10-15", label: "Saison A" },
        { from: "02-01", to: "03-15", label: "Saison B" },
      ],
      notes: "Culture vivrière principale : haricot volubile tuteuré, 40 x 20 cm.",
    },
    arachide: {
      windows: [{ from: "09-15", to: "10-31", label: "Saison A" }],
      notes: "Réservée aux versants chauds en dessous de 1 400 m.",
    },
    "banane plantain": {
      windows: [{ from: "09-01", to: "12-31", label: "Plantation en saison A" }],
      notes: "Surveiller le flétrissement bactérien du bananier : désinfecter les outils.",
    },
    "maraîchage": {
      windows: [
        { from: "07-01", to: "08-31", label: "Saison sèche irriguée" },
        { from: "02-01", to: "04-30", label: "Saison B" },
      ],
      notes: "Chou, poireau, carotte et amarante réussissent bien en altitude.",
    },
  },
};

export interface PlantingCalendarEntry {
  province: string;
  crop: CalendarCrop;
  zone: AgroZone;
  sowWindows: SowWindow[];
  notes: string;
  source: string;
  version: string;
}

export const CALENDAR_SOURCE = "INERA / FAO — calendrier cultural indicatif RDC";

/** The full province x crop matrix, expanded from the zone templates. */
export function plantingCalendars(): PlantingCalendarEntry[] {
  const out: PlantingCalendarEntry[] = [];
  for (const province of PROVINCES) {
    const zone = PROVINCE_ZONES[province];
    for (const crop of CALENDAR_CROPS) {
      const t = ZONE_CROP_TEMPLATES[zone][crop];
      out.push({ province, crop, zone, sowWindows: t.windows, notes: t.notes, source: CALENDAR_SOURCE, version: "1.0" });
    }
  }
  return out;
}

function mmdd(date: Date) {
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function withinWindow(today: string, w: SowWindow) {
  return w.from <= w.to ? today >= w.from && today <= w.to : today >= w.from || today <= w.to;
}

/** Plain-language calendar answer for one province and crop. */
export function calendarAdvice(province: string | null | undefined, crop: CalendarCrop, date: Date = new Date()) {
  const p = normaliseProvince(province) ?? "Kinshasa";
  const zone = PROVINCE_ZONES[p];
  const t = ZONE_CROP_TEMPLATES[zone][crop];
  const today = mmdd(date);
  const open = t.windows.filter((w) => withinWindow(today, w));
  const season = seasonFor(p, date);
  const text = open.length
    ? `À ${p}, nous sommes dans une fenêtre de semis pour le ${crop} (${open.map((w) => w.label).join(", ")}). ${t.notes}`
    : `À ${p}, ce n'est pas la fenêtre habituelle de semis du ${crop}. Les fenêtres sont : ${t.windows.map((w) => `${w.label} (${w.from} à ${w.to})`).join(" ; ")}. ${t.notes}`;
  return { province: p, crop, zone, season, sowWindows: t.windows, openNow: open.length > 0, notes: t.notes, source: CALENDAR_SOURCE, text };
}

/* ------------------------------------------------------------------------------------------
 * Approved input registry (AGR-003)
 * ---------------------------------------------------------------------------------------- */

export const REGISTRY_SOURCE = "Service national de protection des végétaux (SNPV) / Direction des productions animales — registre plateforme";

export interface RegistrySeed {
  name: string;
  activeIngredient?: string;
  category: "insecticide" | "fungicide" | "herbicide" | "fertiliser" | "veterinary" | "biopesticide";
  targetCrops: string[];
  targetIssues: string[];
  authorisationStatus: "authorised" | "restricted" | "banned" | "unverified";
  labelInstructions?: string;
  ppe?: string;
  preHarvestIntervalDays?: number;
  reEntryHours?: number;
}

const PPE_SPRAY = "Combinaison à manches longues, gants, bottes, masque et lunettes. Ne pas manger, boire ni fumer pendant le traitement ; se laver au savon après.";
const PPE_VET = "Gants jetables, blouse ou vêtements dédiés, lavage des mains au savon. Ne pas manipuler à mains nues si vous avez une plaie.";

export const INPUT_REGISTRY_SEED: RegistrySeed[] = [
  {
    name: "Bacillus thuringiensis var. kurstaki (Bt)",
    activeIngredient: "Bacillus thuringiensis kurstaki",
    category: "biopesticide",
    targetCrops: ["maïs", "maraîchage", "chou"],
    targetIssues: ["chenille légionnaire d'automne", "chenilles", "pest"],
    authorisationStatus: "authorised",
    labelInstructions: "Appliquer en fin d'après-midi directement dans le cornet du maïs, sur jeunes chenilles. Répéter après 7 jours si l'attaque continue.",
    ppe: PPE_SPRAY,
    preHarvestIntervalDays: 0,
    reEntryHours: 4,
  },
  {
    name: "Huile de neem (azadirachtine 0,3 %)",
    activeIngredient: "azadirachtine",
    category: "biopesticide",
    targetCrops: ["maïs", "maraîchage", "haricot", "manioc"],
    targetIssues: ["pucerons", "chenille légionnaire d'automne", "mouche blanche", "pest"],
    authorisationStatus: "authorised",
    labelInstructions: "Diluer selon l'étiquette et pulvériser tôt le matin ou en fin de journée, face inférieure des feuilles comprise.",
    ppe: PPE_SPRAY,
    preHarvestIntervalDays: 0,
    reEntryHours: 4,
  },
  {
    name: "Lambda-cyhalothrine 25 EC",
    activeIngredient: "lambda-cyhalothrine",
    category: "insecticide",
    targetCrops: ["maïs", "haricot"],
    targetIssues: ["chenille légionnaire d'automne", "pest"],
    authorisationStatus: "authorised",
    labelInstructions: "Traitement localisé du cornet uniquement, jamais en couverture totale. Respecter la dose de l'étiquette du fabricant.",
    ppe: PPE_SPRAY,
    preHarvestIntervalDays: 14,
    reEntryHours: 24,
  },
  {
    name: "Mancozèbe 80 WP",
    activeIngredient: "mancozèbe",
    category: "fungicide",
    targetCrops: ["maraîchage", "tomate", "pomme de terre"],
    targetIssues: ["mildiou", "alternariose", "crop_disease"],
    authorisationStatus: "authorised",
    labelInstructions: "Pulvériser dès l'apparition des premières taches, renouveler tous les 7 à 10 jours selon la pluie.",
    ppe: PPE_SPRAY,
    preHarvestIntervalDays: 14,
    reEntryHours: 24,
  },
  {
    name: "Urée 46 % N",
    activeIngredient: "urée",
    category: "fertiliser",
    targetCrops: ["maïs", "riz", "maraîchage"],
    targetIssues: ["fertiliser", "carence en azote"],
    authorisationStatus: "authorised",
    labelInstructions: "Apport fractionné en couverture, sur sol humide, enfoui légèrement à 10 cm du pied.",
    ppe: "Gants et lavage des mains après manipulation.",
    preHarvestIntervalDays: 0,
  },
  {
    name: "NPK 17-17-17",
    category: "fertiliser",
    targetCrops: ["maïs", "riz", "haricot", "maraîchage", "arachide"],
    targetIssues: ["fertiliser", "soil"],
    authorisationStatus: "authorised",
    labelInstructions: "Apport de fond au semis, en poquet à côté de la graine sans contact direct.",
    ppe: "Gants et lavage des mains après manipulation.",
    preHarvestIntervalDays: 0,
  },
  {
    name: "Vaccin Newcastle thermostable I-2",
    activeIngredient: "souche I-2 vivante thermostable",
    category: "veterinary",
    targetCrops: ["poule", "volaille"],
    targetIssues: ["maladie de newcastle", "livestock_illness"],
    authorisationStatus: "authorised",
    labelInstructions: "Instillation oculaire d'une goutte par oiseau, à répéter tous les 3 à 4 mois. Vacciner uniquement les oiseaux sains, tôt le matin.",
    ppe: PPE_VET,
    preHarvestIntervalDays: 0,
  },
  {
    name: "Vaccin PPR (peste des petits ruminants)",
    activeIngredient: "souche vaccinale atténuée PPR",
    category: "veterinary",
    targetCrops: ["chèvre", "mouton"],
    targetIssues: ["peste des petits ruminants", "livestock_illness"],
    authorisationStatus: "authorised",
    labelInstructions: "Injection sous-cutanée par l'agent vétérinaire, une dose protégeant plusieurs années. Chaîne de froid obligatoire.",
    ppe: PPE_VET,
    preHarvestIntervalDays: 0,
  },
  {
    name: "Albendazole 300 mg (bolus vétérinaire)",
    activeIngredient: "albendazole",
    category: "veterinary",
    targetCrops: ["chèvre", "mouton", "vache"],
    targetIssues: ["vers", "parasites internes", "livestock_illness"],
    authorisationStatus: "authorised",
    labelInstructions: "Déparasitage selon le poids de l'animal, administré par l'agent vétérinaire. Ne pas traiter les femelles en début de gestation.",
    ppe: PPE_VET,
    preHarvestIntervalDays: 14,
  },
  {
    name: "Oxytétracycline longue action 20 %",
    activeIngredient: "oxytétracycline",
    category: "veterinary",
    targetCrops: ["vache", "chèvre", "porc"],
    targetIssues: ["infection bactérienne", "livestock_illness"],
    authorisationStatus: "restricted",
    labelInstructions: "Délivrance et administration réservées au vétérinaire (ordonnance). Délai d'attente lait et viande à respecter.",
    ppe: PPE_VET,
    preHarvestIntervalDays: 21,
  },
  { name: "Endosulfan", activeIngredient: "endosulfan", category: "insecticide", targetCrops: [], targetIssues: ["pest"], authorisationStatus: "banned" },
  { name: "Paraquat", activeIngredient: "paraquat", category: "herbicide", targetCrops: [], targetIssues: ["adventices"], authorisationStatus: "banned" },
  { name: "Lindane", activeIngredient: "lindane", category: "insecticide", targetCrops: [], targetIssues: ["pest"], authorisationStatus: "banned" },
  { name: "Chlorpyrifos-éthyl", activeIngredient: "chlorpyrifos", category: "insecticide", targetCrops: [], targetIssues: ["pest"], authorisationStatus: "banned" },
];

/* ------------------------------------------------------------------------------------------
 * Notifiable pests and diseases (default; overridable via admin_config "agri.notifiable")
 * ---------------------------------------------------------------------------------------- */

export interface NotifiableEntry {
  key: string;
  label: string;
  kind: "crop" | "livestock";
  keywords: string[];
  zoonotic?: boolean;
}

export const NOTIFIABLE_DEFAULT: NotifiableEntry[] = [
  { key: "fall_armyworm", label: "Chenille légionnaire d'automne", kind: "crop", keywords: ["chenille légionnaire", "légionnaire d'automne", "fall armyworm", "spodoptera", "viwavi jeshi"] },
  { key: "cassava_mosaic", label: "Mosaïque africaine du manioc", kind: "crop", keywords: ["mosaïque du manioc", "mosaique du manioc", "mosaïque africaine", "cassava mosaic", "batobato"] },
  { key: "cassava_brown_streak", label: "Striure brune du manioc", kind: "crop", keywords: ["striure brune", "brown streak", "nécrose brune du manioc"] },
  { key: "banana_bunchy_top", label: "Bunchy top du bananier", kind: "crop", keywords: ["bunchy top", "sommet touffu", "bananier nanisme"] },
  { key: "locusts", label: "Invasion acridienne (criquets)", kind: "crop", keywords: ["criquet", "criquets", "invasion acridienne", "nzige", "sauterelles en essaim"] },
  { key: "newcastle", label: "Maladie de Newcastle", kind: "livestock", keywords: ["newcastle", "cou tordu", "torticolis des poules", "kideri"] },
  { key: "ppr", label: "Peste des petits ruminants", kind: "livestock", keywords: ["peste des petits ruminants", "ppr", "sotoka ya mbuzi"] },
  { key: "asf", label: "Peste porcine africaine", kind: "livestock", keywords: ["peste porcine", "african swine fever", "psa", "homa ya nguruwe"] },
];

/* ------------------------------------------------------------------------------------------
 * Initial market price series
 * ---------------------------------------------------------------------------------------- */

export const PRICE_SOURCE = "SNSA — relevé hebdomadaire des marchés (Ministère de l'Agriculture)";

export interface PriceSeed {
  market: string;
  province: string;
  commodity: string;
  unit: string;
  grade: string;
  priceCdf: number;
  daysAgo: number;
}

export const MARKET_PRICE_SEED: PriceSeed[] = [
  { market: "Kinshasa — Marché de la Liberté", province: "Kinshasa", commodity: "manioc (cossettes)", unit: "sac de 50 kg", grade: "courant", priceCdf: 95000, daysAgo: 2 },
  { market: "Kinshasa — Marché de la Liberté", province: "Kinshasa", commodity: "maïs grain", unit: "sac de 50 kg", grade: "courant", priceCdf: 128000, daysAgo: 2 },
  { market: "Kinshasa — Marché de la Liberté", province: "Kinshasa", commodity: "arachide décortiquée", unit: "kg", grade: "premier choix", priceCdf: 6500, daysAgo: 2 },
  { market: "Kinshasa — Marché central", province: "Kinshasa", commodity: "riz local", unit: "kg", grade: "courant", priceCdf: 3800, daysAgo: 5 },
  { market: "Matadi — Marché central", province: "Kongo-Central", commodity: "manioc (cossettes)", unit: "sac de 50 kg", grade: "courant", priceCdf: 88000, daysAgo: 4 },
  { market: "Matadi — Marché central", province: "Kongo-Central", commodity: "banane plantain", unit: "régime", grade: "moyen", priceCdf: 12000, daysAgo: 4 },
  { market: "Kikwit — Marché Wenze", province: "Kwilu", commodity: "maïs grain", unit: "sac de 50 kg", grade: "courant", priceCdf: 112000, daysAgo: 6 },
  { market: "Kikwit — Marché Wenze", province: "Kwilu", commodity: "haricot", unit: "kg", grade: "courant", priceCdf: 4200, daysAgo: 6 },
  { market: "Mbuji-Mayi — Marché Bakwadianga", province: "Kasaï-Oriental", commodity: "maïs grain", unit: "sac de 50 kg", grade: "courant", priceCdf: 135000, daysAgo: 3 },
  { market: "Mbuji-Mayi — Marché Bakwadianga", province: "Kasaï-Oriental", commodity: "manioc (cossettes)", unit: "sac de 50 kg", grade: "courant", priceCdf: 102000, daysAgo: 3 },
  { market: "Lubumbashi — Marché Mzee Kabila", province: "Haut-Katanga", commodity: "maïs grain", unit: "sac de 50 kg", grade: "premier choix", priceCdf: 145000, daysAgo: 1 },
  { market: "Lubumbashi — Marché Mzee Kabila", province: "Haut-Katanga", commodity: "haricot", unit: "kg", grade: "premier choix", priceCdf: 5200, daysAgo: 1 },
  { market: "Goma — Marché Virunga", province: "Nord-Kivu", commodity: "haricot", unit: "kg", grade: "courant", priceCdf: 4800, daysAgo: 7 },
  { market: "Goma — Marché Virunga", province: "Nord-Kivu", commodity: "pomme de terre", unit: "sac de 50 kg", grade: "courant", priceCdf: 78000, daysAgo: 7 },
  { market: "Kisangani — Marché central", province: "Tshopo", commodity: "riz local", unit: "kg", grade: "courant", priceCdf: 3500, daysAgo: 9 },
  { market: "Kisangani — Marché central", province: "Tshopo", commodity: "banane plantain", unit: "régime", grade: "gros", priceCdf: 15000, daysAgo: 9 },
  { market: "Bukavu — Marché Kadutu", province: "Sud-Kivu", commodity: "manioc (farine)", unit: "kg", grade: "courant", priceCdf: 2900, daysAgo: 5 },
  { market: "Kananga — Marché central", province: "Kasaï-Central", commodity: "arachide décortiquée", unit: "kg", grade: "courant", priceCdf: 5800, daysAgo: 8 },
];

/* ------------------------------------------------------------------------------------------
 * Seeding
 * ---------------------------------------------------------------------------------------- */

/** Idempotent: loads calendars, the input registry and the initial price series. */
export async function seedAgricultureReference(): Promise<{ calendars: number; registry: number; prices: number }> {
  const db = await getDb();
  let calendars = 0;
  let registry = 0;
  let prices = 0;

  // Only the missing province x crop pairs are added, so the shared reference loader and
  // this one can both contribute without ever duplicating a row.
  const existing = await db.select({ province: schema.plantingCalendars.province, crop: schema.plantingCalendars.crop }).from(schema.plantingCalendars);
  const seen = new Set(existing.map((e) => `${e.province.toLowerCase()}|${e.crop.toLowerCase()}`));
  const rows = plantingCalendars()
    .filter((c) => !seen.has(`${c.province.toLowerCase()}|${c.crop.toLowerCase()}`))
    .map((c) => ({ province: c.province, crop: c.crop, sowWindows: c.sowWindows, notes: c.notes, source: c.source, version: c.version }));
  for (let i = 0; i < rows.length; i += 100) await db.insert(schema.plantingCalendars).values(rows.slice(i, i + 100));
  calendars = rows.length;

  const [{ n: regCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.inputRegistry);
  if (Number(regCount) === 0) {
    await db.insert(schema.inputRegistry).values(
      INPUT_REGISTRY_SEED.map((r) => ({
        name: r.name,
        activeIngredient: r.activeIngredient,
        category: r.category,
        targetCrops: r.targetCrops,
        targetIssues: r.targetIssues,
        authorisationStatus: r.authorisationStatus,
        labelInstructions: r.labelInstructions,
        ppe: r.ppe,
        preHarvestIntervalDays: r.preHarvestIntervalDays,
        reEntryHours: r.reEntryHours,
        source: REGISTRY_SOURCE,
      })),
    );
    registry = INPUT_REGISTRY_SEED.length;
  }

  const [{ n: priceCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.marketPrices);
  if (Number(priceCount) === 0) {
    const day = 24 * 3600 * 1000;
    await db.insert(schema.marketPrices).values(
      MARKET_PRICE_SEED.map((p) => ({
        market: p.market,
        commodity: p.commodity,
        unit: p.unit,
        priceCdf: p.priceCdf,
        grade: p.grade,
        source: PRICE_SOURCE,
        observedAt: new Date(Date.now() - p.daysAgo * day),
      })),
    );
    prices = MARKET_PRICE_SEED.length;
  }

  return { calendars, registry, prices };
}

let ensured: Promise<void> | undefined;
/** Lazy one-time load so agriculture tools work from a clean checkout. */
export function ensureAgricultureReference(): Promise<void> {
  return (ensured ??= seedAgricultureReference()
    .then(() => undefined)
    .catch((e) => {
      console.error("[agri-reference] seed failed", e);
    }));
}

/** Test helper. */
export function resetAgricultureReferenceCache() {
  ensured = undefined;
}

/** Province of a known market (market rows carry no province column). */
export function provinceForMarket(market: string): string | null {
  return MARKET_PRICE_SEED.find((p) => p.market === market)?.province ?? null;
}

/** Markets known for a province, used to filter price queries. */
export function marketsInProvince(province: string): string[] {
  const p = normaliseProvince(province);
  if (!p) return [];
  return Array.from(new Set(MARKET_PRICE_SEED.filter((m) => m.province === p).map((m) => m.market)));
}
