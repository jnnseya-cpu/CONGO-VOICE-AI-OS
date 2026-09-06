import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import {
  ACTIVE_STATUSES,
  SLA_MS,
  acknowledgeCase,
  assignCase,
  autoAssignCase,
  canTransition,
  captureFollowUp,
  detectSlaBreaches,
  mergeCases,
  openCase,
  overrideSeverity,
  permittedTransitions,
  queueDepths,
  routeCase,
  shouldAutoCreateCase,
  slaDueFor,
  transitionCase,
} from "@/lib/ai/agents/workflow";
import type { ModuleType, Severity } from "@/lib/db/schema";

const SUPERVISOR = { userId: "", role: "gov_admin" };

async function makeInteraction(module: ModuleType = "health") {
  const db = await getDb();
  const [i] = await db.insert(schema.interactions).values({ module, channel: "text", status: "completed", originalInput: "test" }).returning();
  return i.id;
}

async function makeCase(overrides: Partial<Parameters<typeof openCase>[0]> = {}) {
  const interactionId = await makeInteraction(overrides.module ?? "health");
  return openCase({
    module: "health",
    interactionId,
    title: "Enfant fébrile depuis deux jours",
    severity: "medium" as Severity,
    province: "Kinshasa",
    territory: "Kimbanseke",
    autoAssign: false,
    ...overrides,
  });
}

