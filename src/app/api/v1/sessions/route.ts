/**
 * Public session API — POST /api/v1/sessions
 *
 * Opens a conversation on any channel and returns the negotiated capabilities plus the
 * consents still required before the citizen can be served.
 */
import { z } from "zod";
import { handle } from "@server/core/api";
import { CHANNEL_CAPABILITIES, negotiateCapabilities } from "@server/channels/capabilities";
import { channelGuard, parseJson, requestId } from "@server/channels/http";
import { createSession, consentSnapshot, hashIdentifier, missingConsents } from "@server/channels/session";

const Body = z.object({
  channel: z.enum(["pwa", "ivr", "whatsapp", "ussd", "sms", "assisted", "android"]).default("pwa"),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  province: z.string().max(120).optional(),
  territory: z.string().max(120).optional(),
  module: z.enum(["health", "agriculture", "education", "general"]).optional(),
  /** What the client can do; it can only narrow the channel's ceiling. */
  capabilities: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  /** Device identifier (PWA installation) so a session can be resumed on the same device. */
  deviceId: z.string().max(120).optional(),
});

export const POST = handle({ permission: "interaction:create" }, async ({ req, user }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const body = await parseJson(req, Body, language, id);
    const capabilities = negotiateCapabilities(body.channel, body.capabilities ?? null);
    const session = await createSession({
      channel: body.channel,
      language: body.language ?? user.language,
      province: body.province ?? user.province,
      territory: body.territory,
      capabilities: body.capabilities ?? null,
      userId: user.userId,
      channelRef: body.deviceId ? hashIdentifier("pwa_account", body.deviceId) : null,
      module: body.module,
    });
    const required = await missingConsents(user.userId);
    return {
      session: {
        id: session.id,
        channel: session.channel,
        language: session.language,
        module: session.module,
        province: session.province,
        status: session.status,
        turnCount: session.turnCount,
        startedAt: session.startedAt,
      },
      capabilities,
      channelLimits: CHANNEL_CAPABILITIES[body.channel],
      consent: {
        required,
        snapshot: await consentSnapshot(user.userId),
        satisfied: required.length === 0,
      },
      request_id: id,
    };
  });
});
