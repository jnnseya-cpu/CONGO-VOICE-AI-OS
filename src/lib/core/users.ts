import type { User } from "@/lib/db/schema";

/** Shape of a user that may be returned to clients (no hashes, no internal fields). */
export function publicUser(u: User) {
  return { id: u.id, name: u.name, role: u.role, language: u.languagePreference, province: u.province, territory: u.territory, organisation: u.organisation, anonymous: u.isAnonymous, consentStatus: u.consentStatus };
}
