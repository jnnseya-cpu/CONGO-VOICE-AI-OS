/**
 * Market price tool (FR-AG-07). Prices are always presented with their source, market,
 * unit, grade, observation date and staleness. The platform relays observations from the
 * statistical service — never a live offer, never a price the model invented.
 */
import "server-only";
import { and, desc, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { ensureAgricultureReference, marketsInProvince, normaliseProvince, provinceForMarket } from "@server/db/reference/agriculture";

export type Staleness = "fresh" | "recent" | "stale" | "very_stale";

export const PRICE_DISCLAIMER =
  "Prix indicatif relevé sur le marché à la date indiquée. Ce n'est pas une offre d'achat ni un prix garanti : vérifiez sur place avant de vendre.";

export interface PriceQuote {
  id: string;
  market: string;
  province: string | null;
  commodity: string;
  unit: string;
  grade: string | null;
  priceCdf: number;
  source: string;
  observedAt: string;
  ageDays: number;
  staleness: Staleness;
  stalenessLabel: string;
  disclaimer: string;
}

const DAY = 24 * 3600 * 1000;

export function stalenessOf(ageDays: number): { staleness: Staleness; label: string } {
  if (ageDays <= 3) return { staleness: "fresh", label: "relevé récent (3 jours ou moins)" };
  if (ageDays <= 14) return { staleness: "recent", label: "relevé de cette quinzaine" };
  if (ageDays <= 45) return { staleness: "stale", label: "relevé ancien (plus de deux semaines)" };
  return { staleness: "very_stale", label: "relevé très ancien : à vérifier sur le marché" };
}

export interface PriceQuery {
  commodity?: string | null;
  market?: string | null;
  province?: string | null;
  maxAgeDays?: number;
  limit?: number;
}

export async function getPrices(q: PriceQuery = {}): Promise<{ prices: PriceQuote[]; disclaimer: string; source: string | null }> {
  await ensureAgricultureReference();
  const db = await getDb();
  const limit = Math.min(200, Math.max(1, q.limit ?? 25));
  const conds = [];
  if (q.commodity) conds.push(sql`${schema.marketPrices.commodity} ILIKE ${"%" + q.commodity + "%"}`);
  if (q.market) conds.push(sql`${schema.marketPrices.market} ILIKE ${"%" + q.market + "%"}`);
  if (q.province) {
    const markets = marketsInProvince(q.province);
    conds.push(markets.length ? inArray(schema.marketPrices.market, markets) : sql`false`);
  }
  if (q.maxAgeDays) conds.push(gte(schema.marketPrices.observedAt, new Date(Date.now() - q.maxAgeDays * DAY)));

  const rows = await db
    .select()
    .from(schema.marketPrices)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.marketPrices.observedAt))
    .limit(limit);

  const prices = rows.map(toQuote);
  return { prices, disclaimer: PRICE_DISCLAIMER, source: prices[0]?.source ?? null };
}

function toQuote(r: typeof schema.marketPrices.$inferSelect): PriceQuote {
  const observed = r.observedAt instanceof Date ? r.observedAt : new Date(r.observedAt);
  const ageDays = Math.max(0, Math.floor((Date.now() - observed.getTime()) / DAY));
  const s = stalenessOf(ageDays);
  return {
    id: r.id,
    market: r.market,
    province: provinceForMarket(r.market),
    commodity: r.commodity,
    unit: r.unit,
    grade: r.grade,
    priceCdf: r.priceCdf,
    source: r.source,
    observedAt: observed.toISOString(),
    ageDays,
    staleness: s.staleness,
    stalenessLabel: s.label,
    disclaimer: PRICE_DISCLAIMER,
  };
}

/** Spoken answer for one commodity, with source and staleness always stated. */
export function renderPrices(quotes: PriceQuote[], commodity?: string | null): string {
  if (quotes.length === 0) {
    return `Nous n'avons pas de relevé de prix récent${commodity ? ` pour ${commodity}` : ""} dans la base. Demandez le prix du jour à l'agent agricole ou au comité du marché.`;
  }
  const lines = quotes
    .slice(0, 5)
    .map((p) => `${p.commodity} à ${p.market} : ${p.priceCdf.toLocaleString("fr-FR")} FC par ${p.unit}${p.grade ? ` (qualité ${p.grade})` : ""}, ${p.stalenessLabel}`);
  return `${lines.join(". ")}. Source : ${quotes[0].source}. ${PRICE_DISCLAIMER}`;
}

