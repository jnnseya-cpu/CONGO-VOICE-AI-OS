import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { schema } from "@/lib/db/client";
import {
  FOLLOW_UP_DECISIONS,
  REACHABILITY_VALUES,
  permittedTransitions,
  transitionCase,
} from "@/lib/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

/** The transitions this case may take right now, with their rules. */
export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, user, params }) => {
  const c = await loadCaseScoped(db, params.id, user.role);
  const history = await db
    .select()
    .from(schema.caseEvents)
    .where(eq(schema.caseEvents.caseId, c.id))
    .orderBy(asc(schema.caseEvents.createdAt));
  return {
    status: c.status,
    version: c.version,
    slaDueAt: c.slaDueAt,
    slaBreached: c.slaBreached,
    permitted: permittedTransitions(c.status).map((s) => ({
      to: s.to,
      label: s.label,
      reasonRequired: s.reasonRequired,
      slaEffect: s.slaEffect,
      requiresClosureData: s.requiresClosureData ?? false,
      actorRoles: s.actorRoles,
      allowedForMe: s.actorRoles.includes(user.role),
    })),
    history,
  };
});

const Body = z.object({
  to: z.enum([
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
  ]),
  note: z.string().max(4000).optional(),
  reason: z.string().max(2000).optional(),
  outcome: z.string().max(120).optional(),
  actionTaken: z.string().max(4000).optional(),
  citizenReachability: z.enum(REACHABILITY_VALUES).optional(),
  followUpDecision: z.enum(FOLLOW_UP_DECISIONS).optional(),
  slaPausedReason: z.string().max(120).optional(),
  expectedVersion: z.number().int().optional(),
});

/** Perform one transition. Invalid transitions are refused with the permitted list. */
export const POST = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const c = await loadCaseScoped(db, params.id, user.role);
  const after = await transitionCase(c.id, body.to, { userId: user.userId, role: user.role }, body.note, {
    reason: body.reason,
    outcome: body.outcome,
    actionTaken: body.actionTaken,
    citizenReachability: body.citizenReachability,
    followUpDecision: body.followUpDecision,
    slaPausedReason: body.slaPausedReason,
    expectedVersion: body.expectedVersion,
  });
  return { case: after };
});
