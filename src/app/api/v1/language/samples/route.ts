import { handle } from "@server/core/api";
import { pendingSamples } from "@server/ai/agents/learning";
import type { LanguageCode } from "@server/db/schema";

/** Review queue for native speakers: lowest-confidence and citizen-flagged samples first. */
export const GET = handle({ permission: "language:review" }, async ({ req }) => ({
  samples: await pendingSamples((req.nextUrl.searchParams.get("language") as LanguageCode | null) ?? undefined, Number(req.nextUrl.searchParams.get("limit") ?? 50)),
}));
