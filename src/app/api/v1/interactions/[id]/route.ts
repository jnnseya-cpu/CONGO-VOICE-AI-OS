import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { forbidden, notFound } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { schema } from "@server/db/client";

export const GET = handle<{ id: string }>({ permission: "interaction:read_own" }, async ({ db, user, params }) => {
  const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, params.id));
  if (!row) throw notFound();
  const canReadAll = hasPermission(user.role, "interaction:read_all") || hasPermission(user.role, "case:read");
  if (row.userId !== user.userId && !canReadAll) throw forbidden();
  const structured = (row.structured ?? {}) as Record<string, unknown>;
  return {
    interaction: {
      id: row.id,
      createdAt: row.createdAt,
      module: row.module,
      channel: row.channel,
      language: row.language,
      languageConfidence: row.languageConfidence,
      province: row.province,
      transcript: row.transcript,
      translationFr: row.translationFr,
      intent: row.intent,
      understanding: row.understanding,
      response: row.response,
      followUpQuestions: row.followUpQuestions,
      answer: structured.answer ?? null,
      answerLocalised: structured.answerLocalised ?? null,
      confidence: row.confidence,
      riskScore: row.riskScore,
      severity: row.severity,
      escalated: row.escalationRequired,
      caseId: row.caseId,
      status: row.status,
      summary: row.summary,
      latencyMs: row.latencyMs,
      attachmentIds: row.attachmentIds,
      audioFileId: row.audioFileId,
    },
  };
});
