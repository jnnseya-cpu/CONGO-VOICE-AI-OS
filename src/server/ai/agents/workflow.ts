/**
 * Workflow Agent — the case state machine.
 *
 * A case is the unit of accountability: exactly one queue, one owner, one clock. This module
 * owns the permitted transitions, the SLA clocks, assignment routing, tasks, follow-ups,
 * merges and closure quality. Nothing here is model judgement: every rule is deterministic
 * code, so the same input always produces the same escalation.
 *
 *  FR-CS-01  a case is created automatically for severity ≥ 2, confidence < 0.40,
 *            a notifiable agricultural disease, or an explicit request for a human
 *  FR-CS-02  routing territory → organisation → role → on-duty → least loaded
 *  FR-CS-03  SLA clocks: emergency 15 min · severity 3 → 4 h · severity 2 → 24 h
 *  FR-CS-04  breach → escalation to the supervisor, notification and `case.sla.breached`
 *  FR-CS-05  severity override requires a written reason (≥ 10 characters)
 *  FR-CS-06  closure requires outcome, action taken, reachability and a follow-up decision
 *  FR-CS-07  duplicates are merged, never deleted; identifiers are preserved
 *  CAS-002   assignment is atomic (compare-and-swap on the case version)
 */
import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { CaseStatus, ModuleType, Role, Severity } from "@server/db/schema";
import { audit } from "@server/core/audit";
import { emitEvent } from "@server/core/events";
import { notify, notifyRoleTemplate, notifyTemplate } from "@server/core/notifications";
import { escalationRoleFor } from "@server/core/rbac";
import { ApiError, badRequest, notFound } from "@server/core/errors";
import { safeLog } from "@server/core/redact";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** Actor recorded when the scheduler acts on an unassigned case. */
const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/* ------------------------------------------------------------------------------------------
 * Severity, SLA clocks
 * ---------------------------------------------------------------------------------------- */

/** 0 self-care · 1 monitor · 2 clinic within 24 h · 3 clinic today · 4 emergency now */
export const SEVERITY_TO_LEVEL: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
export const LEVEL_TO_SEVERITY: Record<number, Severity> = { 0: "low", 1: "low", 2: "medium", 3: "high", 4: "critical" };

/** Time allowed to acknowledge and act, by severity level. `null` = no clock. */
export const SLA_MS: Record<number, number | null> = {
  4: 15 * MINUTE,
  3: 4 * HOUR,
  2: 24 * HOUR,
  1: 72 * HOUR,
  0: null,
};

const FOLLOW_UP_HOURS: Record<Severity, number> = { critical: 2, high: 24, medium: 72, low: 168 };

export function slaDueFor(severityLevel: number, from: Date = new Date()): Date | null {
  const ms = SLA_MS[severityLevel] ?? null;
  return ms === null ? null : new Date(from.getTime() + ms);
}

/* ------------------------------------------------------------------------------------------
 * State machine
 * ---------------------------------------------------------------------------------------- */

/** What a transition does to the SLA clock. */
export type SlaEffect = "start" | "keep" | "pause" | "resume" | "restart" | "stop";

export interface TransitionSpec {
  to: CaseStatus;
  /** Roles allowed to perform it ("system" is the scheduler / agents). */
  actorRoles: Array<Role | "system">;
  /** A written reason is mandatory. */
  reasonRequired: boolean;
  slaEffect: SlaEffect;
  /** Closure quality gate (CAS-006). */
  requiresClosureData?: boolean;
  label: string;
}

const WORKERS: Array<Role | "system"> = ["chw", "agri_officer", "teacher", "ngo", "gov_admin", "platform_admin", "system"];
const SUPERVISORS: Array<Role | "system"> = ["gov_admin", "platform_admin", "system"];

const t = (to: CaseStatus, label: string, slaEffect: SlaEffect, opts: Partial<TransitionSpec> = {}): TransitionSpec => ({
  to,
  label,
  slaEffect,
  actorRoles: opts.actorRoles ?? WORKERS,
  reasonRequired: opts.reasonRequired ?? false,
  requiresClosureData: opts.requiresClosureData ?? false,
});

