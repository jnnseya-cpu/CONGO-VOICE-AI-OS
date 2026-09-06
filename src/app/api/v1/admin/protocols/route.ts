import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { ensureProtocolsRegistered, listProtocols } from "@server/ai/protocols/registry";
import { HEALTH_PROTOCOLS } from "@server/ai/protocols/definitions";
import { protocolRuleIds, validateProtocol } from "@server/ai/protocols/engine";

/** Clinical protocol catalogue: versions, lifecycle status and the rules each one can trigger. */
export const GET = handle({ permission: "admin:config" }, async () => {
  const protocols = await listProtocols();
  return {
    protocols,
    total: protocols.length,
    rules: Object.fromEntries(HEALTH_PROTOCOLS.map((p) => [p.id, protocolRuleIds(p)])),
  };
});

const Body = z.object({ action: z.enum(["register", "validate"]).default("register") });

/** Registers every protocol version that is not yet stored, or validates the definitions. */
export const POST = handle({ permission: "admin:config" }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const problems = HEALTH_PROTOCOLS.flatMap((p) => validateProtocol(p));
  if (body.action === "validate") return { valid: problems.length === 0, problems };
  await ensureProtocolsRegistered();
  const protocols = await listProtocols();
  await audit({ action: "protocol.registered", actorUserId: user.userId, actorRole: user.role, entityType: "protocol", after: { count: protocols.length }, ip });
  return { valid: problems.length === 0, problems, protocols };
});
