import { z } from "zod";
import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import { audit } from "@/lib/core/audit";
import { insertPrices, parsePricesCsv } from "@/lib/ai/tools/market";
import { PRICE_SOURCE } from "@/lib/db/reference/agriculture";

const Body = z.object({ csv: z.string().min(10).max(2_000_000), source: z.string().max(160).optional(), dryRun: z.boolean().optional() });

/**
 * Administrative price upload (FR-AG-07). Accepts a CSV body (JSON `csv` field, a raw
 * text/csv body, or a multipart `file`), French or English headers, `,` `;` or tab.
 * Columns: marche, produit, unite, prix, qualite (optional), source (optional), date (optional).
 */
export const POST = handle({ permission: "admin:config", limit: "default" }, async ({ req, user, json, ip }) => {
  const contentType = req.headers.get("content-type") ?? "";
  let csv: string;
  let source = PRICE_SOURCE;
  let dryRun = false;

  if (contentType.includes("application/json")) {
    const body = await json(Body);
    csv = body.csv;
    source = body.source ?? source;
    dryRun = body.dryRun ?? false;
  } else if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw badRequest("Fichier CSV manquant");
    if (file.size > 5 * 1024 * 1024) throw badRequest("Fichier CSV trop volumineux (5 Mo maximum)");
    csv = await file.text();
    source = (form.get("source") as string | null) ?? source;
    dryRun = form.get("dryRun") === "true";
  } else {
    csv = await req.text();
    if (!csv.trim()) throw badRequest("Corps CSV vide");
  }

  const parsed = parsePricesCsv(csv, source);
  if (parsed.rows.length === 0) throw badRequest("Aucune ligne de prix valide", parsed.errors);

  const inserted = dryRun ? 0 : await insertPrices(parsed.rows);
  await audit({
    action: "agriculture.prices_uploaded",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "market_prices",
    after: { rows: parsed.rows.length, inserted, rejected: parsed.errors.length, source, dryRun },
    ip,
  });
  return { accepted: parsed.rows.length, inserted, dryRun, rejected: parsed.errors, source };
});
