import { handle } from "@server/core/api";
import { approvalSummary, artefactApprovals } from "@server/ai/review/gate";

/** Everything a board can sign, and whether it is signed right now (AI-10, AI-11). */
export const GET = handle({ permission: "review:read" }, async ({ req }) => {
  const raw = new URL(req.url).searchParams.get("module");
  const moduleFilter = raw === "health" || raw === "agriculture" || raw === "education" ? raw : undefined;
  return { artefacts: await artefactApprovals(moduleFilter), summary: await approvalSummary(moduleFilter) };
});
