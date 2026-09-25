import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { badRequest } from "@server/core/errors";
import { schema } from "@server/db/client";
import { boardByKey, quorumFor, submitForReview } from "@server/ai/review/board";

/** The review queue, newest first. */
export const GET = handle({ permission: "review:read" }, async ({ db, req }) => {
  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const boardKey = params.get("board");
  const board = boardKey ? await boardByKey(boardKey) : null;

  const where = [
    board ? eq(schema.reviewSubmissions.boardId, board.id) : undefined,
    status ? eq(schema.reviewSubmissions.status, status as never) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(schema.reviewSubmissions)
    .where(where.length ? and(...(where as never[])) : undefined)
    .orderBy(desc(schema.reviewSubmissions.submittedAt))
    .limit(200);

  const submissions = [];
  for (const row of rows) submissions.push({ ...row, quorum: await quorumFor(row.id) });
  return { submissions, total: submissions.length };
});

const Submit = z.object({
  boardKey: z.string().min(2).max(32),
  kind: z.enum(["protocol_version", "emergency_script", "kb_document", "system_prompt"]),
  artefactId: z.string().min(1).max(160),
  changeNote: z.string().max(2000).optional(),
});

/** Puts an artefact in front of a board, at the exact content it has right now. */
export const POST = handle({ permission: "review:submit" }, async ({ user, json, ip }) => {
  const body = await json(Submit);
  let row;
  try {
    row = await submitForReview({ ...body, submittedBy: user.userId });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Soumission impossible");
  }
  await audit({
    action: "review.submitted",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "review_submission",
    entityId: row.id,
    after: { kind: row.artefactKind, artefactId: row.artefactId, version: row.artefactVersion, digest: row.contentDigest },
    ip,
  });
  return { submission: row };
});
