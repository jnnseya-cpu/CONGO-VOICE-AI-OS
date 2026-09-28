import { and, eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { acknowledgeNotification } from "@server/core/notifications";
import { notificationScope, seesNoNotifications } from "@server/core/notification-scope";
import { schema } from "@server/db/client";
import { audit } from "@server/core/audit";

/**
 * Acknowledge an urgent alert. Delivery is a provider fact; acknowledgement is a human
 * act — an alert stays "unacknowledged" until this endpoint is called.
 *
 * Who is allowed to perform that act is the same question as who is allowed to
 * see the alert, so it is answered in the same place. acknowledgeNotification()
 * refuses a row owned by somebody else, but an unassigned alert has no owner to
 * compare against, and acknowledging one is not a disclosure — it is a claim
 * that a person is dealing with a child who cannot breathe. That claim may only
 * be made by somebody the alert was addressed to.
 */
export const POST = handle<{ id: string }>({ permission: "notification:read_own" }, async ({ db, user, params, ip }) => {
  if (seesNoNotifications(user)) throw notFound();
  const [visible] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.id, params.id), notificationScope(user)));
  if (!visible) throw notFound();

  const n = await acknowledgeNotification(params.id, user.userId);
  if (!n) throw notFound();
  await audit({ action: "notification.acknowledged", actorUserId: user.userId, actorRole: user.role, entityType: "notification", entityId: params.id, after: { type: n.type }, ip });
  return { notification: n };
});
