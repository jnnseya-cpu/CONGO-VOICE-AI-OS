import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { acknowledgeNotification } from "@server/core/notifications";
import { audit } from "@server/core/audit";

/**
 * Acknowledge an urgent alert. Delivery is a provider fact; acknowledgement is a human
 * act — an alert stays "unacknowledged" until this endpoint is called.
 */
export const POST = handle<{ id: string }>({ permission: "notification:read_own" }, async ({ user, params, ip }) => {
  const n = await acknowledgeNotification(params.id, user.userId);
  if (!n) throw notFound();
  await audit({ action: "notification.acknowledged", actorUserId: user.userId, actorRole: user.role, entityType: "notification", entityId: params.id, after: { type: n.type }, ip });
  return { notification: n };
});
