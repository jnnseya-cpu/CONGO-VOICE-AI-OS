import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { badRequest } from "@server/core/errors";
import { appointMember, revokeMember } from "@server/ai/review/board";

const Appoint = z.object({
  boardKey: z.string().min(2).max(32),
  userId: z.string().uuid(),
  seat: z.enum(["physician", "community_health_expert", "agronomist", "pedagogue", "safeguarding_lead"]),
  /** Registration or licence number, so "a physician" is a checkable claim. */
  credential: z.string().min(2).max(120).optional(),
});

/** Appoints a member to a seat. Who sits on the board is itself an audited act. */
export const POST = handle({ permission: "admin:config" }, async ({ user, json, ip }) => {
  const body = await json(Appoint);
  let row;
  try {
    row = await appointMember({ ...body, appointedBy: user.userId });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Nomination impossible");
  }
  await audit({
    action: "review.member_appointed",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "review_board",
    entityId: body.boardKey,
    after: { memberId: row.id, userId: body.userId, seat: body.seat, credential: body.credential ?? null },
    ip,
  });
  return { member: row };
});

const Revoke = z.object({ memberId: z.string().uuid(), reason: z.string().min(3).max(500) });

export const DELETE = handle({ permission: "admin:config" }, async ({ user, json, ip }) => {
  const body = await json(Revoke);
  const row = await revokeMember(body.memberId, body.reason);
  if (!row) throw badRequest("Ce siège est déjà vacant.");
  await audit({
    action: "review.member_revoked",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "review_board",
    entityId: row.boardId,
    after: { memberId: row.id, seat: row.seat, reason: body.reason },
    ip,
  });
  return { member: row };
});