/* ------------------------------------------------------------------------------------------
 * Admin CSV upload
 * ---------------------------------------------------------------------------------------- */

export interface ParsedPriceRow {
  market: string;
  commodity: string;
  unit: string;
  priceCdf: number;
  grade: string | null;
  source: string;
  observedAt: Date;
}

export interface CsvParseResult {
  rows: ParsedPriceRow[];
  errors: Array<{ line: number; message: string }>;
}

const HEADER_ALIASES: Record<string, string> = {
  marche: "market",
  marché: "market",
  market: "market",
  produit: "commodity",
  commodity: "commodity",
  denree: "commodity",
  denrée: "commodity",
  unite: "unit",
  unité: "unit",
  unit: "unit",
  prix: "price",
  prix_cdf: "price",
  price: "price",
  price_cdf: "price",
  qualite: "grade",
  qualité: "grade",
  grade: "grade",
  source: "source",
  date: "observed_at",
  date_releve: "observed_at",
  observed_at: "observed_at",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Parses an administrative price upload. Tolerates French headers, ; or , separators. */
export function parsePricesCsv(text: string, defaultSource: string): CsvParseResult {
  const errors: CsvParseResult["errors"] = [];
  const rows: ParsedPriceRow[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows, errors: [{ line: 0, message: "Fichier vide ou sans ligne de données." }] };

  const header = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase().trim()] ?? h.toLowerCase().trim());
  const need = ["market", "commodity", "unit", "price"];
  const missing = need.filter((n) => !header.includes(n));
  if (missing.length) return { rows, errors: [{ line: 1, message: `Colonnes manquantes : ${missing.join(", ")}` }] };

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const get = (name: string) => {
      const idx = header.indexOf(name);
      return idx >= 0 ? cells[idx] ?? "" : "";
    };
    const market = get("market");
    const commodity = get("commodity");
    const unit = get("unit");
    const priceRaw = get("price").replace(/\s/g, "").replace(/,/g, ".");
    const price = Number(priceRaw);
    if (!market || !commodity || !unit) {
      errors.push({ line: i + 1, message: "Marché, produit ou unité manquant." });
      continue;
    }
    if (!Number.isFinite(price) || price <= 0) {
      errors.push({ line: i + 1, message: `Prix invalide : « ${get("price")} »` });
      continue;
    }
    const dateRaw = get("observed_at");
    let observedAt = new Date();
    if (dateRaw) {
      const dmy = dateRaw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
      const parsed = dmy ? new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T00:00:00Z`) : new Date(dateRaw);
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ line: i + 1, message: `Date invalide : « ${dateRaw} »` });
        continue;
      }
      observedAt = parsed;
    }
    rows.push({ market, commodity, unit, priceCdf: price, grade: get("grade") || null, source: get("source") || defaultSource, observedAt });
  }
  return { rows, errors };
}

export async function insertPrices(rows: ParsedPriceRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  for (let i = 0; i < rows.length; i += 200) await db.insert(schema.marketPrices).values(rows.slice(i, i + 200));
  return rows.length;
}

/** Distinct commodities and markets, for pickers. */
export async function priceFacets() {
  await ensureAgricultureReference();
  const db = await getDb();
  const commodities = await db.selectDistinct({ commodity: schema.marketPrices.commodity }).from(schema.marketPrices);
  const markets = await db.selectDistinct({ market: schema.marketPrices.market }).from(schema.marketPrices);
  return {
    commodities: commodities.map((c) => c.commodity).sort(),
    markets: markets.map((m) => ({ market: m.market, province: provinceForMarket(m.market) })).sort((a, b) => a.market.localeCompare(b.market)),
    provinces: Array.from(new Set(markets.map((m) => provinceForMarket(m.market)).filter((p): p is string => !!p))).sort(),
  };
}

/** Province filter helper used by the route. */
export function resolveProvinceFilter(input?: string | null): string | null {
  return normaliseProvince(input);
}
