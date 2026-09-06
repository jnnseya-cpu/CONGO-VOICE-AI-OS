import { handle, paging } from "@server/core/api";
import { getPrices, priceFacets, renderPrices, resolveProvinceFilter } from "@server/ai/tools/market";

/**
 * Market prices (FR-AG-07). Public reference data: every quote carries its market, unit,
 * grade, source, observation date and staleness. Never presented as a live offer.
 * `?commodity=maïs&province=Kinshasa&market=…&maxAgeDays=30&facets=1`
 */
export const GET = handle({ limit: "default" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const { limit } = paging(req, { limit: 25, max: 200 });
  const commodity = q.get("commodity");
  const { prices, disclaimer, source } = await getPrices({
    commodity,
    market: q.get("market"),
    province: resolveProvinceFilter(q.get("province")),
    maxAgeDays: q.get("maxAgeDays") ? Number(q.get("maxAgeDays")) : undefined,
    limit,
  });
  return {
    prices,
    count: prices.length,
    source,
    disclaimer,
    spoken: renderPrices(prices, commodity),
    facets: q.get("facets") === "1" ? await priceFacets() : undefined,
  };
});
