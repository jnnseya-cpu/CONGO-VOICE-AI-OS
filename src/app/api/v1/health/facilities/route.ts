import { and, eq } from "drizzle-orm";
import { handle, paging } from "@server/core/api";
import { schema } from "@server/db/client";
import { nearestFacility } from "@server/ai/agents/health";
import { FACILITY_UNKNOWN_NOTE } from "@server/ai/safety";
import type { LanguageCode } from "@server/db/schema";

/**
 * Health facilities known for an area (HEA-004). When nothing is known the limitation is
 * stated explicitly instead of inventing a structure.
 */
export const GET = handle({ auth: true }, async ({ req, db }) => {
  const params = req.nextUrl.searchParams;
  const province = params.get("province");
  const territory = params.get("territory");
  const healthZone = params.get("healthZone");
  const language = (params.get("language") ?? "fr") as LanguageCode;
  const { limit, offset } = paging(req, { limit: 20, max: 100 });

  const nearest = province ? await nearestFacility({ province, territory, healthZone }) : null;
  const rows = province
    ? await db
        .select()
        .from(schema.serviceDirectory)
        .where(and(eq(schema.serviceDirectory.province, province), eq(schema.serviceDirectory.active, true)))
        .limit(limit)
        .offset(offset)
    : await db.select().from(schema.serviceDirectory).where(eq(schema.serviceDirectory.active, true)).limit(limit).offset(offset);

  const facilities = rows
    .filter((r) => r.type === "cs" || r.type === "hgr")
    .map((r) => ({ id: r.id, name: r.name, type: r.type, province: r.province, territory: r.territory, healthZone: r.healthZone, phone: r.phone }));

  return {
    nearest,
    facilities,
    known: facilities.length > 0,
    limitationNote: facilities.length ? null : FACILITY_UNKNOWN_NOTE[language] ?? FACILITY_UNKNOWN_NOTE.fr,
  };
});
