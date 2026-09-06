import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { forbidden, notFound } from "@server/core/errors";
import { moduleScopeFor } from "@server/core/rbac";
import { schema } from "@server/db/client";
import { FOLLOW_UP_DECISIONS, REACHABILITY_VALUES, addCaseNote, assignCase, transitionCase } from "@server/ai/agents/workflow";

async function loadScoped(db: Parameters<Parameters<typeof handle>[1]>[0]["db"], id: string, role: Parameters<typeof moduleScopeFor>[0]) {
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
  if (!c) throw notFound();
  const scope = moduleScopeFor(role);
  if (scope && !scope.includes(c.module)) throw forbidden();
  return c;
}

export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, user, params }) => {
  const c = await loadScoped(db, params.id, user.role);
  const events = await db.select().from(schema.caseEvents).where(eq(schema.caseEvents.caseId, c.id)).orderBy(asc(schema.caseEvents.createdAt));
  const [interaction] = c.interactionId ? await db.select().from(schema.interactions).where(eq(schema.interactions.id, c.interactionId)) : [];
  const assignee = c.assignedTo ? (await db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, c.assignedTo)))[0] : null;
  const structured = (interaction?.structured ?? {}) as Record<string, unknown>;
  return {
    case: c,
    events,
    assignee,
    interaction: interaction
      ? { id: interaction.id, transcript: interaction.transcript, translationFr: interaction.translationFr, language: interaction.language, response: interaction.response, answer: structured.answer ?? null, followUpQuestions: interaction.followUpQuestions, attachmentIds: interaction.attachmentIds, audioFileId: interaction.audioFileId, confidence: interaction.confidence, createdAt: interaction.createdAt }
      : null,
  };
});

const Patch = z.object({
  status: z
    .enum([
      "open",
      "open_emergency",
      "assigned",
      "acknowledged",
      "in_progress",
      "needs_follow_up",
      "reassigned",
      "escalated",
      "escalated_up",
      "resolved",
      "closed",
      "cancelled",
      "duplicate",
    ])
    .optional(),
  assignTo: z.string().uuid().optional(),
  note: z.string().max(4000).optional(),
  reason: z.string().max(2000).optional(),
  outcome: z.string().max(120).optional(),
  followUpDate: z.string().datetime().optional(),
  /** Closure quality data (CAS-006): all four are required to close a case. */
  actionTaken: z.string().max(4000).optional(),
  citizenReachability: z.enum(REACHABILITY_VALUES).optional(),
  followUpDecision: z.enum(FOLLOW_UP_DECISIONS).optional(),
  expectedVersion: z.number().int().optional(),
});

export const PATCH = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Patch);
  let c = await loadScoped(db, params.id, user.role);
  const actor = { userId: user.userId, role: user.role };
  if (body.assignTo) c = (await assignCase(c.id, body.assignTo, actor, { reason: body.reason, expectedVersion: body.expectedVersion })) ?? c;
  if (body.note && !body.status) await addCaseNote(c.id, actor, body.note);
  if (body.status) {
    c =
      (await transitionCase(c.id, body.status, actor, body.note, {
        reason: body.reason,
        outcome: body.outcome,
        actionTaken: body.actionTaken,
        citizenReachability: body.citizenReachability,
        followUpDecision: body.followUpDecision,
      })) ?? c;
  }
  if (body.outcome || body.followUpDate) {
    [c] = await db.update(schema.cases).set({ outcome: body.outcome ?? c.outcome, followUpDate: body.followUpDate ? new Date(body.followUpDate) : c.followUpDate, updatedAt: new Date() }).where(eq(schema.cases.id, c.id)).returning();
  }
  return { case: c };
});