/** The complete permitted-transition table. Anything not listed here is refused. */
export const TRANSITIONS: Record<CaseStatus, TransitionSpec[]> = {
  open: [
    t("open_emergency", "Requalification en urgence", "restart"),
    t("assigned", "Attribution", "keep"),
    t("in_progress", "Prise en charge", "keep"),
    t("escalated", "Escalade", "restart"),
    t("resolved", "Résolution", "stop"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
    t("duplicate", "Doublon", "stop", { reasonRequired: true }),
  ],
  open_emergency: [
    t("assigned", "Attribution", "keep"),
    t("in_progress", "Prise en charge", "keep"),
    t("escalated", "Escalade", "restart"),
    t("escalated_up", "Escalade superviseur", "restart", { actorRoles: WORKERS }),
    t("resolved", "Résolution", "stop"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
    t("duplicate", "Doublon", "stop", { reasonRequired: true }),
  ],
  assigned: [
    t("acknowledged", "Accusé de réception", "stop"),
    t("in_progress", "Prise en charge", "keep"),
    t("reassigned", "Réattribution", "keep", { reasonRequired: true }),
    t("escalated", "Escalade", "restart"),
    t("resolved", "Résolution", "stop"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
    t("duplicate", "Doublon", "stop", { reasonRequired: true }),
  ],
  acknowledged: [
    t("in_progress", "Prise en charge", "keep"),
    t("needs_follow_up", "Suivi requis", "pause"),
    t("reassigned", "Réattribution", "keep", { reasonRequired: true }),
    t("escalated", "Escalade", "restart"),
    t("resolved", "Résolution", "stop"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
    t("duplicate", "Doublon", "stop", { reasonRequired: true }),
  ],
  in_progress: [
    t("needs_follow_up", "Suivi requis", "pause"),
    t("resolved", "Résolution", "stop"),
    t("reassigned", "Réattribution", "keep", { reasonRequired: true }),
    t("escalated", "Escalade", "restart"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
    t("duplicate", "Doublon", "stop", { reasonRequired: true }),
  ],
  needs_follow_up: [
    t("in_progress", "Reprise", "resume"),
    t("resolved", "Résolution", "stop"),
    t("reassigned", "Réattribution", "keep", { reasonRequired: true }),
    t("escalated", "Escalade", "restart"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
  ],
  reassigned: [
    t("assigned", "Nouvelle attribution", "restart"),
    t("acknowledged", "Accusé de réception", "stop"),
    t("in_progress", "Prise en charge", "keep"),
    t("escalated", "Escalade", "restart"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
  ],
  escalated: [
    t("assigned", "Attribution", "keep"),
    t("acknowledged", "Accusé de réception", "stop"),
    t("in_progress", "Prise en charge", "keep"),
    t("needs_follow_up", "Suivi requis", "pause"),
    t("escalated_up", "Escalade superviseur", "restart"),
    t("resolved", "Résolution", "stop"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true }),
  ],
  escalated_up: [
    t("assigned", "Attribution", "keep", { actorRoles: SUPERVISORS }),
    t("acknowledged", "Accusé de réception", "stop"),
    t("in_progress", "Prise en charge", "keep"),
    t("resolved", "Résolution", "stop"),
    t("cancelled", "Annulation", "stop", { reasonRequired: true, actorRoles: SUPERVISORS }),
  ],
  resolved: [
    t("closed", "Clôture", "stop", { requiresClosureData: true }),
    t("needs_follow_up", "Réouverture pour suivi", "resume"),
    t("in_progress", "Réouverture", "restart", { reasonRequired: true }),
  ],
  closed: [],
  cancelled: [],
  duplicate: [],
};

export const TERMINAL_STATUSES: CaseStatus[] = ["closed", "cancelled", "duplicate"];
/** Statuses in which a case is still someone's responsibility. */
export const ACTIVE_STATUSES: CaseStatus[] = [
  "open",
  "open_emergency",
  "assigned",
  "acknowledged",
  "in_progress",
  "needs_follow_up",
  "reassigned",
  "escalated",
  "escalated_up",
];

export function permittedTransitions(from: CaseStatus): TransitionSpec[] {
  return TRANSITIONS[from] ?? [];
}

export function findTransition(from: CaseStatus, to: CaseStatus): TransitionSpec | null {
  return permittedTransitions(from).find((s) => s.to === to) ?? null;
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return findTransition(from, to) !== null;
}

/* ------------------------------------------------------------------------------------------
 * Case creation (FR-CS-01)
 * ---------------------------------------------------------------------------------------- */

export interface AutoCreateSignals {
  severityLevel?: number | null;
  severity?: Severity | null;
  confidence?: number | null;
  isNotifiable?: boolean;
  humanRequested?: boolean;
  safeguarding?: boolean;
}

export const LOW_CONFIDENCE_CASE_THRESHOLD = 0.4;

/** Deterministic rule set deciding whether an interaction must become a case. */
export function shouldAutoCreateCase(signals: AutoCreateSignals): { create: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const level = signals.severityLevel ?? (signals.severity ? SEVERITY_TO_LEVEL[signals.severity] : null);
  if (level !== null && level >= 2) reasons.push(`severity_level_${level}`);
  if (typeof signals.confidence === "number" && signals.confidence < LOW_CONFIDENCE_CASE_THRESHOLD) reasons.push("low_confidence");
  if (signals.isNotifiable) reasons.push("notifiable_disease");
  if (signals.humanRequested) reasons.push("human_requested");
  if (signals.safeguarding) reasons.push("safeguarding");
  return { create: reasons.length > 0, reasons };
}

export function queueNameFor(input: { module: ModuleType; province?: string | null; territory?: string | null }): string {
  const role = escalationRoleFor(input.module);
  return [role, input.province ?? "national", input.territory ?? "*"].join(":");
}

export interface OpenCaseInput {
  module: ModuleType;
  userId?: string | null;
  interactionId: string;
  title: string;
  severity: Severity;
  province?: string | null;
  notes?: string;
  escalate?: boolean;
  escalationReason?: string | null;
  /** Extended, optional operations fields. */
  severityLevel?: number | null;
  aiSeverityLevel?: number | null;
  confidence?: number | null;
  territory?: string | null;
  tenantId?: string | null;
  organisationId?: string | null;
  isNotifiable?: boolean;
  safeguarding?: boolean;
  humanRequested?: boolean;
  /** Route and assign immediately (default: yes for emergencies). */
  autoAssign?: boolean;
  actor?: { userId?: string | null; role?: string | null };
}

export async function openCase(input: OpenCaseInput) {
  const db = await getDb();
  const now = new Date();
  const severityLevel = input.severityLevel ?? SEVERITY_TO_LEVEL[input.severity];
  const emergency = severityLevel >= 4;
  const status: CaseStatus = input.escalate ? "escalated" : emergency ? "open_emergency" : "open";
  const slaDueAt = slaDueFor(severityLevel, now);
  const queue = queueNameFor(input);
  const followUpDate = new Date(now.getTime() + FOLLOW_UP_HOURS[input.severity] * HOUR);
  const { reasons } = shouldAutoCreateCase({ severityLevel, confidence: input.confidence, isNotifiable: input.isNotifiable, humanRequested: input.humanRequested, safeguarding: input.safeguarding });

  const [c] = await db
    .insert(schema.cases)
    .values({
      module: input.module,
      userId: input.userId ?? null,
      interactionId: input.interactionId,
      title: input.title.slice(0, 240),
      severity: input.severity,
      status,
      escalationLevel: input.escalate ? 1 : 0,
      province: input.province ?? null,
      territory: input.territory ?? null,
      tenantId: input.tenantId ?? null,
      organisationId: input.organisationId ?? null,
      notes: input.notes,
      followUpDate,
      queue,
      severityLevel,
      aiSeverityLevel: input.aiSeverityLevel ?? severityLevel,
      slaDueAt,
      isNotifiable: input.isNotifiable ?? false,
      safeguarding: input.safeguarding ?? false,
    })
    .returning();

  await db.insert(schema.caseEvents).values({ caseId: c.id, type: "created", toValue: c.status, note: input.notes, actorUserId: input.actor?.userId ?? null });
  await audit({
    action: "case.created",
    actorUserId: input.actor?.userId ?? null,
    actorRole: input.actor?.role ?? null,
    entityType: "case",
    entityId: c.id,
    after: { severity: c.severity, severityLevel, status: c.status, queue, slaDueAt },
    systemEvent: "workflow_agent",
    tenantId: c.tenantId,
  });
  await emitEvent({
    type: "case.created",
    aggregateType: "case",
    aggregateId: c.id,
    aggregateVersion: c.version,
    tenantId: c.tenantId,
    module: c.module,
    actor: input.actor?.userId ? { type: "worker", id: input.actor.userId } : { type: "ai" },
    classification: c.safeguarding ? "restricted" : "confidential",
    payload: { status: c.status, severityLevel, queue, slaDueAt: slaDueAt?.toISOString() ?? null, autoCreateReasons: reasons },
  });

  // Acknowledgement task: the clock is only stopped by a human act.
  await createTask(c.id, { type: "acknowledge", queue, dueAt: slaDueAt, priority: emergency ? "urgent" : severityLevel >= 3 ? "high" : "normal" });

  if (input.escalate || emergency) {
    await db.insert(schema.caseEvents).values({ caseId: c.id, type: "escalated", fromValue: "0", toValue: "1", note: input.escalationReason ?? undefined });
    await alertOwners(c, input.escalationReason ?? null);
  }

  if (input.autoAssign ?? emergency) {
    try {
      await autoAssignCase(c.id, { userId: input.actor?.userId ?? null, role: "system" });
    } catch (err) {
      safeLog.warn("workflow", "auto-assignment failed", err);
    }
  }
  const [fresh] = await db.select().from(schema.cases).where(eq(schema.cases.id, c.id));
  return fresh ?? c;
}

type CaseRow = typeof schema.cases.$inferSelect;

/** Alert the accountable role (and administrators for emergencies) about a new critical case. */
async function alertOwners(c: CaseRow, reason: string | null) {
  const role = escalationRoleFor(c.module);
  const emergency = c.severityLevel >= 4;
  await notifyRoleTemplate(
    role,
    {
      key: "emergency.worker_alert",
      type: emergency ? "emergency" : "escalation",
      channel: "in_app",
      vars: { title: c.title, province: c.province ?? "—", caseRef: caseRef(c.id) },
      payload: { caseId: c.id, module: c.module, severityLevel: c.severityLevel, reason },
      emergency,
      requiresAck: true,
      sensitive: c.module === "health" || c.safeguarding,
      caseId: c.id,
      tenantId: c.tenantId,
      dedupeKey: `case-alert:${c.id}`,
    },
    c.province,
  );
  if (emergency) {
    await notify({
      channel: "email",
      type: "alert",
      title: `Cas critique ${c.module}`,
      body: `${c.title} (${c.province ?? "province inconnue"}) — réf. ${caseRef(c.id)}`,
      payload: { caseId: c.id },
      emergency: true,
      caseId: c.id,
    });
  }
}

export function caseRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/* ------------------------------------------------------------------------------------------
 * Transitions
 * ---------------------------------------------------------------------------------------- */

export interface TransitionOptions {
  reason?: string | null;
  /** Closure quality data (CAS-006). */
  outcome?: string | null;
  actionTaken?: string | null;
  citizenReachability?: string | null;
  followUpDecision?: string | null;
  /** Optimistic concurrency: refuse the write when the case moved underneath. */
  expectedVersion?: number;
  assigneeId?: string | null;
  slaPausedReason?: string | null;
}

export const REACHABILITY_VALUES = ["reached", "not_reached", "reached_by_proxy", "refused", "unknown"] as const;
export const FOLLOW_UP_DECISIONS = ["no_follow_up", "follow_up_scheduled", "referred", "monitoring", "handed_over"] as const;

/**
 * Move a case through the state machine. Refuses any transition not in the table, enforces
 * the reason and closure gates, applies the SLA clock effect, records a case event, audits
 * and emits `case.status.changed`.
 */
export async function transitionCase(
  caseId: string,
  to: CaseStatus,
  actor: { userId: string; role: string },
  note?: string,
  options: TransitionOptions = {},
) {
  const db = await getDb();
  const [before] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!before) return null;
  if (before.status === to) return before;

  const spec = findTransition(before.status, to);
  if (!spec) {
    throw badRequest(
      `Transition « ${before.status} » → « ${to} » non autorisée. Transitions possibles : ${permittedTransitions(before.status).map((s) => s.to).join(", ") || "aucune (état terminal)"}.`,
    );
  }
  if (!spec.actorRoles.includes(actor.role as Role | "system")) {
    throw new ApiError(403, `Le rôle « ${actor.role} » ne peut pas effectuer la transition « ${spec.label} ».`, "forbidden");
  }
  const reason = options.reason ?? note ?? null;
  if (spec.reasonRequired && (!reason || reason.trim().length < 10)) {
    throw badRequest(`Un motif d'au moins 10 caractères est obligatoire pour « ${spec.label} ».`);
  }
  if (spec.requiresClosureData) {
    const missing: string[] = [];
    const outcome = options.outcome ?? before.outcome;
    const actionTaken = options.actionTaken ?? before.actionTaken;
    const reachability = options.citizenReachability ?? before.citizenReachability;
    const decision = options.followUpDecision ?? before.followUpDecision;
    if (!outcome) missing.push("outcome");
    if (!actionTaken) missing.push("actionTaken");
    if (!reachability) missing.push("citizenReachability");
    if (!decision) missing.push("followUpDecision");
    if (missing.length) throw badRequest(`Clôture incomplète : ${missing.join(", ")} obligatoire(s).`, { missing });
  }
  if (options.expectedVersion !== undefined && options.expectedVersion !== before.version) {
    throw new ApiError(409, "Le cas a été modifié entre-temps : rechargez-le.", "conflict");
  }

  const now = new Date();
  const patch: Partial<typeof schema.cases.$inferInsert> = {
    status: to,
    updatedAt: now,
    version: before.version + 1,
  };
  applySlaEffect(patch, spec.slaEffect, before, now, options.slaPausedReason ?? null);

  if (to === "acknowledged") {
    patch.acknowledgedAt = before.acknowledgedAt ?? now;
    patch.acknowledgedBy = actor.userId;
  }
  if (to === "resolved") {
    patch.resolvedAt = now;
    patch.resolution = note ?? options.reason ?? before.resolution;
  }
  if (to === "closed") patch.closedAt = now;
  if (options.outcome !== undefined && options.outcome !== null) patch.outcome = options.outcome.slice(0, 120);
  if (options.actionTaken !== undefined && options.actionTaken !== null) patch.actionTaken = options.actionTaken;
  if (options.citizenReachability) patch.citizenReachability = options.citizenReachability.slice(0, 32);
  if (options.followUpDecision) patch.followUpDecision = options.followUpDecision.slice(0, 64);
  if (to === "escalated" || to === "escalated_up") patch.escalationLevel = before.escalationLevel + 1;

  const [after] = await db
    .update(schema.cases)
    .set(patch)
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.version, before.version)))
    .returning();
  if (!after) throw new ApiError(409, "Le cas a été modifié entre-temps : rechargez-le.", "conflict");

  await db.insert(schema.caseEvents).values({ caseId, type: "status_changed", fromValue: before.status, toValue: to, actorUserId: actor.userId, note: note ?? reason ?? undefined });
  await audit({
    action: "case.status_changed",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "case",
    entityId: caseId,
    before: { status: before.status, slaDueAt: before.slaDueAt },
    after: { status: to, slaDueAt: after.slaDueAt, reason },
    tenantId: after.tenantId,
  });
  await emitEvent({
    type: to === "closed" ? "case.closed" : "case.status.changed",
    aggregateType: "case",
    aggregateId: caseId,
    aggregateVersion: after.version,
    tenantId: after.tenantId,
    module: after.module,
    actor: { type: actor.role === "system" ? "system" : "worker", id: actor.userId },
    classification: after.safeguarding ? "restricted" : "confidential",
    payload: { from: before.status, to, slaEffect: spec.slaEffect, reason, outcome: after.outcome, followUpDecision: after.followUpDecision },
  });

  if (to === "acknowledged") await closeTasks(caseId, "acknowledge", actor.userId);
  if (to === "escalated" || to === "escalated_up") {
    const supervisor: Role = to === "escalated_up" ? "gov_admin" : escalationRoleFor(after.module);
    await notifyRoleTemplate(
      supervisor,
      {
        key: "emergency.worker_alert",
        type: "escalation",
        channel: "in_app",
        vars: { title: after.title, province: after.province ?? "—", caseRef: caseRef(after.id) },
        payload: { caseId, level: after.escalationLevel },
        requiresAck: true,
        sensitive: after.module === "health" || after.safeguarding,
        caseId,
        dedupeKey: `case-escalation:${caseId}:${after.escalationLevel}`,
      },
      after.province,
    );
  }
  return after;
}

function applySlaEffect(
  patch: Partial<typeof schema.cases.$inferInsert>,
  effect: SlaEffect,
  before: CaseRow,
  now: Date,
  pausedReason: string | null,
) {
  switch (effect) {
    case "start":
    case "restart":
      // A new clock, but the breach that already happened stays on the record.
      patch.slaDueAt = slaDueFor(before.severityLevel, now);
      patch.slaPausedReason = null;
      break;
    case "pause":
      patch.slaPausedReason = pausedReason ?? "en attente du citoyen";
      patch.slaDueAt = null;
      break;
    case "resume":
      patch.slaDueAt = slaDueFor(before.severityLevel, now);
      patch.slaPausedReason = null;
      break;
    case "stop":
      patch.slaDueAt = null;
      patch.slaPausedReason = null;
      break;
    case "keep":
    default:
      break;
  }
}

/**
 * Explicit acknowledgement — the human act that stops the response clock.
 *
 * When the case is still waiting, this moves it to `acknowledged`. When work has already
 * started (or the case was escalated onwards), the status stays where it is and only the
 * acknowledgement is recorded: acknowledging must never push a case backwards.
 */
export async function acknowledgeCase(caseId: string, actor: { userId: string; role: string }, note?: string) {
  const db = await getDb();
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!c) throw notFound();
  if (c.acknowledgedAt) return c;
  if (TERMINAL_STATUSES.includes(c.status)) throw badRequest(`Un cas « ${c.status} » ne peut plus être accusé de réception.`);

  let after: CaseRow | null = null;
  if (canTransition(c.status, "acknowledged")) {
    after = await transitionCase(caseId, "acknowledged", actor, note);
  } else {
    const now = new Date();
    [after] = await db
      .update(schema.cases)
      .set({ acknowledgedAt: now, acknowledgedBy: actor.userId, slaDueAt: null, slaPausedReason: null, updatedAt: now, version: c.version + 1 })
      .where(and(eq(schema.cases.id, caseId), eq(schema.cases.version, c.version)))
      .returning();
    if (!after) throw new ApiError(409, "Le cas a été modifié entre-temps : rechargez-le.", "conflict");
    await db.insert(schema.caseEvents).values({ caseId, type: "acknowledged", toValue: c.status, actorUserId: actor.userId, note });
    await audit({ action: "case.acknowledged", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, after: { status: c.status, acknowledgedAt: now }, tenantId: after.tenantId });
    await closeTasks(caseId, "acknowledge", actor.userId);
  }
  if (after) {
    await emitEvent({
      type: "case.acknowledged",
      aggregateType: "case",
      aggregateId: caseId,
      module: after.module,
      actor: { type: "worker", id: actor.userId },
      payload: { status: after.status, latencyMs: after.createdAt ? Date.now() - after.createdAt.getTime() : null, severityLevel: after.severityLevel },
    });
  }
  return after;
}

/* ------------------------------------------------------------------------------------------
 * Escalation
 * ---------------------------------------------------------------------------------------- */

export async function escalateCase(caseId: string, actor: { userId: string; role: string }, reason?: string) {
  const db = await getDb();
  const [before] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!before) return null;
  const level = before.escalationLevel + 1;
  const target: CaseStatus = level >= 2 ? "escalated_up" : "escalated";
  const to = canTransition(before.status, target) ? target : canTransition(before.status, "escalated") ? "escalated" : null;
  if (!to) throw badRequest(`Un cas « ${before.status} » ne peut plus être escaladé.`);

  // Escalation raises the severity floor so the new clock matches the new attention level.
  const newLevel = Math.min(4, Math.max(before.severityLevel, level >= 2 ? 4 : before.severityLevel + 1));
  await db
    .update(schema.cases)
    .set({ severityLevel: newLevel, severity: LEVEL_TO_SEVERITY[newLevel] })
    .where(eq(schema.cases.id, caseId));

  const after = await transitionCase(caseId, to, actor, reason ?? "Escalade demandée", { reason: reason ?? "Escalade demandée" });
  if (!after) return null;
  await db.insert(schema.caseEvents).values({ caseId, type: "escalated", fromValue: String(before.escalationLevel), toValue: String(after.escalationLevel), actorUserId: actor.userId, note: reason });
  await audit({ action: "case.escalated", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, before: { level: before.escalationLevel }, after: { level: after.escalationLevel, status: after.status } });
  await emitEvent({ type: "case.escalated", aggregateType: "case", aggregateId: caseId, module: after.module, actor: { type: actor.role === "system" ? "system" : "worker", id: actor.userId }, payload: { level: after.escalationLevel, reason: reason ?? null, status: after.status } });
  return after;
}

