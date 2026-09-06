import { z } from "zod";
import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import { estimateAudience, sendBroadcast } from "@/lib/core/notifications";
import { audit } from "@/lib/core/audit";
import { emitEvent } from "@/lib/core/events";
import type { Role } from "@/lib/db/schema";

const ROLES = ["citizen", "chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin"] as const;

/** Audience estimate before approval: `?role=citizen&province=…&language=…`. */
export const GET = handle({ permission: "notification:broadcast" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const role = q.get("role") as Role | null;
  const estimate = await estimateAudience({
    role: role ?? undefined,
    province: q.get("province"),
    territory: q.get("territory"),
    language: (q.get("language") as "fr" | null) ?? undefined,
  });
  return { estimate };
});

const Body = z.object({
  role: z.enum(ROLES),
  province: z.string().max(120).optional(),
  territory: z.string().max(120).optional(),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  channel: z.enum(["in_app", "sms", "whatsapp", "email"]).default("in_app"),
  title: z.string().min(2).max(240),
  body: z.string().min(2).max(2000),
  templateKey: z.string().max(96).optional(),
  /** Explicit approval is required: a broadcast reaches thousands of people. */
  approve: z.boolean().default(false),
  /** Idempotency across retries and duplicate clicks. */
  dedupeKey: z.string().max(120).optional(),
  /** Refuse to send if the estimate exceeds this number of people. */
  maxRecipients: z.number().int().positive().optional(),
});

/**
 * Programme broadcast (vaccination campaign, planting calendar, public information).
 *
 * Two-step by design: without `approve`, the endpoint returns the audience estimate and
 * sends nothing. With `approve`, opted-out citizens and citizens who never granted the
 * "reminders" purpose are excluded, and identical messages are suppressed.
 */
export const POST = handle({ permission: "notification:broadcast" }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const audience = { role: body.role, province: body.province ?? null, territory: body.territory ?? null, language: body.language ?? null };
  const estimate = await estimateAudience(audience);

  if (!body.approve) {
    return { approved: false, estimate, message: "Estimation d'audience — renvoyez la requête avec approve=true pour diffuser." };
  }
  if (body.maxRecipients && estimate.reachable > body.maxRecipients) {
    throw badRequest(`Audience estimée (${estimate.reachable}) supérieure au plafond demandé (${body.maxRecipients}).`);
  }

  const result = await sendBroadcast({
    ...audience,
    channel: body.channel,
    title: body.title,
    message: body.body,
    templateKey: body.templateKey,
    approvedBy: user.userId,
    dedupeKey: body.dedupeKey,
  });
  await audit({
    action: "notification.broadcast",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "broadcast",
    entityId: body.dedupeKey ?? undefined,
    after: { ...audience, estimate, attempted: result.attempted, sent: result.sent, suppressed: result.suppressed },
    purpose: "programme_communication",
    ip,
  });
  await emitEvent({ type: "notification.broadcast.sent", aggregateType: "broadcast", aggregateId: body.dedupeKey ?? user.userId, actor: { type: "worker", id: user.userId }, payload: { ...audience, sent: result.sent, suppressed: result.suppressed } });
  return { approved: true, estimate, recipients: result.sent, attempted: result.attempted, suppressed: result.suppressed };
});
