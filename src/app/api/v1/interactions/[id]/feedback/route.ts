import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { notFound } from "@server/core/errors";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";
import { flagSample } from "@server/ai/agents/learning";

const Body = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  useful: z.boolean().optional(),
  comment: z.string().max(1000).optional(),
  misunderstood: z.boolean().optional(),
  speechRating: z.number().int().min(1).max(5).optional(),
});

/** Citizen feedback on an answer; also feeds the language learning loop. */
export const POST = handle<{ id: string }>({ permission: "feedback:create" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const [row] = await db.select({ id: schema.interactions.id }).from(schema.interactions).where(eq(schema.interactions.id, params.id));
  if (!row) throw notFound();
  const [fb] = await db.insert(schema.feedback).values({ interactionId: params.id, userId: user.userId, rating: body.rating, useful: body.useful, comment: body.comment }).returning();
  if (body.misunderstood || body.speechRating) await flagSample(params.id, { misunderstood: body.misunderstood, speechRating: body.speechRating });
  await audit({ action: "feedback.created", actorUserId: user.userId, actorRole: user.role, entityType: "interaction", entityId: params.id, after: body });
  return { feedback: fb };
});