/* ------------------------------------------------------------------------------------------
 * Assignment routing (FR-CS-02, CAS-002)
 * ---------------------------------------------------------------------------------------- */

export interface RoutingCandidate {
  userId: string;
  name: string | null;
  role: Role;
  onDuty: boolean;
  openCases: number;
  matchedOn: "territory" | "organisation" | "province" | "role";
}

/**
 * Routing order: territory → organisation → province → role, then on-duty first,
 * then the least loaded worker. Deterministic, so two callers pick the same person.
 */
export async function routeCase(c: Pick<CaseRow, "module" | "province" | "territory" | "organisationId" | "tenantId">): Promise<RoutingCandidate | null> {
  const db = await getDb();
  const role = escalationRoleFor(c.module);
  const pool = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      onDuty: schema.users.onDuty,
      province: schema.users.province,
      territory: schema.users.territory,
      territories: schema.users.territories,
      organisationId: schema.users.organisationId,
      tenantId: schema.users.tenantId,
    })
    .from(schema.users)
    .where(and(eq(schema.users.role, role), eq(schema.users.status, "active")));
  if (pool.length === 0) return null;

  const load = new Map<string, number>();
  const counts = await db
    .select({ userId: schema.cases.assignedTo, n: count() })
    .from(schema.cases)
    .where(and(isNotNull(schema.cases.assignedTo), inArray(schema.cases.status, ACTIVE_STATUSES)))
    .groupBy(schema.cases.assignedTo);
  for (const row of counts) if (row.userId) load.set(row.userId, row.n);

  const byTerritory = c.territory
    ? pool.filter((u) => u.territory === c.territory || (u.territories ?? []).includes(c.territory as string))
    : [];
  const byOrg = c.organisationId ? pool.filter((u) => u.organisationId === c.organisationId) : [];
  const byProvince = c.province ? pool.filter((u) => u.province === c.province) : [];

  const tiers: Array<{ list: typeof pool; matchedOn: RoutingCandidate["matchedOn"] }> = [
    { list: byTerritory, matchedOn: "territory" },
    { list: byOrg, matchedOn: "organisation" },
    { list: byProvince, matchedOn: "province" },
    { list: pool, matchedOn: "role" },
  ];
  for (const tier of tiers) {
    if (tier.list.length === 0) continue;
    const onDuty = tier.list.filter((u) => u.onDuty);
    const shortlist = onDuty.length > 0 ? onDuty : tier.list;
    const best = [...shortlist].sort((a, b) => {
      const la = load.get(a.id) ?? 0;
      const lb = load.get(b.id) ?? 0;
      if (la !== lb) return la - lb;
      return a.id.localeCompare(b.id);
    })[0];
    return { userId: best.id, name: best.name, role: best.role, onDuty: best.onDuty, openCases: load.get(best.id) ?? 0, matchedOn: tier.matchedOn };
  }
  return null;
}

