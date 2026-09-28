import "server-only";
import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@server/db/client";
import { hasPermission, moduleScopeFor } from "./rbac";
import type { Session } from "./auth";

/**
 * Whose notification is it.
 *
 * The list endpoint asked for `userId = me OR userId IS NULL`, and notifyRole()
 * writes a row with no owner whenever nobody yet holds the role it is addressed
 * to — which is the pilot's normal state, because no community health worker has
 * been appointed. The two together meant every unassigned escalation was shown
 * to every signed-in session, anonymous ones included. Opening the app for the
 * first time, having done nothing, produced a bell with twelve unread alerts
 * carrying other people's clinical complaints verbatim and their case
 * identifiers. The same condition was on the mark-as-read and acknowledge
 * endpoints, where it was worse: a passer-by could clear an emergency alert and
 * hide it from the worker who was supposed to act on it.
 *
 * The rule, in one place so the three endpoints cannot drift apart:
 *
 *  - Not signed up: nothing. A voice turn needs no account by design, and an
 *    account is what makes a notification addressable to a person.
 *  - A citizen with an account: their own rows, and nothing else.
 *  - A field officer: their own rows, plus unassigned alerts addressed to their
 *    role, in their module, and in their province when one is stated. Not
 *    another service's, not another province's.
 *  - A government or platform administrator: their own rows, plus every
 *    unassigned alert. Somebody has to be able to see that an alert is sitting
 *    in the queue because nobody holds the role it was sent to; that is an
 *    operational duty, and it is theirs.
 */
export function notificationScope(user: Session): SQL | undefined {
  // Signalled to callers as "no rows at all" rather than an error: a citizen
  // without an account has no notifications, which is a fact, not a refusal.
  if (user.anonymous) return undefined;

  const own = eq(schema.notifications.userId, user.userId);
  if (!hasPermission(user.role, "case:read")) return own;

  const unassigned = isNull(schema.notifications.userId);

  // Administrators are accountable for the unassigned queue itself.
  if (hasPermission(user.role, "audit:read")) return or(own, unassigned);

  const conditions: SQL[] = [
    unassigned,
    sql`${schema.notifications.payload} ->> 'intendedRole' = ${user.role}`,
  ];

  const modules = moduleScopeFor(user.role);
  if (modules && modules.length > 0) {
    // A row that names no module is left visible: it cannot be shown to be
    // somebody else's, and losing an alert is worse than showing one too many
    // to the officer whose role it names.
    conditions.push(
      sql`(${schema.notifications.payload} ->> 'module' IS NULL OR ${schema.notifications.payload} ->> 'module' IN ${modules})`,
    );
  }

  if (user.province) {
    conditions.push(
      sql`(${schema.notifications.payload} ->> 'province' IS NULL OR ${schema.notifications.payload} ->> 'province' = ${user.province})`,
    );
  }

  return or(own, and(...conditions));
}

/** True when this session may see nothing at all. */
export function seesNoNotifications(user: Session): boolean {
  return notificationScope(user) === undefined;
}
