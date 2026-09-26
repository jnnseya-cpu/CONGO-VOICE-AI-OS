/**
 * What kind of account this is, said out loud.
 *
 * A role decides what someone may do; a category says what they are to the
 * people around them. Both matter on screen: a citizen reading an answer needs
 * to know whether the person who escalated their case is a nurse, an
 * agricultural officer or a ministry administrator, and a supervisor scanning a
 * directory needs to see at a glance which rows are staff and which are the
 * public. Leaving it to a bare role name — "ngo", "chw" — told nobody anything.
 *
 * Shared rather than server-side because the same labels appear on a profile, a
 * directory row, a case timeline and an escalation notice, and three
 * near-identical copies of a translation table drift apart.
 */
import type { Role } from "@shared/types";

export type AccountCategory = "public" | "field" | "partner" | "state";

export interface CategoryDescriptor {
  id: AccountCategory;
  /** Shown as the badge. */
  label: string;
  /** One line, for a profile or a tooltip: what this person does here. */
  description: string;
  /** Badge tone, matching the platform's existing semantic colours. */
  tone: "muted" | "health" | "brand" | "navy";
}

export const ACCOUNT_CATEGORIES: Record<AccountCategory, CategoryDescriptor> = {
  public: {
    id: "public",
    label: "Grand public",
    description: "Pose des questions et consulte ses propres échanges. N'accède à aucune donnée d'autrui.",
    tone: "muted",
  },
  field: {
    id: "field",
    label: "Agent de terrain",
    description: "Reçoit les escalades, suit les cas et travaille dans sa zone d'affectation.",
    tone: "health",
  },
  partner: {
    id: "partner",
    label: "Partenaire",
    description: "Consulte les tableaux de bord et les rapports agrégés d'un programme conventionné.",
    tone: "brand",
  },
  state: {
    id: "state",
    label: "Administration",
    description: "Pilote le service : comptes, configuration, supervision et audit.",
    tone: "navy",
  },
};

const BY_ROLE: Record<Role, AccountCategory> = {
  citizen: "public",
  chw: "field",
  agri_officer: "field",
  teacher: "field",
  ngo: "partner",
  gov_admin: "state",
  platform_admin: "state",
};

export function categoryOf(role: Role): CategoryDescriptor {
  return ACCOUNT_CATEGORIES[BY_ROLE[role] ?? "public"];
}

/** The role's own name, which is narrower than its category. */
export const ROLE_LABEL_FR: Record<Role, string> = {
  citizen: "Citoyen",
  chw: "Agent de santé communautaire",
  agri_officer: "Agent agricole",
  teacher: "Enseignant",
  ngo: "Partenaire ONG",
  gov_admin: "Administration publique",
  platform_admin: "Administrateur plateforme",
};

/**
 * How an account is identified on screen, in one place.
 *
 * `anonymous` is not a role: it is a citizen who has not signed up, and saying
 * "Citoyen" for them would claim an identity the platform does not have. The
 * distinction is the whole point of the public/registered boundary — an
 * anonymous session can ask a question, and nothing is kept under a name.
 */
export function identify(input: { role: Role; anonymous?: boolean; name?: string | null }): {
  category: CategoryDescriptor;
  roleLabel: string;
  displayName: string;
  registered: boolean;
} {
  const registered = !input.anonymous;
  return {
    category: categoryOf(input.role),
    roleLabel: registered ? ROLE_LABEL_FR[input.role] : "Visiteur non inscrit",
    displayName: input.name?.trim() || (registered ? ROLE_LABEL_FR[input.role] : "Visiteur"),
    registered,
  };
}
