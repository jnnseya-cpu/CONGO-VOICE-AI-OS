import { handle } from "@/lib/core/api";
import { badRequest, forbidden } from "@/lib/core/errors";
import { hasPermission, type Permission } from "@/lib/core/rbac";
import { moduleDashboard } from "@/lib/ai/agents/reporting";
import type { ModuleType } from "@/lib/db/schema";

const PERM: Record<string, Permission> = { health: "dashboard:health", agriculture: "dashboard:agri", education: "dashboard:edu" };

export const GET = handle<{ module: string }>({ auth: true }, async ({ user, params }) => {
  const perm = PERM[params.module];
  if (!perm) throw badRequest("Module inconnu");
  if (!hasPermission(user.role, perm)) throw forbidden();
  return moduleDashboard(params.module as ModuleType);
});
