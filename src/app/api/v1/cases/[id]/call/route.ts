import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { forbidden, notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { readPhone } from "@server/core/phone";
import { placeBridgedCall } from "@server/channels/outbound-call";

const Body = z.object({ from: z.string().min(6).max(32).optional() });

/**
 * Put the worker on the phone to the citizen (FR-CS-04).
 *
 * The worker never sees the number. The platform calls the worker, then bridges
 * them to the citizen, so a case can be followed up without a household's
 * number being copied into a private handset — which is how a directory of
 * citizens leaves an institution.
 */
export const POST = handle({ permission: "case:assign" }, async ({ db, params, user, json, ip }) => {
  const body = await json(Body).catch(() => ({ from: undefined }) as z.infer<typeof Body>);
  const [row] = await db.select().from(schema.cases).where(eq(schema.cases.id, params.id));
  if (!row) throw notFound("Dossier introuvable");
  if (row.assignedTo && row.assignedTo !== user.userId) throw forbidden("Ce dossier est assigné à une autre personne.");

  const [citizen] = row.userId ? await db.select().from(schema.users).where(eq(schema.users.id, row.userId)) : [];
  const citizenNumber = readPhone(citizen?.phone);
  if (!citizenNumber) throw notFound("Aucun numéro joignable pour cette personne.");

  const [worker] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId));
  const workerNumber = body.from ?? readPhone(worker?.phone);
  if (!workerNumber) throw notFound("Votre compte n'a pas de numéro pour recevoir l'appel.");

  const result = await placeBridgedCall({ caseId: row.id, workerNumber, citizenNumber });

  await audit({
    action: "case.call_placed",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "case",
    entityId: row.id,
    // Never the numbers themselves: this row is read by people who are not on the case.
    after: { provider: result.provider, ok: result.ok, reason: result.failureReason ?? null },
    ip,
  });

  return { call: { ok: result.ok, provider: result.provider, reference: result.callId ?? null, reason: result.failureReason ?? null } };
});
