import { handle } from "@server/core/api";
import { CHEMICAL_TERMS, REFERRAL_TEXT, searchRegistry } from "@server/ai/tools/input-registry";

/**
 * Approved input registry (AGR-003). No product may be recommended by the platform unless it
 * appears here with authorisationStatus "authorised". `?crop=maïs&issue=chenille&q=neem&all=1`
 * (`all=1` also returns restricted and banned entries, so a farmer can check a product they
 * were offered at the market).
 */
export const GET = handle({ limit: "default" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const includeUnauthorised = q.get("all") === "1";
  const rows = await searchRegistry({ crop: q.get("crop"), issue: q.get("issue"), query: q.get("q"), includeUnauthorised });
  return {
    inputs: rows.map((r) => ({
      id: r.id,
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
      source: r.source,
      updatedAt: r.updatedAt,
    })),
    count: rows.length,
    includeUnauthorised,
    guardedTerms: CHEMICAL_TERMS.length,
    notice: REFERRAL_TEXT,
  };
});
