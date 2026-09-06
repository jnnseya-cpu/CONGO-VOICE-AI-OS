import { z } from "zod";
import { handle } from "@/lib/core/api";
import { schema } from "@/lib/db/client";

const Body = z.object({ rating: z.number().int().min(1).max(5).optional(), useful: z.boolean().optional(), comment: z.string().max(2000).optional() });

/** General platform feedback (not tied to a specific interaction). */
export const POST = handle({ permission: "feedback:create" }, async ({ db, user, json }) => {
  const body = await json(Body);
  const [fb] = await db.insert(schema.feedback).values({ userId: user.userId, rating: body.rating, useful: body.useful, comment: body.comment }).returning();
  return { feedback: fb };
});