describe("case state machine", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    const [supervisor] = await db
      .insert(schema.users)
      .values({ name: "Superviseur", role: "gov_admin", province: "Kinshasa", phone: "+243900001000" })
      .returning();
    SUPERVISOR.userId = supervisor.id;
  });

  it("decides deterministically when an interaction must become a case (FR-CS-01)", () => {
    expect(shouldAutoCreateCase({ severityLevel: 2 }).create).toBe(true);
    expect(shouldAutoCreateCase({ severityLevel: 1 }).create).toBe(false);
    expect(shouldAutoCreateCase({ severityLevel: 0, confidence: 0.39 }).create).toBe(true);
    expect(shouldAutoCreateCase({ severityLevel: 0, confidence: 0.41 }).create).toBe(false);
    expect(shouldAutoCreateCase({ severityLevel: 1, isNotifiable: true }).reasons).toContain("notifiable_disease");
    expect(shouldAutoCreateCase({ severityLevel: 0, humanRequested: true }).reasons).toContain("human_requested");
  });

  it("opens an emergency case with a 15-minute clock and an acknowledgement task (FR-CS-03)", async () => {
    const db = await getDb();
    const c = await makeCase({ severity: "critical", title: "Convulsions chez un enfant" });
    expect(c.status).toBe("open_emergency");
    expect(c.severityLevel).toBe(4);
    expect(c.queue).toBe("chw:Kinshasa:Kimbanseke");
    const remaining = (c.slaDueAt as Date).getTime() - c.createdAt.getTime();
    expect(remaining).toBeGreaterThan(14 * 60_000);
    expect(remaining).toBeLessThanOrEqual(16 * 60_000);
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.caseId, c.id));
    expect(tasks.map((t) => t.type)).toContain("acknowledge");
  });

  it("applies the SLA table for every severity level", () => {
    expect(SLA_MS[4]).toBe(15 * 60_000);
    expect(SLA_MS[3]).toBe(4 * 3600_000);
    expect(SLA_MS[2]).toBe(24 * 3600_000);
    expect(slaDueFor(0)).toBeNull();
  });

  it("refuses a transition that is not in the permitted table", async () => {
    const c = await makeCase();
    expect(canTransition("open", "closed")).toBe(false);
    await expect(transitionCase(c.id, "closed", SUPERVISOR)).rejects.toThrow(/non autorisée/);
    expect(permittedTransitions("closed")).toHaveLength(0);
    expect(permittedTransitions("open").map((s) => s.to)).toContain("assigned");
  });

  it("requires a written reason for cancellation and reassignment", async () => {
    const c = await makeCase();
    await expect(transitionCase(c.id, "cancelled", SUPERVISOR, "erreur")).rejects.toThrow(/10 caractères/);
    const cancelled = await transitionCase(c.id, "cancelled", SUPERVISOR, "Doublon signalé par le centre de santé");
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.slaDueAt).toBeNull();
  });

  it("stops the clock on acknowledgement and pauses it while waiting for the citizen", async () => {
    const c = await makeCase({ severity: "high" });
    const assigned = await assignCase(c.id, SUPERVISOR.userId, SUPERVISOR);
    expect(assigned?.status).toBe("assigned");
    expect(assigned?.slaDueAt).not.toBeNull();

    const acked = await acknowledgeCase(c.id, SUPERVISOR);
    expect(acked?.status).toBe("acknowledged");
    expect(acked?.acknowledgedAt).not.toBeNull();
    expect(acked?.slaDueAt).toBeNull();

    const waiting = await transitionCase(c.id, "needs_follow_up", SUPERVISOR, "Citoyen injoignable");
    expect(waiting?.slaPausedReason).toBeTruthy();
    const resumed = await transitionCase(c.id, "in_progress", SUPERVISOR);
    expect(resumed?.slaDueAt).not.toBeNull();
    expect(resumed?.slaPausedReason).toBeNull();
  });

  it("refuses closure without outcome, action taken, reachability and follow-up decision (CAS-006)", async () => {
    const c = await makeCase();
    await transitionCase(c.id, "resolved", SUPERVISOR, "Enfant orienté au centre de santé");
    await expect(transitionCase(c.id, "closed", SUPERVISOR)).rejects.toThrow(/Clôture incomplète/);
    const closed = await transitionCase(c.id, "closed", SUPERVISOR, undefined, {
      outcome: "referred",
      actionTaken: "Orientation vers le CS Mokali et conseils de réhydratation",
      citizenReachability: "reached",
      followUpDecision: "follow_up_scheduled",
    });
    expect(closed?.status).toBe("closed");
    expect(closed?.closedAt).not.toBeNull();
    expect(permittedTransitions("closed")).toHaveLength(0);
  });

  it("escalates to the supervisor level and raises the severity floor", async () => {
    const { escalateCase } = await import("@/lib/ai/agents/workflow");
    const c = await makeCase({ severity: "medium" });
    const first = await escalateCase(c.id, SUPERVISOR, "Aucune amélioration après 24 h");
    expect(first?.status).toBe("escalated");
    expect(first?.escalationLevel).toBe(1);
    const second = await escalateCase(c.id, SUPERVISOR, "Toujours aucune prise en charge");
    expect(second?.status).toBe("escalated_up");
    expect(second?.severityLevel).toBe(4);
  });

  it("assigns atomically: a stale version loses (CAS-002)", async () => {
    const c = await makeCase();
    await expect(assignCase(c.id, SUPERVISOR.userId, SUPERVISOR, { expectedVersion: c.version + 99 })).rejects.toThrow(/modifié entre-temps/);
    const ok = await assignCase(c.id, SUPERVISOR.userId, SUPERVISOR, { expectedVersion: c.version });
    expect(ok?.assignedTo).toBe(SUPERVISOR.userId);
    expect(ok?.version).toBe(c.version + 1);
  });

  it("lets exactly one of two concurrent assignments win", async () => {
    const db = await getDb();
    const [a] = await db.insert(schema.users).values({ name: "Agent A", role: "chw", province: "Kinshasa", phone: "+243900001001" }).returning();
    const [b] = await db.insert(schema.users).values({ name: "Agent B", role: "chw", province: "Kinshasa", phone: "+243900001002" }).returning();
    const c = await makeCase();
    const results = await Promise.allSettled([
      assignCase(c.id, a.id, SUPERVISOR, { expectedVersion: c.version }),
      assignCase(c.id, b.id, SUPERVISOR, { expectedVersion: c.version }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [after] = await db.select().from(schema.cases).where(eq(schema.cases.id, c.id));
    expect([a.id, b.id]).toContain(after.assignedTo);
  });

  it("routes territory → organisation → province → role, on duty first, least loaded", async () => {
    const db = await getDb();
    resetRouting: {
      await db.update(schema.users).set({ onDuty: false }).where(eq(schema.users.role, "chw"));
      break resetRouting;
    }
    const [local] = await db
      .insert(schema.users)
      .values({ name: "Agent territorial", role: "chw", province: "Kinshasa", territory: "Kimbanseke", territories: ["Kimbanseke"], onDuty: true, phone: "+243900001003" })
      .returning();
    const c = await makeCase({ territory: "Kimbanseke" });
    const candidate = await routeCase(c);
    expect(candidate?.userId).toBe(local.id);
    expect(candidate?.matchedOn).toBe("territory");

    const assigned = await autoAssignCase(c.id, { role: "system" });
    expect(assigned?.assignedTo).toBe(local.id);
    const tasks = await db.select().from(schema.tasks).where(and(eq(schema.tasks.caseId, c.id), eq(schema.tasks.type, "acknowledge")));
    expect(tasks[0].ownerUserId).toBe(local.id);
  });

  it("detects an SLA breach, escalates it and emits case.sla.breached (FR-CS-04)", async () => {
    const db = await getDb();
    const c = await makeCase({ severity: "critical", title: "Hémorragie signalée" });
    await db.update(schema.cases).set({ slaDueAt: new Date(Date.now() - 60_000) }).where(eq(schema.cases.id, c.id));

    const breaches = await detectSlaBreaches();
    expect(breaches.some((b) => b.caseId === c.id)).toBe(true);

    const [after] = await db.select().from(schema.cases).where(eq(schema.cases.id, c.id));
    expect(after.slaBreached).toBe(true);
    expect(["escalated", "escalated_up"]).toContain(after.status);

    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.aggregateId, c.id));
    expect(events.map((e) => e.eventType)).toContain("case.sla.breached");

    const notifications = await db.select().from(schema.notifications);
    expect(notifications.some((n) => n.templateKey === "case.sla_breach")).toBe(true);

    // Idempotent: escalation restarted the clock, so a second sweep does not re-breach it.
    const again = await detectSlaBreaches();
    expect(again.some((b) => b.caseId === c.id)).toBe(false);
  });

  it("requires a ten-character reason to overrule the model severity (FR-CS-05)", async () => {
    const db = await getDb();
    const c = await makeCase({ severity: "medium" });
    await expect(overrideSeverity(c.id, SUPERVISOR, { severityLevel: 4, reason: "grave" })).rejects.toThrow(/au moins 10 caractères/);

    const { case: after, override } = await overrideSeverity(c.id, SUPERVISOR, {
      severityLevel: 4,
      reason: "Signes de danger confirmés par l'agent lors de la visite",
      reasonCode: "clinical_judgement",
    });
    expect(after.severityLevel).toBe(4);
    expect(after.severity).toBe("critical");
    expect(after.aiSeverityLevel).toBe(2);
    expect(override.field).toBe("severity_level");

    const rows = await db.select().from(schema.aiOverrides).where(eq(schema.aiOverrides.caseId, c.id));
    expect(rows).toHaveLength(1);
    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.aggregateId, c.id));
    expect(events.map((e) => e.eventType)).toContain("ai.override.recorded");
  });

  it("merges a duplicate while preserving identifiers and moving open work (FR-CS-07)", async () => {
    const db = await getDb();
    const survivor = await makeCase({ title: "Cas de référence" });
    const duplicate = await makeCase({ title: "Même cas signalé deux fois" });
    await expect(mergeCases(duplicate.id, survivor.id, SUPERVISOR, "court")).rejects.toThrow(/10 caractères/);

    const { source, target } = await mergeCases(duplicate.id, survivor.id, SUPERVISOR, "Même enfant signalé deux fois par le même agent");
    expect(source.status).toBe("duplicate");
    expect(source.mergedInto).toBe(survivor.id);
    expect(source.interactionId).toBeTruthy(); // identifiers preserved on the tombstone
    expect(target.notes).toContain("Fusion du cas");

    const movedTasks = await db.select().from(schema.tasks).where(eq(schema.tasks.caseId, survivor.id));
    expect(movedTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("captures a citizen follow-up against the case", async () => {
    const db = await getDb();
    const c = await makeCase();
    const followUp = await captureFollowUp({ caseId: c.id, outcome: "went_to_clinic", outcomeText: "Consultation faite au CS Mokali", actor: SUPERVISOR });
    expect(followUp.status).toBe("captured");
    const events = await db.select().from(schema.caseEvents).where(and(eq(schema.caseEvents.caseId, c.id), eq(schema.caseEvents.type, "follow_up")));
    expect(events).toHaveLength(1);
  });

  it("reports queue depth and the oldest waiting item", async () => {
    const queues = await queueDepths();
    expect(queues.length).toBeGreaterThan(0);
    const kin = queues.find((q) => q.queue === "chw:Kinshasa:Kimbanseke");
    expect(kin?.depth).toBeGreaterThan(0);
    expect(kin?.oldestCaseId).toBeTruthy();
    expect(kin?.oldestAgeMinutes).not.toBeNull();
    expect(ACTIVE_STATUSES).toContain("needs_follow_up");
  });
});
