import { handle } from "@/lib/core/api";
import { forbidden } from "@/lib/core/errors";
import { hasPermission } from "@/lib/core/rbac";
import { classGaps, EVIDENCE_DISCLAIMER, learnerEvidence, summariseEvidence } from "@/lib/ai/education/evidence";
import { plannedRevisions } from "@/lib/ai/education/spaced-repetition";

/**
 * Learning evidence (FR-ED-08). By default a learner reads their own events; `?scope=class`
 * returns class-level gaps for holders of the education dashboard permission, with small
 * groups suppressed. Evidence describes moments, never a permanent ability label.
 */
export const GET = handle({ auth: true }, async ({ req, user }) => {
  const q = req.nextUrl.searchParams;
  const days = q.get("days") ? Math.min(365, Math.max(1, Number(q.get("days")))) : 30;

  if (q.get("scope") === "class") {
    if (!hasPermission(user.role, "dashboard:edu")) throw forbidden("Vue classe réservée aux enseignants et aux responsables");
    const gaps = await classGaps({ province: q.get("province") ?? user.province ?? null, territory: q.get("territory"), subject: q.get("subject"), days });
    return { scope: "class", ...gaps };
  }

  const rows = await learnerEvidence({ userId: user.userId, topic: q.get("topic"), days, limit: q.get("limit") ? Number(q.get("limit")) : 50 });
  return {
    scope: "own",
    evidence: rows,
    summary: summariseEvidence(rows),
    upcomingRevisions: await plannedRevisions(user.userId),
    disclaimer: EVIDENCE_DISCLAIMER,
  };
});