export interface AssignOptions {
  expectedVersion?: number;
  reason?: string | null;
  matchedOn?: RoutingCandidate["matchedOn"] | "manual";
  /** Reassignment keeps the case in the workflow but records the hand-over. */
  reassign?: boolean;
}

/**
 * Atomic assignment (CAS-002): a compare-and-swap on `version` means two supervisors
 * clicking at the same instant cannot both win — the loser gets a 409 and reloads.
 */
export async function assignCase(caseId: string, assigneeId: string, actor: { userId: string; role: string }, options: AssignOptions = {}) {
  const db = await getDb();
  const [before] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!before) return null;
  if (options.expectedVersion !== undefined && options.expectedVersion !== before.version) {
    throw new ApiError(409, "Le cas a été modifié entre-temps : rechargez-le.", "conflict");
  }
  if (TERMINAL_STATUSES.includes(before.status)) throw badRequest(`Un cas « ${before.status} » ne peut plus être attribué.`);

  const reassigning = Boolean(before.assignedTo) && before.assignedTo !== assigneeId;
  const nextStatus: CaseStatus = reassigning ? "assigned" : canTransition(before.status, "assigned") ? "assigned" : before.status;
  const now = new Date();
  const [after] = await db
    .update(schema.cases)
    .set({
      assignedTo: assigneeId,
      status: nextStatus,
      acknowledgedAt: reassigning ? null : before.acknowledgedAt,
      acknowledgedBy: reassigning ? null : before.acknowledgedBy,
      slaDueAt: before.acknowledgedAt && !reassigning ? before.slaDueAt : slaDueFor(before.severityLevel, now),
      slaBreached: reassigning ? false : before.slaBreached,
      queue: before.queue ?? queueNameFor(before),
      updatedAt: now,
      version: before.version + 1,
    })
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.version, before.version)))
    .returning();
  if (!after) throw new ApiError(409, "Attribution concurrente détectée : le cas a déjà été pris.", "conflict");

  await db.insert(schema.caseEvents).values({
    caseId,
    type: reassigning ? "reassigned" : "assigned",
    fromValue: before.assignedTo,
    toValue: assigneeId,
    actorUserId: actor.userId,
    note: options.reason ?? (options.matchedOn ? `routage: ${options.matchedOn}` : undefined),
  });
  await audit({
    action: reassigning ? "case.reassigned" : "case.assigned",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "case",
    entityId: caseId,
    before: { assignedTo: before.assignedTo },
    after: { assignedTo: assigneeId, matchedOn: options.matchedOn ?? "manual", reason: options.reason ?? null },
    tenantId: after.tenantId,
  });
  await emitEvent({
    type: reassigning ? "case.reassigned" : "case.assigned",
    aggregateType: "case",
    aggregateId: caseId,
    aggregateVersion: after.version,
    tenantId: after.tenantId,
    module: after.module,
    actor: { type: actor.role === "system" ? "system" : "worker", id: actor.userId },
    payload: { assignedTo: assigneeId, previous: before.assignedTo, matchedOn: options.matchedOn ?? "manual", slaDueAt: after.slaDueAt?.toISOString() ?? null },
  });

  await createTask(caseId, { type: "acknowledge", ownerUserId: assigneeId, queue: after.queue, dueAt: after.slaDueAt, priority: after.severityLevel >= 4 ? "urgent" : "normal" });
  await notifyTemplate({
    key: "case.assigned",
    userId: assigneeId,
    type: "follow_up",
    channel: "in_app",
    vars: { title: after.title, province: after.province ?? "—", dueAt: after.slaDueAt ? formatDate(after.slaDueAt) : "—" },
    payload: { caseId },
    requiresAck: after.severityLevel >= 3,
    sensitive: after.module === "health" || after.safeguarding,
    caseId,
    fallbackTitle: "Nouveau cas assigné",
    fallbackBody: after.title,
  });
  return after;
}

