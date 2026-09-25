import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { quorumFor } from "@server/ai/review/board";
import { readArtefact } from "@server/ai/review/artefacts";

/**
 * One submission: the content as it will ship, the sign-offs so far, and
 * whether the digest still matches. `stale` true means the artefact changed
 * after it was submitted, so nothing signed here applies to what would run.
 */
export const GET = handle<{ id: string }>({ permission: "review:read" }, async ({ db, params }) => {
  const [submission] = await db.select().from(schema.reviewSubmissions).where(eq(schema.reviewSubmissions.id, params.id));
  if (!submission) throw notFound("Soumission introuvable");

  const artefact = await readArtefact(submission.artefactKind, submission.artefactId);
  const signoffs = await db
    .select()
    .from(schema.reviewSignoffs)
    .where(eq(schema.reviewSignoffs.submissionId, submission.id))
    .orderBy(schema.reviewSignoffs.signedAt);

  return {
    submission,
    quorum: await quorumFor(submission.id),
    signoffs,
    artefact,
    stale: !artefact || artefact.digest !== submission.contentDigest,
  };
});
