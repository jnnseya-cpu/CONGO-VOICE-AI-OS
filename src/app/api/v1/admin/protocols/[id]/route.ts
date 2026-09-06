import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { badRequest, notFound } from "@/lib/core/errors";
import { getProtocol } from "@/lib/ai/protocols/definitions";
import { listProtocols, setProtocolStatus } from "@/lib/ai/protocols/registry";
import { protocolRuleIds } from "@/lib/ai/protocols/engine";
import { LIFECYCLE_STATUSES } from "@/lib/ai/protocols/lifecycle";

/** Full decision tree of one protocol, for review by the Clinical Review Board. */
export const GET = handle<{ id: string }>({ permission: "admin:config" }, async ({ params }) => {
  const protocol = getProtocol(params.id);
  if (!protocol) throw notFound("Protocole inconnu");
  const versions = (await listProtocols()).filter((p) => p.protocolId === params.id);
  return { protocol, ruleIds: protocolRuleIds(protocol), versions };
});

const Body = z.object({
  version: z.string().min(1).max(24).optional(),
  status: z.enum(LIFECYCLE_STATUSES),
  approvedBy: z.string().min(2).max(120).optional(),
});

/** Approve, put under canary, or retire a protocol version. */
export const PATCH = handle<{ id: string }>({ permission: "admin:config" }, async ({ params, user, json, ip }) => {
  const body = await json(Body);
  const protocol = getProtocol(params.id);
  if (!protocol) throw notFound("Protocole inconnu");
  const version = body.version ?? protocol.version;
  const row = await setProtocolStatus(params.id, version, body.status, body.approvedBy);
  if (!row) throw badRequest("Version de protocole inconnue");
  await audit({
    action: "protocol.status_changed",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "protocol",
    entityId: `${params.id}@${version}`,
    after: { status: body.status, approvedBy: row.approvedBy },
    ip,
  });
  return { protocol: row };
});