/** Route and assign in one step; returns null when no worker matches. */
export async function autoAssignCase(caseId: string, actor: { userId?: string | null; role: string }) {
  const db = await getDb();
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!c) return null;
  const candidate = await routeCase(c);
  if (!candidate) return null;
  return assignCase(caseId, candidate.userId, { userId: actor.userId ?? candidate.userId, role: actor.role }, { matchedOn: candidate.matchedOn });
}

/* ------------------------------------------------------------------------------------------
 * Severity override (FR-CS-05)
 * ---------------------------------------------------------------------------------------- */

export const OVERRIDE_MIN_REASON = 10;

export interface OverrideInput {
  severityLevel: number;
  reason: string;
  reasonCode?: string;
}

/**
 * A human may always overrule the model, but never silently: the reason is mandatory,
 * the original value is kept, and the override feeds the AI performance report.
 */
export async function overrideSeverity(caseId: string, actor: { userId: string; role: string }, input: OverrideInput) {
  const db = await getDb();
  const reason = (input.reason ?? "").trim();
  if (reason.length < OVERRIDE_MIN_REASON) {
    throw badRequest(`Le motif de la modification est obligatoire (au moins ${OVERRIDE_MIN_REASON} caractères).`);
  }
  if (!Number.isInteger(input.severityLevel) || input.severityLevel < 0 || input.severityLevel > 4) {
    throw badRequest("Le niveau de gravité doit être un entier de 0 à 4.");
  }
  const [before] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!before) throw notFound();

  const now = new Date();
  const [after] = await db
    .update(schema.cases)
    .set({
      severityLevel: input.severityLevel,
      severity: LEVEL_TO_SEVERITY[input.severityLevel],
      overriddenSeverityLevel: input.severityLevel,
      overrideReason: reason,
      aiSeverityLevel: before.aiSeverityLevel ?? before.severityLevel,
      slaDueAt: before.acknowledgedAt ? before.slaDueAt : slaDueFor(input.severityLevel, now),
      updatedAt: now,
      version: before.version + 1,
    })
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.version, before.version)))
    .returning();
  if (!after) throw new ApiError(409, "Le cas a été modifié entre-temps : rechargez-le.", "conflict");

  const [override] = await db
    .insert(schema.aiOverrides)
    .values({
      caseId,
      interactionId: before.interactionId,
      workerId: actor.userId,
      field: "severity_level",
      aiValue: String(before.aiSeverityLevel ?? before.severityLevel),
      humanValue: String(input.severityLevel),
      reasonCode: input.reasonCode ?? null,
      reason,
    })
    .returning();

  await db.insert(schema.caseEvents).values({ caseId, type: "severity_overridden", fromValue: String(before.severityLevel), toValue: String(input.severityLevel), actorUserId: actor.userId, note: reason });
  await audit({
    action: "ai.override_recorded",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "case",
    entityId: caseId,
    before: { severityLevel: before.severityLevel },
    after: { severityLevel: input.severityLevel, reason },
    tenantId: after.tenantId,
  });
  await emitEvent({
    type: "ai.override.recorded",
    aggregateType: "case",
    aggregateId: caseId,
    tenantId: after.tenantId,
    module: after.module,
    actor: { type: "worker", id: actor.userId },
    payload: { field: "severity_level", aiValue: before.aiSeverityLevel ?? before.severityLevel, humanValue: input.severityLevel, reason, overrideId: override.id },
  });
  return { case: after, override };
}

