import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { invalidateKnowledgeCache, listKnowledgeDocuments, loadKnowledgeFromContent } from "@server/ai/knowledge";
import type { ModuleType } from "@server/db/schema";

/** Approved knowledge documents, with their authority and review dates. */
export const GET = handle({ permission: "admin:config" }, async ({ req }) => {
  const moduleFilter = req.nextUrl.searchParams.get("module") as ModuleType | null;
  const documents = await listKnowledgeDocuments(moduleFilter ?? undefined);
  return { documents, total: documents.length };
});

const Body = z.object({ action: z.literal("reload").default("reload") });

/** Reloads content/kb from disk (after the clinical team edits a document). */
export const POST = handle({ permission: "admin:config" }, async ({ user, json, ip }) => {
  await json(Body);
  invalidateKnowledgeCache();
  const result = await loadKnowledgeFromContent();
  await audit({ action: "kb.reloaded", actorUserId: user.userId, actorRole: user.role, entityType: "kb", after: result, ip });
  return result;
});
