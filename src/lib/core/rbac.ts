import type { Role, ModuleType } from "@/lib/db/schema";

export type Permission =
  | "interaction:create"
  | "interaction:read_own"
  | "interaction:read_all"
  | "case:read"
  | "case:write"
  | "case:assign"
  | "case:escalate"
  | "dashboard:gov"
  | "dashboard:health"
  | "dashboard:agri"
  | "dashboard:edu"
  | "dashboard:admin"
  | "report:export"
  | "audit:read"
  | "admin:config"
  | "user:manage"
  | "notification:read_own"
  | "notification:broadcast"
  | "feedback:create"
  | "autosave:write"
  | "language:review"
  | "language:export";

const CITIZEN: Permission[] = [
  "interaction:create",
  "interaction:read_own",
  "feedback:create",
  "notification:read_own",
  "autosave:write",
];

const FIELD_OFFICER: Permission[] = [...CITIZEN, "case:read", "case:write", "case:escalate", "case:assign", "language:review"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  citizen: CITIZEN,
  chw: [...FIELD_OFFICER, "dashboard:health"],
  agri_officer: [...FIELD_OFFICER, "dashboard:agri"],
  teacher: [...FIELD_OFFICER, "dashboard:edu"],
  ngo: [...CITIZEN, "case:read", "dashboard:gov", "dashboard:health", "dashboard:agri", "dashboard:edu", "report:export", "language:review", "language:export"],
  gov_admin: [
    ...FIELD_OFFICER,
    "interaction:read_all",
    "dashboard:gov",
    "dashboard:health",
    "dashboard:agri",
    "dashboard:edu",
    "report:export",
    "audit:read",
    "notification:broadcast",
    "language:export",
  ],
  platform_admin: [
    ...FIELD_OFFICER,
    "interaction:read_all",
    "dashboard:gov",
    "dashboard:health",
    "dashboard:agri",
    "dashboard:edu",
    "dashboard:admin",
    "report:export",
    "audit:read",
    "admin:config",
    "user:manage",
    "notification:broadcast",
    "language:export",
  ],
};

/** Field officers only see cases from their own module. */
export const ROLE_MODULE_SCOPE: Partial<Record<Role, ModuleType[]>> = {
  chw: ["health"],
  agri_officer: ["agriculture"],
  teacher: ["education"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function moduleScopeFor(role: Role): ModuleType[] | null {
  return ROLE_MODULE_SCOPE[role] ?? null;
}

/** Which role receives escalations for a given module. */
export function escalationRoleFor(module: ModuleType): Role {
  switch (module) {
    case "health":
      return "chw";
    case "agriculture":
      return "agri_officer";
    case "education":
      return "teacher";
    default:
      return "gov_admin";
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  citizen: "Citoyen",
  chw: "Agent de santé communautaire",
  agri_officer: "Agent agricole",
  teacher: "Enseignant / Éducation",
  ngo: "ONG / Partenaire",
  gov_admin: "Administrateur gouvernemental",
  platform_admin: "Administrateur plateforme",
};
