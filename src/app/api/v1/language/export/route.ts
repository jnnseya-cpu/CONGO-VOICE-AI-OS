import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { exportDataset } from "@server/ai/agents/learning";
import type { LanguageCode } from "@server/db/schema";

/** JSONL dataset of verified samples for speech/translation model fine-tuning. */
export const GET = handle({ permission: "language:export" }, async ({ req, user, ip }) => {
  const language = (req.nextUrl.searchParams.get("language") as LanguageCode | null) ?? undefined;
  const jsonl = await exportDataset(language);
  await audit({ action: "language.dataset_exported", actorUserId: user.userId, actorRole: user.role, after: { language: language ?? "all" }, ip });
  return new Response(jsonl, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": `attachment; filename="corpus-${language ?? "all"}.jsonl"` } });
});
