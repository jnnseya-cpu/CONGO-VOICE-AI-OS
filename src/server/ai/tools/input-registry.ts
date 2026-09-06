/**
 * Chemical guard (AGR-003).
 *
 * No pesticide, herbicide, fungicide or veterinary product may ever be recommended unless
 * it matches an `input_registry` entry whose authorisationStatus is exactly "authorised".
 * A recommendation that mentions a product without a verified match is removed and replaced
 * by non-chemical actions plus a referral. The platform never invents a product name,
 * a dose, or an authorisation.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { ensureAgricultureReference } from "@server/db/reference/agriculture";

export type RegistryRow = typeof schema.inputRegistry.$inferSelect;

/** Words that mean "a product is being recommended". Deliberately broad. */
export const CHEMICAL_TERMS: string[] = [
  "pesticide",
  "insecticide",
  "fongicide",
  "fungicide",
  "herbicide",
  "acaricide",
  "nématicide",
  "raticide",
  "produit chimique",
  "traitement chimique",
  "pulvériser un produit",
  "antibiotique",
  "antibiotiques",
  "vermifuge",
  "déparasitant",
  "antiparasitaire",
  "vaccin",
  "injection",
  "seringue",
  "médicament vétérinaire",
  "produit vétérinaire",
  "dose de",
  "ivermectine",
  "albendazole",
  "oxytétracycline",
  "tétracycline",
  "amoxicilline",
  "deltaméthrine",
  "cyperméthrine",
  "lambda-cyhalothrine",
  "emamectine",
  "chlorpyrifos",
  "mancozèbe",
  "glyphosate",
  "paraquat",
  "endosulfan",
  "lindane",
  "carbofuran",
  "urée",
  "npk",
  "engrais minéral",
  "engrais chimique",
];

const NORMALISE = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Terms of a chemical or veterinary product found in a piece of advice. */
export function mentionsChemical(text: string): string[] {
  const t = NORMALISE(text);
  return CHEMICAL_TERMS.filter((k) => t.includes(NORMALISE(k)));
}

export interface RegistryQuery {
  crop?: string | null;
  issue?: string | null;
  query?: string | null;
  includeUnauthorised?: boolean;
}

/** Registry lookup. Only "authorised" rows are returned unless explicitly asked otherwise. */
export async function searchRegistry(q: RegistryQuery = {}): Promise<RegistryRow[]> {
  await ensureAgricultureReference();
  const db = await getDb();
  const conds = [];
  if (!q.includeUnauthorised) conds.push(eq(schema.inputRegistry.authorisationStatus, "authorised"));
  if (q.query) {
    conds.push(
      sql`(${schema.inputRegistry.name} ILIKE ${"%" + q.query + "%"} OR coalesce(${schema.inputRegistry.activeIngredient}, '') ILIKE ${"%" + q.query + "%"})`,
    );
  }
  const rows = await db
    .select()
    .from(schema.inputRegistry)
    .where(conds.length ? and(...conds) : undefined);

  const crop = q.crop ? NORMALISE(q.crop) : null;
  const issue = q.issue ? NORMALISE(q.issue) : null;
  if (!crop && !issue) return rows;
  return rows.filter((r) => {
    const crops = r.targetCrops.map(NORMALISE);
    const issues = r.targetIssues.map(NORMALISE);
    const cropOk = !crop || crops.length === 0 || crops.some((c) => c.includes(crop) || crop.includes(c));
    const issueOk = !issue || issues.length === 0 || issues.some((i) => i.includes(issue) || issue.includes(i));
    return cropOk && issueOk;
  });
}

/**
 * Generic words that must never, on their own, be taken as naming a registry product.
 * Without this list a sentence containing "huile" or "vaccin" would match a real entry.
 */
const GENERIC_TOKENS = new Set([
  "huile", "vaccin", "vaccins", "vaccinale", "bolus", "longue", "action", "veterinaire", "produit",
  "souche", "vivante", "attenuee", "thermostable", "benzoate", "extrait", "peste", "petits",
  "ruminants", "des", "les", "une", "pour", "contre", "poudre", "liquide",
]);

const AUTH_PRIORITY: Record<string, number> = { banned: 0, restricted: 1, unverified: 2, authorised: 3 };

function distinctiveTokens(value: string): string[] {
  return NORMALISE(value)
    .split(/[\s]+/)
    .filter((t) => t.length >= 3 && !/^[0-9.%-]+$/.test(t) && !GENERIC_TOKENS.has(t));
}

/**
 * Does this sentence name a registry product?
 *
 * Matching is layered — full name, then active ingredient, then a distinctive token of the
 * name — and, at equal confidence, a banned or restricted entry always wins over an
 * authorised one, so an ambiguous sentence is blocked rather than approved.
 */
async function matchProduct(text: string): Promise<{ row: RegistryRow; matchedOn: string } | null> {
  await ensureAgricultureReference();
  const db = await getDb();
  const rows = await db.select().from(schema.inputRegistry);
  const t = NORMALISE(text);
  let best: { row: RegistryRow; matchedOn: string; rank: number; priority: number } | null = null;

  const consider = (row: RegistryRow, matchedOn: string, rank: number) => {
    const priority = AUTH_PRIORITY[row.authorisationStatus] ?? 2;
    if (!best || rank < best.rank || (rank === best.rank && priority < best.priority)) {
      best = { row, matchedOn, rank, priority };
    }
  };

  for (const row of rows) {
    const name = NORMALISE(row.name);
    if (name.length >= 4 && t.includes(name)) consider(row, row.name, 0);
    if (row.activeIngredient) {
      const ing = NORMALISE(row.activeIngredient);
      if (ing.length >= 4 && t.includes(ing)) consider(row, row.activeIngredient, 1);
    }
    for (const token of [...distinctiveTokens(row.name), ...distinctiveTokens(row.activeIngredient ?? "")]) {
      if (new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t)) consider(row, row.name, 2);
    }
  }
  return best ? { row: (best as { row: RegistryRow }).row, matchedOn: (best as { matchedOn: string }).matchedOn } : null;
}

