import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { forbidden } from "@server/core/errors";
import { ReviewRefused, suspend } from "@server/ai/review/board";

const Body = z.object({ reason: z.string().min(3).max(1000) });

/**
 * Rollback power (PRD §15.4): one member takes an approved artefact out of
 * service, alone and at once. It takes a quorum to say something is safe and
 * one person to say it is not.
 */
export const POST = handle<{ id: string }>({ permission: "review:sign" }, async ({ params, user, json, ip }) => {
  const body = await json(Body);
  try {
    const submission = await suspend(params.id, user.userId, body.reason);
    await audit({
      action: "review.suspended",
      actorUserId: user.userId,
      actorRole: user.role,
      entityType: "review_submission",
      entityId: submission.id,
      after: { reason: body.reason, artefact: `${submission.artefactKind}:${submission.artefactId}` },
      ip,
    });
    return { submission };
  } catch (err) {
    if (err instanceof ReviewRefused) throw forbidden(err.message);
    throw err;
  }
});
