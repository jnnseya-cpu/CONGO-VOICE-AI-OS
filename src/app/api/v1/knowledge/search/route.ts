import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import { searchKnowledge } from "@/lib/ai/knowledge";
import type { ModuleType } from "@/lib/db/schema";

const MODULES: ModuleType[] = ["health", "agriculture", "education", "general"];

/** Retrieval over the approved knowledge base. Returns citable identifiers, never prompts. */
export const GET = handle({ auth: true, limit: "ai" }, async ({ req }) => {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const moduleParam = (params.get("module") ?? "health") as ModuleType;
  if (!q) throw badRequest("Paramètre q requis");
  if (!MODULES.includes(moduleParam)) throw badRequest("Module inconnu");
  const k = Math.min(10, Math.max(1, Number(params.get("k") ?? 5)));
  const docIds = params.get("docIds")?.split(",").map((s) => s.trim()).filter(Boolean);
  const hits = await searchKnowledge(moduleParam, q, k, { docIds });
  return { query: q, module: moduleParam, hits: hits.map((h) => ({ docId: h.docId, title: h.title, authority: h.authority, version: h.version, text: h.text, score: h.score })) };
});