export interface GuardedAction {
  text: string;
  /** Registry entry backing a product mention, when there is one. */
  product?: { name: string; activeIngredient: string | null; labelInstructions: string | null; ppe: string | null; preHarvestIntervalDays: number | null; reEntryHours: number | null; source: string | null };
}

export interface ChemicalGuardResult {
  actions: GuardedAction[];
  /** Advice that was removed because no authorised registry entry backs it. */
  blocked: Array<{ text: string; reason: string; terms: string[] }>;
  /** Extra warnings to surface in actionsToAvoid. */
  avoid: string[];
  /** Referral sentence to append when something was blocked. */
  referral: string | null;
  /** True when at least one product mention was removed. */
  anyBlocked: boolean;
}

export const REFERRAL_TEXT =
  "Aucun produit homologué vérifié ne correspond à ce cas dans le registre officiel. N'achetez rien sur simple conseil : passez par l'agent agricole ou le vétérinaire de votre secteur, qui confirmera le diagnostic et, si un produit est nécessaire, vous indiquera un produit homologué et sa dose.";

const NON_CHEMICAL_FALLBACK = [
  "Retirez et détruisez (brûlez ou enfouissez profondément) les plants ou parties atteints, loin du champ.",
  "Isolez les animaux malades des animaux sains et nettoyez l'abreuvoir et la mangeoire à l'eau savonneuse.",
  "Notez la date, la parcelle et le nombre de plants ou d'animaux touchés pour l'agent agricole.",
];

/**
 * Filters a list of recommended actions: keeps non-chemical advice as is; keeps a product
 * mention only when an "authorised" registry entry matches, and then attaches the label
 * instructions, PPE and pre-harvest interval. Everything else is blocked.
 */
export async function guardChemicalAdvice(actions: string[], ctx: { crop?: string | null; issue?: string | null } = {}): Promise<ChemicalGuardResult> {
  const kept: GuardedAction[] = [];
  const blocked: ChemicalGuardResult["blocked"] = [];
  const avoid: string[] = [];

  for (const raw of actions) {
    const action = raw.trim();
    if (!action) continue;
    const terms = mentionsChemical(action);
    const match = await matchProduct(action);
    // A product may be named without any generic word ("pulvérisez du neem"), and a generic
    // word may appear without any product ("achetez un insecticide"): both are guarded.
    if (terms.length === 0 && !match) {
      kept.push({ text: action });
      continue;
    }
    if (match && match.row.authorisationStatus === "authorised") {
      const r = match.row;
      const details = [
        r.labelInstructions ? `Mode d'emploi homologué : ${r.labelInstructions}` : null,
        r.ppe ? `Protection obligatoire : ${r.ppe}` : null,
        r.preHarvestIntervalDays != null ? `Délai avant récolte ou consommation : ${r.preHarvestIntervalDays} jour(s).` : null,
        r.reEntryHours != null ? `Ne pas retourner dans la parcelle traitée avant ${r.reEntryHours} heure(s).` : null,
      ]
        .filter(Boolean)
        .join(" ");
      kept.push({
        text: `${action} Produit homologué : ${r.name}${r.activeIngredient ? ` (${r.activeIngredient})` : ""}. ${details}`.trim(),
        product: {
          name: r.name,
          activeIngredient: r.activeIngredient,
          labelInstructions: r.labelInstructions,
          ppe: r.ppe,
          preHarvestIntervalDays: r.preHarvestIntervalDays,
          reEntryHours: r.reEntryHours,
          source: r.source,
        },
      });
      continue;
    }
    if (match && match.row.authorisationStatus === "banned") {
      blocked.push({ text: action, reason: `Produit interdit en RDC : ${match.row.name}`, terms });
      avoid.push(`N'utilisez pas ${match.row.name} : ce produit est interdit et dangereux pour la santé et pour le sol.`);
      continue;
    }
    if (match && match.row.authorisationStatus === "restricted") {
      blocked.push({ text: action, reason: `Produit à usage réservé (${match.row.name}) : prescription et administration par un professionnel`, terms });
      avoid.push(`${match.row.name} ne peut être administré que par un vétérinaire : ne l'achetez pas au marché.`);
      continue;
    }
    blocked.push({
      text: action,
      reason: `Aucune correspondance homologuée dans le registre des intrants${ctx.crop && ctx.crop !== "inconnu" ? ` pour ${ctx.crop}` : ""}${ctx.issue ? ` (${ctx.issue})` : ""}`,
      terms,
    });
  }

  if (blocked.length > 0) {
    for (const f of NON_CHEMICAL_FALLBACK) if (!kept.some((k) => k.text === f)) kept.push({ text: f });
    avoid.push("N'achetez aucun produit conseillé de bouche à oreille ou reconditionné dans une bouteille sans étiquette.");
  }

  return { actions: kept, blocked, avoid, referral: blocked.length ? REFERRAL_TEXT : null, anyBlocked: blocked.length > 0 };
}

/** Registry entries that could legitimately be proposed for this crop/issue, if any. */
export async function authorisedOptions(ctx: { crop?: string | null; issue?: string | null }): Promise<RegistryRow[]> {
  const rows = await searchRegistry({ crop: ctx.crop, issue: ctx.issue });
  return rows.filter((r) => r.category !== "fertiliser" || (ctx.issue ?? "").includes("fertil"));
}