/* ------------------------------------------------------------------------------------------
 * Tasks
 * ---------------------------------------------------------------------------------------- */

export const TASK_TYPES = ["acknowledge", "call_citizen", "field_visit", "follow_up", "validate_cluster", "review_override"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface CreateTaskInput {
  type: TaskType;
  ownerUserId?: string | null;
  queue?: string | null;
  dueAt?: Date | null;
  priority?: "low" | "normal" | "high" | "urgent";
  evidence?: Record<string, unknown>;
}

export async function createTask(caseId: string, input: CreateTaskInput) {
  const db = await getDb();
  // One open task of a kind per case: re-assignment updates the owner instead of piling up.
  const [existing] = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.caseId, caseId), eq(schema.tasks.type, input.type), eq(schema.tasks.status, "open")));
  if (existing) {
    const [updated] = await db
      .update(schema.tasks)
      .set({ ownerUserId: input.ownerUserId ?? existing.ownerUserId, queue: input.queue ?? existing.queue, dueAt: input.dueAt ?? existing.dueAt, priority: input.priority ?? existing.priority })
      .where(eq(schema.tasks.id, existing.id))
      .returning();
    return updated;
  }
  const [task] = await db
    .insert(schema.tasks)
    .values({
      caseId,
      type: input.type,
      ownerUserId: input.ownerUserId ?? null,
      queue: input.queue ?? null,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? "normal",
      evidence: input.evidence ?? {},
    })
    .returning();
  await emitEvent({ type: "task.created", aggregateType: "task", aggregateId: task.id, payload: { caseId, type: input.type, dueAt: input.dueAt?.toISOString() ?? null } });
  return task;
}

export async function completeTask(taskId: string, actor: { userId: string; role: string }, evidence: Record<string, unknown> = {}, status: "done" | "cancelled" = "done") {
  const db = await getDb();
  const [before] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!before) throw notFound();
  const [task] = await db
    .update(schema.tasks)
    .set({ status, completedAt: new Date(), evidence: { ...(before.evidence ?? {}), ...evidence, completedBy: actor.userId } })
    .where(eq(schema.tasks.id, taskId))
    .returning();
  await db.insert(schema.caseEvents).values({ caseId: before.caseId, type: "task_completed", toValue: before.type, actorUserId: actor.userId, note: typeof evidence.note === "string" ? evidence.note : undefined });
  await audit({ action: "task.completed", actorUserId: actor.userId, actorRole: actor.role, entityType: "task", entityId: taskId, after: { type: before.type, status } });
  await emitEvent({ type: "task.completed", aggregateType: "task", aggregateId: taskId, actor: { type: "worker", id: actor.userId }, payload: { caseId: before.caseId, type: before.type, status } });
  return task;
}

export async function acknowledgeTask(taskId: string, actor: { userId: string; role: string }) {
  const db = await getDb();
  const [task] = await db
    .update(schema.tasks)
    .set({ status: "acknowledged", acknowledgedAt: new Date(), ownerUserId: actor.userId })
    .where(eq(schema.tasks.id, taskId))
    .returning();
  if (!task) throw notFound();
  await emitEvent({ type: "task.acknowledged", aggregateType: "task", aggregateId: taskId, actor: { type: "worker", id: actor.userId }, payload: { caseId: task.caseId, type: task.type } });
  return task;
}

async function closeTasks(caseId: string, type: TaskType, userId: string) {
  const db = await getDb();
  await db
    .update(schema.tasks)
    .set({ status: "done", completedAt: new Date(), acknowledgedAt: new Date(), ownerUserId: userId })
    .where(and(eq(schema.tasks.caseId, caseId), eq(schema.tasks.type, type), inArray(schema.tasks.status, ["open", "acknowledged"])));
}

/* ------------------------------------------------------------------------------------------
 * Follow-ups captured from citizens
 * ---------------------------------------------------------------------------------------- */

export interface ScheduleFollowUpInput {
  caseId: string;
  userId?: string | null;
  scheduledFor: Date;
  channel?: "in_app" | "sms" | "whatsapp" | "email";
}

export async function scheduleFollowUp(input: ScheduleFollowUpInput) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.followUps)
    .values({ caseId: input.caseId, userId: input.userId ?? null, scheduledFor: input.scheduledFor, channel: input.channel ?? "sms" })
    .returning();
  await db.insert(schema.schedules).values({
    userId: input.userId ?? null,
    caseId: input.caseId,
    kind: "follow_up",
    channel: input.channel ?? "sms",
    scheduledFor: input.scheduledFor,
    payload: { followUpId: row.id },
  });
  await createTask(input.caseId, { type: "follow_up", dueAt: input.scheduledFor });
  await emitEvent({ type: "case.followup.scheduled", aggregateType: "case", aggregateId: input.caseId, payload: { followUpId: row.id, scheduledFor: input.scheduledFor.toISOString() } });
  return row;
}

export interface CaptureFollowUpInput {
  caseId: string;
  followUpId?: string;
  outcome: string;
  outcomeText?: string;
  status?: "captured" | "unreachable" | "cancelled";
  channel?: "in_app" | "sms" | "whatsapp" | "email";
  actor: { userId: string; role: string };
}

/** A citizen's answer (voice or SMS) recorded against the case. */
export async function captureFollowUp(input: CaptureFollowUpInput) {
  const db = await getDb();
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, input.caseId));
  if (!c) throw notFound();
  const now = new Date();
  let row;
  if (input.followUpId) {
    [row] = await db
      .update(schema.followUps)
      .set({ status: input.status ?? "captured", outcome: input.outcome.slice(0, 120), outcomeText: input.outcomeText, capturedAt: now })
      .where(eq(schema.followUps.id, input.followUpId))
      .returning();
  }
  if (!row) {
    [row] = await db
      .insert(schema.followUps)
      .values({
        caseId: input.caseId,
        userId: c.userId,
        scheduledFor: now,
        channel: input.channel ?? "sms",
        status: input.status ?? "captured",
        outcome: input.outcome.slice(0, 120),
        outcomeText: input.outcomeText,
        capturedAt: now,
      })
      .returning();
  }
  await db.insert(schema.caseEvents).values({ caseId: input.caseId, type: "follow_up", toValue: input.outcome, actorUserId: input.actor.userId, note: input.outcomeText });
  await audit({ action: "case.follow_up_captured", actorUserId: input.actor.userId, actorRole: input.actor.role, entityType: "case", entityId: input.caseId, after: { outcome: input.outcome, status: row.status } });
  await emitEvent({
    type: "case.followup.captured",
    aggregateType: "case",
    aggregateId: input.caseId,
    module: c.module,
    actor: { type: "worker", id: input.actor.userId },
    classification: c.safeguarding ? "restricted" : "confidential",
    payload: { outcome: input.outcome, status: row.status, followUpId: row.id },
  });
  await closeTasks(input.caseId, "follow_up", input.actor.userId);
  return row;
}

