import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { forbidden, notFound } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { schema } from "@server/db/client";
import { requireStepUp } from "@server/core/mfa";
import { processDataRequest } from "@server/core/privacy";

export const GET = handle<{ id: string }>({ auth: true }, async ({ db, user, params }) => {
  const [row] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, params.id));
  if (!row) throw notFound();
  if (row.userId !== user.userId && !hasPermission(user.role, "user:manage")) throw forbidden();
  return { request: row };
});

const Patch = z.object({
  action: z.enum(["process", "hold", "release_hold", "reject"]),
  reason: z.string().max(1000).optional(),
});

/**
 * Process a request. Erasure runs the tombstoning workflow: media deleted, identifying
 * rows pseudonymised, statutory audit kept. A legal hold blocks it until released.
 */
export const PATCH = handle<{ id: string }>({ permission: "user:manage" }, async ({ db, user, params, json, ip }) => {
  const body = await json(Patch);
  const [before] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, params.id));
  if (!before) throw notFound();

  if (body.action === "hold" || body.action === "release_hold") {
    const legalHold = body.action === "hold";
    const [row] = await db
      .update(schema.dataRequests)
      .set({ legalHold, status: legalHold ? "on_hold" : "open", evidence: { ...(before.evidence ?? {}), holdReason: body.reason ?? null } })
      .where(eq(schema.dataRequests.id, params.id))
      .returning();
    await audit({ action: legalHold ? "privacy.legal_hold_placed" : "privacy.legal_hold_released", actorUserId: user.userId, actorRole: user.role, entityType: "data_request", entityId: params.id, after: { legalHold, reason: body.reason ?? null }, purpose: "legal_hold", ip });
    return { request: row };
  }

  if (body.action === "reject") {
    const [row] = await db
      .update(schema.dataRequests)
      .set({ status: "rejected", completedAt: new Date(), evidence: { ...(before.evidence ?? {}), rejectionReason: body.reason ?? null } })
      .where(eq(schema.dataRequests.id, params.id))
      .returning();
    await audit({ action: "privacy.request_rejected", actorUserId: user.userId, actorRole: user.role, entityType: "data_request", entityId: params.id, after: { reason: body.reason ?? null }, purpose: "data_subject_request", ip });
    return { request: row };
  }

  // Executing a request exposes or destroys personal data: a recent second factor is required.
  await requireStepUp(user);
  const result = await processDataRequest(params.id, { userId: user.userId, role: user.role }, ip);
  if (!result) throw notFound();
  return result;
});
