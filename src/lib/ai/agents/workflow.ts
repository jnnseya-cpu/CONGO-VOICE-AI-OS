/**
 * Workflow Agent — moves cases through stages, assigns follow-ups, triggers reminders,
 * and detects blocked cases. Every transition is recorded as a case event and audited.
 */
import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { CaseStatus, ModuleType, Severity } from "@/lib/db/schema";
import { audit } from "@/lib/core/audit";
import { notify, notifyRole } from "@/lib/core/notifications";
import { escalationRoleFor } from "@/lib/core/rbac";

const FOLLOW_UP_HOURS: Record<Severity, number> = { critical: 2, high: 24, medium: 72, low: 168 };

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
}

export async function openCase(input: OpenCaseInput) {
  const db = await getDb();
  const followUpDate = new Date(Date.now() + FOLLOW_UP_HOURS[input.severity] * 3600 * 1000);
  const [c] = await db
    .insert(schema.cases)
    .values({
      module: input.module,
      userId: input.userId ?? null,
      interactionId: input.interactionId,
      title: input.title.slice(0, 240),
      severity: input.severity,
      status: input.escalate ? "escalated" : "open",
      escalationLevel: input.escalate ? 1 : 0,
      province: input.province ?? null,
      notes: input.notes,
      followUpDate,
    })
    .returning();
  await db.insert(schema.caseEvents).values({ caseId: c.id, type: "created", toValue: c.status, note: input.notes });
  await audit({ action: "case.created", entityType: "case", entityId: c.id, after: { severity: c.severity, status: c.status }, systemEvent: "workflow_agent" });

  if (input.escalate) {
    await db.insert(schema.caseEvents).values({ caseId: c.id, type: "escalated", fromValue: "0", toValue: "1", note: input.escalationReason ?? undefined });
    const role = escalationRoleFor(input.module);
    const label = input.module === "health" ? "Cas de santé" : input.module === "agriculture" ? "Signalement agricole" : "Cas éducation";
    await notifyRole(
      role,
      {
        type: "escalation",
        title: `${label} ${input.severity === "critical" ? "critique" : "prioritaire"} à examiner`,
        body: `${input.title}${input.province ? ` — ${input.province}` : ""}. ${input.escalationReason ?? ""}`.trim(),
        payload: { caseId: c.id, module: input.module, severity: input.severity },
      },
      input.province,
    );
    if (input.severity === "critical") {
      await notify({ channel: "email", type: "alert", title: `Cas critique ${input.module}`, body: `${input.title} (${input.province ?? "province inconnue"})`, payload: { caseId: c.id } });
    }
  }
  return c;
}

export async function transitionCase(caseId: string, to: CaseStatus, actor: { userId: string; role: string }, note?: string) {
  const db = await getDb();
  const [before] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!before) return null;
  const [after] = await db
    .update(schema.cases)
    .set({ status: to, updatedAt: new Date(), resolution: to === "resolved" || to === "closed" ? (note ?? before.resolution) : before.resolution })
    .where(eq(schema.cases.id, caseId))
    .returning();
  await db.insert(schema.caseEvents).values({ caseId, type: "status_changed", fromValue: before.status, toValue: to, actorUserId: actor.userId, note });
  await audit({ action: "case.status_changed", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, before: { status: before.status }, after: { status: to } });
  return after;
}

export async function escalateCase(caseId: string, actor: { userId: string; role: string }, reason?: string) {
  const db = await getDb();
  const [before] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
  if (!before) return null;
  const level = before.escalationLevel + 1;
  const [after] = await db
    .update(schema.cases)
    .set({ status: "escalated", escalationLevel: level, severity: level >= 2 ? "critical" : before.severity === "low" ? "medium" : before.severity, updatedAt: new Date() })
    .where(eq(schema.cases.id, caseId))
    .returning();
  await db.insert(schema.caseEvents).values({ caseId, type: "escalated", fromValue: String(before.escalationLevel), toValue: String(level), actorUserId: actor.userId, note: reason });
  await audit({ action: "case.escalated", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, before: { level: before.escalationLevel }, after: { level } });
  const role = level >= 2 ? "gov_admin" : escalationRoleFor(before.module);
  await notifyRole(role, { type: "escalation", title: `Escalade niveau ${level} — ${before.title}`, body: reason ?? "Ce cas requiert une revue urgente.", payload: { caseId } }, before.province);
  return after;
}

export async function assignCase(caseId: string, assigneeId: string, actor: { userId: string; role: string }) {
  const db = await getDb();
  const [after] = await db
    .update(schema.cases)
    .set({ assignedTo: assigneeId, status: "assigned", updatedAt: new Date() })
    .where(eq(schema.cases.id, caseId))
    .returning();
  if (!after) return null;
  await db.insert(schema.caseEvents).values({ caseId, type: "assigned", toValue: assigneeId, actorUserId: actor.userId });
  await audit({ action: "case.assigned", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, after: { assignedTo: assigneeId } });
  await notify({ userId: assigneeId, type: "follow_up", title: "Nouveau cas assigné", body: after.title, payload: { caseId } });
  return after;
}

export async function addCaseNote(caseId: string, actor: { userId: string; role: string }, note: string) {
  const db = await getDb();
  await db.insert(schema.caseEvents).values({ caseId, type: "note", actorUserId: actor.userId, note });
  await audit({ action: "case.note_added", actorUserId: actor.userId, actorRole: actor.role, entityType: "case", entityId: caseId, after: { note } });
}

/** Cases past their follow-up date and still open: reminders are sent, and the list returned for dashboards. */
export async function detectBlockedCases(now = new Date()) {
  const db = await getDb();
  const blocked = await db
    .select()
    .from(schema.cases)
    .where(and(inArray(schema.cases.status, ["open", "assigned", "in_progress", "escalated"]), lt(schema.cases.followUpDate, now)));
  for (const c of blocked) {
    const target = c.assignedTo ?? null;
    const body = `Le cas « ${c.title} » n'a pas été suivi dans le délai requis (${c.severity}).`;
    if (target) await notify({ userId: target, type: "reminder", title: "Cas en attente de suivi", body, payload: { caseId: c.id } });
    else await notifyRole(escalationRoleFor(c.module), { type: "reminder", title: "Cas en attente de suivi", body, payload: { caseId: c.id } }, c.province);
    await db.insert(schema.caseEvents).values({ caseId: c.id, type: "reminder", note: body });
    await db.update(schema.cases).set({ followUpDate: new Date(now.getTime() + 24 * 3600 * 1000) }).where(eq(schema.cases.id, c.id));
  }
  return blocked;
}
