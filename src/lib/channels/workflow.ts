/**
 * Processing status of one interaction, expressed as a stage the citizen can be shown.
 *
 * The stages mirror the orchestrator's autosave points, so a client can follow a turn
 * (spinner, "j'écoute…", "je réfléchis…") without ever seeing internal detail.
 */
import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

export type WorkflowStage =
  | "received"
  | "transcribing"
  | "understanding"
  | "reasoning"
  | "composing"
  | "completed"
  | "failed";

export const STAGE_ORDER: WorkflowStage[] = ["received", "transcribing", "understanding", "reasoning", "composing", "completed"];

type InteractionRow = typeof schema.interactions.$inferSelect;

export function stageOf(row: InteractionRow): WorkflowStage {
  if (row.status === "completed") return "completed";
  if (row.status === "failed" || row.status === "abandoned") return "failed";
  if (row.response) return "composing";
  if (row.language) return "reasoning";
  if (row.transcript || row.originalInput) return "understanding";
  return row.audioFileId ? "transcribing" : "received";
}

export interface WorkflowStatus {
  interaction_id: string;
  session_id: string | null;
  seq: number;
  stage: WorkflowStage;
  status: InteractionRow["status"];
  progress: number;
  module: InteractionRow["module"];
  language: InteractionRow["language"];
  /** Safe partial state: what is already known, never raw internals. */
  partial: {
    transcript: string | null;
    understanding: string | null;
    response: string | null;
    follow_up_questions: string[];
  };
  severity: InteractionRow["severity"];
  escalated: boolean;
  case_id: string | null;
  latency_ms: number | null;
  updated_at: Date;
}

export function toWorkflowStatus(row: InteractionRow): WorkflowStatus {
  const stage = stageOf(row);
  const index = STAGE_ORDER.indexOf(stage);
  return {
    interaction_id: row.id,
    session_id: row.sessionId,
    seq: row.seq,
    stage,
    status: row.status,
    progress: stage === "failed" ? 1 : (index + 1) / STAGE_ORDER.length,
    module: row.module,
    language: row.language,
    partial: {
      transcript: row.transcript,
      understanding: row.understanding,
      response: row.response,
      follow_up_questions: row.followUpQuestions ?? [],
    },
    severity: row.severity,
    escalated: row.escalationRequired,
    case_id: row.caseId,
    latency_ms: row.latencyMs,
    updated_at: row.updatedAt,
  };
}

export async function loadInteraction(id: string): Promise<InteractionRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, id));
  return row ?? null;
}

/** Most recent interaction of a session — what a stream follows when no id is given. */
export async function latestInteractionOfSession(sessionId: string): Promise<InteractionRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.sessionId, sessionId))
    .orderBy(desc(schema.interactions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
