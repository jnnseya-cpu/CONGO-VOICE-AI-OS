import { handle } from "@server/core/api";
import { sloReport } from "@server/core/slo";

/**
 * Service level objectives against the last window (NFR-O-02).
 *
 * An objective with too little traffic behind it is reported as unmeasured
 * rather than as met: nobody should be able to read silence as success.
 */
export const GET = handle({ permission: "admin:config" }, async ({ req }) => {
  const hours = Math.min(720, Math.max(1, Number(req.nextUrl.searchParams.get("hours") ?? 24)));
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3600 * 1000);
  return sloReport({ from, to });
});
