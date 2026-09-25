import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { badRequest, forbidden } from "@server/core/errors";
import { ReviewRefused, signOff } from "@server/ai/review/board";

const Body = z.object({
  seat: z.enum(["physician", "community_health_expert", "agronomist", "pedagogue", "safeguarding_lead"]),
  decision: z.enum(["approve", "reject", "request_changes"]),
  comment: z.string().max(2000).optional(),
  /** The digest shown on the reviewer's screen; a stale screen cannot sign. */
  contentDigest: z.string().length(64),
});

/** Records one member's decision on one submission. Insert-only. */
export const POST = handle<{ id: string }>({ permission: "review:sign" }, async ({ params, user, json, ip }) => {
  const body = await json(Body);
  try {
    const { submission, quorum } = await signOff({
      submissionId: params.id,
      memberUserId: user.userId,
      seat: body.seat,
      decision: body.decision,
      comment: body.comment ?? null,
      contentDigest: body.contentDigest,
    });
    await audit({
      action: "review.signed",
      actorUserId: user.userId,
      actorRole: user.role,
      entityType: "review_submission",
      entityId: submission.id,
      after: {
        decision: body.decision,
        seat: body.seat,
        status: submission.status,
        quorumMet: quorum.met,
        artefact: `${submission.artefactKind}:${submission.artefactId}@${submission.artefactVersion}`,
      },
      ip,
    });
    return { submission, quorum };
  } catch (err) {
    if (err instanceof ReviewRefused) {
      // Not being on the board is a permission problem; the rest are the
      // reviewer's screen being out of step with the record.
      if (err.reason === "not_a_member" || err.reason === "wrong_seat" || err.reason === "self_approval") throw forbidden(err.message);
      throw badRequest(err.message);
    }
    throw err;
  }
});
