import { z } from "zod";
import { handle } from "@/lib/core/api";
import { notifyRole } from "@/lib/core/notifications";
import { audit } from "@/lib/core/audit";

const Body = z.object({
  role: z.enum(["citizen", "chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"]),
  province: z.string().max(120).optional(),
  channel: z.enum(["in_app", "sms", "whatsapp", "email"]).default("in_app"),
  title: z.string().min(2).max(240),
  body: z.string().min(2).max(2000),
});

/** Programme broadcast messages (e.g. vaccination campaign, planting calendar reminder). */
export const POST = handle({ permission: "notification:broadcast" }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const sent = await notifyRole(body.role, { type: "broadcast", channel: body.channel, title: body.title, body: body.body, payload: { by: user.userId } }, body.province);
  await audit({ action: "notification.broadcast", actorUserId: user.userId, actorRole: user.role, after: { role: body.role, province: body.province, recipients: sent.length }, ip });
  return { recipients: sent.length };
});