/* ------------------------------------------------------------------------------------------
 * Notes, merge and duplicates (FR-CS-07)
 * ---------------------------------------------------------------------------------------- */

export async function addCaseNote(caseId: string, actor: { userId: string; role: string }, note: string) {
  const db = await getDb();
  await db.insert(schema.caseEvents).values({ caseId, type: "note", actorUserId: actor.userId, note });
  await audit({ action: "case.note_added", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, after: { note } });
  await emitEvent({ type: "case.note.added", aggregateType: "case", aggregateId: caseId, actor: { type: "worker", id: actor.userId }, classification: "confidential", payload: { length: note.length } });
}

/**
 * Merge a duplicate into the case that keeps the history. Nothing is deleted: the duplicate
 * stays as a tombstone pointing at the survivor, and its identifiers, tasks and follow-ups
 * move across so no citizen contact is lost.
 */
export async function mergeCases(sourceId: string, targetId: string, actor: { userId: string; role: string }, reason: string) {
  if (sourceId === targetId) throw badRequest("Un cas ne peut pas être fusionné avec lui-même.");
  if (!reason || reason.trim().length < 10) throw badRequest("Un motif d'au moins 10 caractères est obligatoire pour une fusion.");
  const db = await getDb();
  const [source] = await db.select().from(schema.cases).where(eq(schema.cases.id, sourceId));
  const [target] = await db.select().from(schema.cases).where(eq(schema.cases.id, targetId));
  if (!source || !target) throw notFound();
  if (source.mergedInto) throw badRequest("Ce cas a déjà été fusionné.");
  if (target.mergedInto) throw badRequest("Le cas cible a lui-même été fusionné : choisissez le cas survivant.");

  // Identifiers preserved on the survivor.
  const targetNotes = [target.notes, `Fusion du cas ${caseRef(sourceId)} : ${reason}`].filter(Boolean).join("\n");
  await db
    .update(schema.cases)
    .set({
      notes: targetNotes,
      severityLevel: Math.max(target.severityLevel, source.severityLevel),
      severity: LEVEL_TO_SEVERITY[Math.max(target.severityLevel, source.severityLevel)],
      isNotifiable: target.isNotifiable || source.isNotifiable,
      safeguarding: target.safeguarding || source.safeguarding,
      updatedAt: new Date(),
      version: target.version + 1,
    })
    .where(eq(schema.cases.id, targetId));
  await db.update(schema.tasks).set({ caseId: targetId }).where(and(eq(schema.tasks.caseId, sourceId), inArray(schema.tasks.status, ["open", "acknowledged"])));
  await db.update(schema.followUps).set({ caseId: targetId }).where(and(eq(schema.followUps.caseId, sourceId), eq(schema.followUps.status, "scheduled")));
  await db.update(schema.schedules).set({ caseId: targetId }).where(and(eq(schema.schedules.caseId, sourceId), eq(schema.schedules.status, "scheduled")));

  const [merged] = await db
    .update(schema.cases)
    .set({ status: "duplicate", mergedInto: targetId, slaDueAt: null, slaPausedReason: null, updatedAt: new Date(), version: source.version + 1 })
    .where(and(eq(schema.cases.id, sourceId), eq(schema.cases.version, source.version)))
    .returning();
  if (!merged) throw new ApiError(409, "Le cas source a été modifié entre-temps.", "conflict");

  await db.insert(schema.caseEvents).values({ caseId: sourceId, type: "merged", fromValue: sourceId, toValue: targetId, actorUserId: actor.userId, note: reason });
  await db.insert(schema.caseEvents).values({ caseId: targetId, type: "merged_in", fromValue: sourceId, toValue: targetId, actorUserId: actor.userId, note: reason });
  await audit({ action: "case.merged", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: sourceId, before: { status: source.status }, after: { status: "duplicate", mergedInto: targetId, reason } });
  await emitEvent({ type: "case.merged", aggregateType: "case", aggregateId: sourceId, module: source.module, actor: { type: "worker", id: actor.userId }, payload: { mergedInto: targetId, reason, interactionId: source.interactionId } });
  const [after] = await db.select().from(schema.cases).where(eq(schema.cases.id, targetId));
  return { source: merged, target: after };
}

/* ------------------------------------------------------------------------------------------
 * SLA breach sweep (FR-CS-04) and blocked cases
 * ---------------------------------------------------------------------------------------- */

export interface SlaBreach {
  caseId: string;
  title: string;
  severityLevel: number;
  overdueMinutes: number;
  escalatedTo: Role;
}

/**
 * Cases whose SLA clock has run out: marked breached, escalated to the supervisor,
 * notified, and emitted as `case.sla.breached`.
 *
 * `slaBreached` is a sticky historical fact (reports count it), so idempotency comes from
 * the clock itself: escalation sets a new `slaDueAt` in the future, and the case is only
 * picked up again if that new deadline is missed too — the escalation ladder.
 */
