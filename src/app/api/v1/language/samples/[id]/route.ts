import { z } from "zod";
import { handle } from "@/lib/core/api";
import { notFound } from "@/lib/core/errors";
import { reviewSample } from "@/lib/ai/agents/learning";

const Body = z.object({
  status: z.enum(["verified", "corrected", "rejected"]),
  correctedSourceText: z.string().max(4000).optional(),
  correctedTranslationFr: z.string().max(4000).optional(),
  correctedLanguage: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  lexicon: z.array(z.object({ term: z.string().max(160), meaningFr: z.string().max(240), pronunciation: z.string().max(160).optional() })).max(10).optional(),
});

export const PATCH = handle<{ id: string }>({ permission: "language:review" }, async ({ user, params, json }) => {
  const body = await json(Body);
  const row = await reviewSample(params.id, { userId: user.userId, role: user.role }, body);
  if (!row) throw notFound();
  return { sample: row };
});
