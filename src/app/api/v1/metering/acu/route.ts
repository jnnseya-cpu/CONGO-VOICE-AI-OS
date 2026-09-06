import { handle } from "@server/core/api";
import { badRequest } from "@server/core/errors";
import { acuBreakdown, isDegradedMode, monthBounds, monthlyConsumption } from "@server/core/metering";

/**
 * ACU consumption and cost per interaction.
 * `?scope=tenant:<id>|organisation:<id>|platform&period=YYYY-MM|last30d`
 */
export const GET = handle({ permission: "report:export" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const scope = q.get("scope") ?? "platform";
  const period = q.get("period") ?? "current_month";

  let tenantId: string | null = null;
  let organisationId: string | null = null;
  if (scope.startsWith("tenant:")) tenantId = scope.slice(7);
  else if (scope.startsWith("organisation:")) organisationId = scope.slice(13);
  else if (scope !== "platform") throw badRequest("scope doit valoir platform, tenant:<id> ou organisation:<id>.");

  let from: Date;
  let to: Date;
  if (period === "last30d") {
    to = new Date();
    from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  } else if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    from = new Date(Date.UTC(y, m - 1, 1));
    to = new Date(Date.UTC(y, m, 1));
  } else {
    ({ from, to } = monthBounds(new Date()));
  }

  const breakdown = await acuBreakdown({ tenantId, organisationId, from, to });
  const consumption = await monthlyConsumption(tenantId, from);
  return {
    scope: { tenantId, organisationId },
    period: { from: from.toISOString(), to: to.toISOString(), label: period },
    totalAcu: breakdown.totalAcu,
    costUsd: breakdown.costUsd,
    interactions: breakdown.interactions,
    costPerInteractionUsd: breakdown.costPerInteractionUsd,
    cap: consumption.cap,
    capUsedPct: consumption.pct,
    degradedMode: await isDegradedMode(tenantId),
    byTask: breakdown.byTask,
    byModule: breakdown.byModule,
    byLanguage: breakdown.byLanguage,
    conversion: breakdown.conversion,
  };
});