export async function detectSlaBreaches(now = new Date()): Promise<SlaBreach[]> {
  const db = await getDb();
  const due = await db
    .select()
    .from(schema.cases)
    .where(
      and(
        inArray(schema.cases.status, ACTIVE_STATUSES),
        isNotNull(schema.cases.slaDueAt),
        lt(schema.cases.slaDueAt, now),
        isNull(schema.cases.acknowledgedAt),
      ),
    )
    .orderBy(asc(schema.cases.slaDueAt))
    .limit(500);

  const breaches: SlaBreach[] = [];
  for (const c of due) {
    const overdueMinutes = Math.round((now.getTime() - (c.slaDueAt?.getTime() ?? now.getTime())) / MINUTE);
    await db.update(schema.cases).set({ slaBreached: true, updatedAt: now }).where(eq(schema.cases.id, c.id));
    await db.insert(schema.caseEvents).values({ caseId: c.id, type: "sla_breached", fromValue: c.slaDueAt?.toISOString() ?? null, toValue: now.toISOString(), note: `Délai dépassé de ${overdueMinutes} min` });
    await audit({ action: "case.sla_breached", actorRole: "system", entityType: "case", entityId: c.id, before: { slaDueAt: c.slaDueAt }, after: { overdueMinutes, status: c.status }, systemEvent: "sla_sweep", tenantId: c.tenantId });
    await emitEvent({
      type: "case.sla.breached",
      aggregateType: "case",
      aggregateId: c.id,
      aggregateVersion: c.version,
      tenantId: c.tenantId,
      module: c.module,
      actor: { type: "system" },
      classification: c.safeguarding ? "restricted" : "confidential",
      payload: { severityLevel: c.severityLevel, overdueMinutes, queue: c.queue, assignedTo: c.assignedTo, slaDueAt: c.slaDueAt?.toISOString() ?? null },
    });

    // Escalate to the supervisor (gov_admin) and let the assignee know.
    try {
      await escalateCase(c.id, { userId: c.assignedTo ?? SYSTEM_ACTOR_ID, role: "system" }, `Délai de réponse dépassé de ${overdueMinutes} minutes`);
    } catch (err) {
      safeLog.warn("workflow", `sla escalation refused for case ${caseRef(c.id)}`, err);
    }
    // Whatever happened, the expired clock must not fire again on the next sweep.
    const [reloaded] = await db.select({ slaDueAt: schema.cases.slaDueAt }).from(schema.cases).where(eq(schema.cases.id, c.id));
    if (reloaded?.slaDueAt && reloaded.slaDueAt.getTime() <= now.getTime()) {
      await db.update(schema.cases).set({ slaDueAt: null, slaPausedReason: "délai dépassé, escalade en cours" }).where(eq(schema.cases.id, c.id));
    }
    await notifyRoleTemplate(
      "gov_admin",
      {
        key: "case.sla_breach",
        type: "alert",
        channel: "in_app",
        vars: { title: c.title, province: c.province ?? "—", dueAt: c.slaDueAt ? formatDate(c.slaDueAt) : "—", caseRef: caseRef(c.id) },
        payload: { caseId: c.id, overdueMinutes },
        requiresAck: true,
        sensitive: c.module === "health" || c.safeguarding,
        caseId: c.id,
        dedupeKey: `sla:${c.id}:${c.slaDueAt?.getTime() ?? 0}`,
      },
      c.province,
    );
    if (c.assignedTo) {
      await notifyTemplate({
        key: "case.sla_breach",
        userId: c.assignedTo,
        type: "alert",
        channel: "in_app",
        vars: { title: c.title, province: c.province ?? "—", dueAt: c.slaDueAt ? formatDate(c.slaDueAt) : "—", caseRef: caseRef(c.id) },
        payload: { caseId: c.id, overdueMinutes },
        caseId: c.id,
        dedupeKey: `sla-owner:${c.id}:${c.slaDueAt?.getTime() ?? 0}`,
      });
    }
    breaches.push({ caseId: c.id, title: c.title, severityLevel: c.severityLevel, overdueMinutes, escalatedTo: "gov_admin" });
  }
  return breaches;
}

/** Cases past their follow-up date and still open: reminders are sent, and the list returned. */
export async function detectBlockedCases(now = new Date()) {
  const db = await getDb();
  const blocked = await db
    .select()
    .from(schema.cases)
    .where(and(inArray(schema.cases.status, ACTIVE_STATUSES), lt(schema.cases.followUpDate, now)));
  for (const c of blocked) {
    const vars = { title: c.title, province: c.province ?? "—", dueAt: c.followUpDate ? formatDate(c.followUpDate) : "—", caseRef: caseRef(c.id) };
    if (c.assignedTo) {
      await notifyTemplate({
        key: "case.sla_breach",
        userId: c.assignedTo,
        type: "reminder",
        channel: "in_app",
        vars,
        payload: { caseId: c.id },
        caseId: c.id,
        dedupeKey: `blocked:${c.id}:${c.followUpDate?.toISOString().slice(0, 10)}`,
        fallbackTitle: "Cas en attente de suivi",
        fallbackBody: `Le cas « ${c.title} » n'a pas été suivi dans le délai requis.`,
      });
    } else {
      await notifyRoleTemplate(
        escalationRoleFor(c.module),
        {
          key: "case.sla_breach",
          type: "reminder",
          channel: "in_app",
          vars,
          payload: { caseId: c.id },
          caseId: c.id,
          dedupeKey: `blocked-queue:${c.id}:${c.followUpDate?.toISOString().slice(0, 10)}`,
          fallbackTitle: "Cas en attente de suivi",
          fallbackBody: `Le cas « ${c.title} » n'a pas été suivi dans le délai requis.`,
        },
        c.province,
      );
    }
    await db.insert(schema.caseEvents).values({ caseId: c.id, type: "reminder", note: `Le cas « ${c.title} » n'a pas été suivi dans le délai requis.` });
    await db.update(schema.cases).set({ followUpDate: new Date(now.getTime() + 24 * HOUR) }).where(eq(schema.cases.id, c.id));
  }
  return blocked;
}

/* ------------------------------------------------------------------------------------------
 * Queues
 * ---------------------------------------------------------------------------------------- */

export interface QueueDepth {
  queue: string;
  module: ModuleType | null;
  depth: number;
  unassigned: number;
  breached: number;
  oldestAt: Date | null;
  oldestCaseId: string | null;
  oldestAgeMinutes: number | null;
  nextDueAt: Date | null;
}

/** Queue depth and the oldest waiting item — the first screen of every operations room. */
export async function queueDepths(filter: { module?: ModuleType; province?: string } = {}, now = new Date()): Promise<QueueDepth[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.cases)
    .where(
      and(
        inArray(schema.cases.status, ACTIVE_STATUSES),
        filter.module ? eq(schema.cases.module, filter.module) : undefined,
        filter.province ? eq(schema.cases.province, filter.province) : undefined,
      ),
    )
    .orderBy(asc(schema.cases.createdAt));

  const map = new Map<string, QueueDepth>();
  for (const c of rows) {
    const key = c.queue ?? queueNameFor(c);
    let q = map.get(key);
    if (!q) {
      q = { queue: key, module: c.module, depth: 0, unassigned: 0, breached: 0, oldestAt: null, oldestCaseId: null, oldestAgeMinutes: null, nextDueAt: null };
      map.set(key, q);
    }
    q.depth++;
    if (!c.assignedTo) q.unassigned++;
    if (c.slaBreached) q.breached++;
    if (!q.oldestAt || c.createdAt < q.oldestAt) {
      q.oldestAt = c.createdAt;
      q.oldestCaseId = c.id;
      q.oldestAgeMinutes = Math.round((now.getTime() - c.createdAt.getTime()) / MINUTE);
    }
    if (c.slaDueAt && (!q.nextDueAt || c.slaDueAt < q.nextDueAt)) q.nextDueAt = c.slaDueAt;
  }
  return [...map.values()].sort((a, b) => b.depth - a.depth);
}

/** Tasks waiting in a queue or for a person. */
export async function listTasks(filter: { ownerUserId?: string; queue?: string; caseId?: string; status?: string; limit?: number } = {}) {
  const db = await getDb();
  return db
    .select()
    .from(schema.tasks)
    .where(
      and(
        filter.ownerUserId ? eq(schema.tasks.ownerUserId, filter.ownerUserId) : undefined,
        filter.queue ? eq(schema.tasks.queue, filter.queue) : undefined,
        filter.caseId ? eq(schema.tasks.caseId, filter.caseId) : undefined,
        filter.status ? eq(schema.tasks.status, filter.status) : inArray(schema.tasks.status, ["open", "acknowledged"]),
      ),
    )
    .orderBy(asc(schema.tasks.dueAt), desc(schema.tasks.createdAt))
    .limit(filter.limit ?? 100);
}

function formatDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
