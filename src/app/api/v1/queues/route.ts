import { handle } from "@server/core/api";
import { moduleScopeFor } from "@server/core/rbac";
import { queueDepths } from "@server/ai/agents/workflow";
import type { ModuleType } from "@server/db/schema";

/**
 * Queue board: depth, unassigned count, breached count and the oldest waiting item per
 * queue — the first screen of an operations room. `?module=…&province=…`
 */
export const GET = handle({ permission: "case:read" }, async ({ req, user }) => {
  const q = req.nextUrl.searchParams;
  const scope = moduleScopeFor(user.role);
  const requested = q.get("module") as ModuleType | null;
  const moduleFilter = scope ? scope[0] : (requested ?? undefined);
  const queues = await queueDepths({ module: moduleFilter ?? undefined, province: q.get("province") ?? undefined });
  return {
    queues,
    totals: {
      depth: queues.reduce((s, x) => s + x.depth, 0),
      unassigned: queues.reduce((s, x) => s + x.unassigned, 0),
      breached: queues.reduce((s, x) => s + x.breached, 0),
      oldestAgeMinutes: queues.reduce<number | null>((m, x) => (x.oldestAgeMinutes === null ? m : m === null ? x.oldestAgeMinutes : Math.max(m, x.oldestAgeMinutes)), null),
    },
  };
});
