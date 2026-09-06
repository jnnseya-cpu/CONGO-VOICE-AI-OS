/**
 * Route smoke tests: every operations endpoint is exercised through its real handler,
 * with a real session, so the RBAC wrapper, the Zod bodies and the status codes are all
 * covered end to end.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { encodeSession } from "@/lib/core/auth";
import { seedReferenceData } from "@/lib/db/reference";
import { openCase } from "@/lib/ai/agents/workflow";
import { generateSecret, totp } from "@/lib/core/mfa";
import type { Role } from "@/lib/db/schema";

const BASE = "http://localhost:3000";
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

function req(method: string, path: string, opts: { body?: unknown; as?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.as) headers.set("authorization", `Bearer ${tokens[opts.as]}`);
  return new NextRequest(`${BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

async function makeUser(role: Role, phone: string, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ role, phone, languagePreference: "fr", province: "Kinshasa", ...extra }).returning();
  tokens[role] = encodeSession({ userId: u.id, role, language: "fr", province: "Kinshasa", anonymous: false });
  ids[role] = u.id;
  return u;
}

describe("operations routes", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await seedReferenceData();
    await makeUser("platform_admin", "+243860000001");
    await makeUser("gov_admin", "+243860000002");
    await makeUser("chw", "+243860000003", { territory: "Kimbanseke", territories: ["Kimbanseke"], onDuty: true });
    await makeUser("citizen", "+243860000004");
    const [interaction] = await db.insert(schema.interactions).values({ module: "health", status: "completed", originalInput: "test" }).returning();
    const c = await openCase({ module: "health", interactionId: interaction.id, title: "Cas de test", severity: "high", province: "Kinshasa", territory: "Kimbanseke", autoAssign: false });
    ids.case = c.id;
  });

  it("rejects an unauthenticated call and one without the permission", async () => {
    const { GET } = await import("@/app/api/v1/queues/route");
    expect((await GET(req("GET", "/api/v1/queues"))).status).toBe(401);
    expect((await GET(req("GET", "/api/v1/queues", { as: "citizen" }))).status).toBe(403);
    expect((await GET(req("GET", "/api/v1/queues", { as: "chw" }))).status).toBe(200);
  });

  it("returns the queue board", async () => {
    const { GET } = await import("@/app/api/v1/queues/route");
    const body = await json(await GET(req("GET", "/api/v1/queues", { as: "gov_admin" })));
    const queues = body.queues as Array<{ queue: string; depth: number }>;
    expect(queues.some((q) => q.queue === "chw:Kinshasa:Kimbanseke")).toBe(true);
    expect((body.totals as { depth: number }).depth).toBeGreaterThan(0);
  });

  it("lists permitted transitions and performs one", async () => {
    const { GET, POST } = await import("@/app/api/v1/cases/[id]/transitions/route");
    const listed = await json(await GET(req("GET", `/api/v1/cases/${ids.case}/transitions`, { as: "gov_admin" }), params({ id: ids.case })));
    expect((listed.permitted as Array<{ to: string }>).map((p) => p.to)).toContain("assigned");

    const bad = await POST(req("POST", `/api/v1/cases/${ids.case}/transitions`, { as: "gov_admin", body: { to: "closed" } }), params({ id: ids.case }));
    expect(bad.status).toBe(400);

    const ok = await POST(req("POST", `/api/v1/cases/${ids.case}/transitions`, { as: "gov_admin", body: { to: "in_progress" } }), params({ id: ids.case }));
    expect(ok.status).toBe(200);
  });

  it("assigns through the routing suggestion and acknowledges", async () => {
    const assignments = await import("@/app/api/v1/cases/[id]/assignments/route");
    const suggestion = await json(await assignments.GET(req("GET", `/api/v1/cases/${ids.case}/assignments`, { as: "gov_admin" }), params({ id: ids.case })));
    expect((suggestion.suggestion as { userId: string }).userId).toBe(ids.chw);

    const assigned = await json(await assignments.POST(req("POST", `/api/v1/cases/${ids.case}/assignments`, { as: "gov_admin", body: { auto: true } }), params({ id: ids.case })));
    expect((assigned.case as { assignedTo: string }).assignedTo).toBe(ids.chw);

    const { POST: ack } = await import("@/app/api/v1/cases/[id]/acknowledge/route");
    const acked = await json(await ack(req("POST", `/api/v1/cases/${ids.case}/acknowledge`, { as: "chw", body: { note: "Pris en charge" } }), params({ id: ids.case })));
    expect((acked.case as { acknowledgedAt: string | null }).acknowledgedAt).not.toBeNull();
  });

  it("refuses a severity override without a second factor, then accepts it", async () => {
    const db = await getDb();
    const { POST } = await import("@/app/api/v1/cases/[id]/risk-overrides/route");
    const body = { severityLevel: 4, reason: "Signes de danger confirmés lors de la visite à domicile" };

    const blocked = await POST(req("POST", `/api/v1/cases/${ids.case}/risk-overrides`, { as: "gov_admin", body }), params({ id: ids.case }));
    expect(blocked.status).toBe(403);

    const secret = generateSecret();
    await db.update(schema.users).set({ mfaSecret: secret, mfaEnabled: false }).where(eq(schema.users.id, ids.gov_admin));
    const { POST: verify } = await import("@/app/api/v1/auth/mfa/verify/route");
    expect((await verify(req("POST", "/api/v1/auth/mfa/verify", { as: "gov_admin", body: { code: totp(secret) } }))).status).toBe(200);

    const allowed = await POST(req("POST", `/api/v1/cases/${ids.case}/risk-overrides`, { as: "gov_admin", body }), params({ id: ids.case }));
    expect(allowed.status).toBe(200);
    const payload = await json(allowed);
    expect((payload.case as { severityLevel: number }).severityLevel).toBe(4);

    // A worker who is not required to enrol is not blocked by the step-up.
    const short = await POST(req("POST", `/api/v1/cases/${ids.case}/risk-overrides`, { as: "chw", body: { severityLevel: 3, reason: "court" } }), params({ id: ids.case }));
    expect(short.status).toBe(400);
  });

  it("enrols MFA and reports its status", async () => {
    const setup = await import("@/app/api/v1/auth/mfa/setup/route");
    const enrol = await json(await setup.POST(req("POST", "/api/v1/auth/mfa/setup", { as: "platform_admin" })));
    expect(enrol.secret).toBeTruthy();
    expect(enrol.otpauthUri).toContain("otpauth://totp/");
    const { POST: verify } = await import("@/app/api/v1/auth/mfa/verify/route");
    expect((await verify(req("POST", "/api/v1/auth/mfa/verify", { as: "platform_admin", body: { code: "000000" } }))).status).toBe(401);
    const status = await json(await setup.GET(req("GET", "/api/v1/auth/mfa/setup", { as: "platform_admin" })));
    expect(status.required).toBe(true);
  });

  it("records consent, subscribes to reminders and unsubscribes", async () => {
    const consents = await import("@/app/api/v1/consents/route");
    const reminders = await import("@/app/api/v1/reminders/route");

    // No consent yet: the subscription is refused.
    const refused = await reminders.POST(req("POST", "/api/v1/reminders", { as: "citizen", body: { kind: "vaccination", dateOfBirth: new Date().toISOString() } }));
    expect(refused.status).toBe(400);

    const granted = await consents.POST(req("POST", "/api/v1/consents", { as: "citizen", body: { purpose: "reminders", status: "granted", method: "voice" } }));
    expect(granted.status).toBe(200);

    const subscribed = await json(await reminders.POST(req("POST", "/api/v1/reminders", { as: "citizen", body: { kind: "vaccination", dateOfBirth: new Date().toISOString(), childLabel: "Votre enfant" } })));
    expect(subscribed.scheduled).toBeGreaterThan(0);

    const listed = await json(await reminders.GET(req("GET", "/api/v1/reminders", { as: "citizen" })));
    expect(listed.optedIn).toBe(true);
    expect((listed.upcoming as unknown[]).length).toBeGreaterThan(0);

    // Revoking the purpose cancels everything already scheduled.
    const revoked = await json(await consents.POST(req("POST", "/api/v1/consents", { as: "citizen", body: { purpose: "reminders", status: "revoked", method: "ussd" } })));
    expect(revoked.cancelledReminders).toBeGreaterThan(0);
    const afterRevoke = await json(await reminders.GET(req("GET", "/api/v1/reminders", { as: "citizen" })));
    expect(afterRevoke.optedIn).toBe(false);
    expect(afterRevoke.upcoming).toHaveLength(0);
  });

  it("estimates a broadcast audience before approving it", async () => {
    const { GET, POST } = await import("@/app/api/v1/notifications/broadcast/route");
    const estimate = await json(await GET(req("GET", "/api/v1/notifications/broadcast?role=citizen&province=Kinshasa", { as: "gov_admin" })));
    expect((estimate.estimate as { total: number }).total).toBeGreaterThanOrEqual(1);

    const dryRun = await json(await POST(req("POST", "/api/v1/notifications/broadcast", { as: "gov_admin", body: { role: "chw", title: "Formation", body: "Session de formation lundi." } })));
    expect(dryRun.approved).toBe(false);

    const sent = await json(await POST(req("POST", "/api/v1/notifications/broadcast", { as: "gov_admin", body: { role: "chw", title: "Formation", body: "Session de formation lundi.", approve: true, dedupeKey: "training-1" } })));
    expect(sent.approved).toBe(true);
    expect(sent.recipients).toBeGreaterThanOrEqual(1);
  });

  it("acknowledges an alert through its endpoint", async () => {
    const db = await getDb();
    const [alert] = await db
      .insert(schema.notifications)
      .values({ userId: ids.chw, channel: "in_app", type: "alert", title: "Alerte", body: "Corps", status: "sent", sentAt: new Date(), payload: { requiresAck: true } })
      .returning();
    const { POST } = await import("@/app/api/v1/notifications/[id]/ack/route");
    const body = await json(await POST(req("POST", `/api/v1/notifications/${alert.id}/ack`, { as: "chw" }), params({ id: alert.id })));
    expect((body.notification as { acknowledgedAt: string | null }).acknowledgedAt).not.toBeNull();
  });

  it("creates, runs and downloads a report job, and refuses an expired link", async () => {
    const db = await getDb();
    const jobs = await import("@/app/api/v1/report-jobs/route");
    const created = await jobs.POST(req("POST", "/api/v1/report-jobs", { as: "gov_admin", body: { type: "daily_usage", format: "csv", wait: true } }));
    expect(created.status).toBe(202);
    const { reportId } = (await created.json()) as { reportId: string };

    const status = await import("@/app/api/v1/report-jobs/[id]/route");
    const state = await json(await status.GET(req("GET", `/api/v1/report-jobs/${reportId}`, { as: "gov_admin" }), params({ id: reportId })));
    expect((state.report as { status: string }).status).toBe("ready");
    expect((state.report as { downloadUrl: string }).downloadUrl).toContain(reportId);

    const download = await import("@/app/api/v1/report-jobs/[id]/download/route");
    const file = await download.GET(req("GET", `/api/v1/report-jobs/${reportId}/download`, { as: "gov_admin" }), params({ id: reportId }));
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toContain("text/csv");
    expect(file.headers.get("content-disposition")).toContain("attachment");

    await db.update(schema.reports).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.reports.id, reportId));
    const gone = await download.GET(req("GET", `/api/v1/report-jobs/${reportId}/download`, { as: "gov_admin" }), params({ id: reportId }));
    expect(gone.status).toBe(410);
  });

  it("manages report definitions", async () => {
    const list = await import("@/app/api/v1/report-definitions/route");
    const created = await json(await list.POST(req("POST", "/api/v1/report-definitions", { as: "gov_admin", body: { name: "Usage quotidien", type: "daily_usage", format: "csv", cadence: "daily", recipients: [ids.gov_admin] } })));
    const definitionId = (created.definition as { id: string }).id;

    const one = await import("@/app/api/v1/report-definitions/[id]/route");
    const run = await json(await one.PATCH(req("PATCH", `/api/v1/report-definitions/${definitionId}`, { as: "gov_admin", body: { runNow: true } }), params({ id: definitionId })));
    expect((run.report as { status: string }).status).toBe("ready");

    const disabled = await json(await one.DELETE(req("DELETE", `/api/v1/report-definitions/${definitionId}`, { as: "gov_admin" }), params({ id: definitionId })));
    expect((disabled.definition as { enabled: boolean }).enabled).toBe(false);
  });

  it("reports ACU consumption with the cost per interaction", async () => {
    const db = await getDb();
    await db.insert(schema.acuLedger).values({ task: "llm", providerKey: "mock", units: 1000, acu: 1, module: "health", language: "fr" });
    const { GET } = await import("@/app/api/v1/metering/acu/route");
    const body = await json(await GET(req("GET", "/api/v1/metering/acu?scope=platform", { as: "gov_admin" })));
    expect(body.totalAcu).toBeGreaterThan(0);
    expect(body.costPerInteractionUsd).toBeGreaterThanOrEqual(0);
    expect(body.degradedMode).toBe(false);
    expect((body.conversion as { sttPerMinute: number }).sttPerMinute).toBe(0.5);
  });

  it("manages tenants, organisations and templates", async () => {
    const tenants = await import("@/app/api/v1/admin/tenants/route");
    const tenant = await json(await tenants.POST(req("POST", "/api/v1/admin/tenants", { as: "platform_admin", body: { name: "Programme test", type: "programme", acuMonthlyCap: 500 } })));
    const tenantId = (tenant.tenant as { id: string }).id;

    const orgs = await import("@/app/api/v1/admin/organisations/route");
    const org = await json(await orgs.POST(req("POST", "/api/v1/admin/organisations", { as: "platform_admin", body: { tenantId, name: "Zone de santé test", type: "clinic_network", provinceScope: ["Kinshasa"] } })));
    expect((org.organisation as { tenantId: string }).tenantId).toBe(tenantId);

    const templates = await import("@/app/api/v1/admin/templates/route");
    const catalogue = await json(await templates.GET(req("GET", "/api/v1/admin/templates?key=case.assigned", { as: "platform_admin" })));
    expect((catalogue.templates as unknown[]).length).toBe(5);
    const preview = await json(await templates.GET(req("GET", "/api/v1/admin/templates?preview=case.assigned&language=ln&vars=%7B%22title%22%3A%22X%22%7D", { as: "platform_admin" })));
    expect((preview.preview as { language: string }).language).toBe("ln");
  });

  it("opens a time-boxed break-glass grant with an alert", async () => {
    const db = await getDb();
    const { GET, POST } = await import("@/app/api/v1/admin/break-glass/route");
    const secret = generateSecret();
    await db.update(schema.users).set({ mfaSecret: secret, mfaEnabled: false }).where(eq(schema.users.id, ids.platform_admin));
    const { POST: verify } = await import("@/app/api/v1/auth/mfa/verify/route");
    await verify(req("POST", "/api/v1/auth/mfa/verify", { as: "platform_admin", body: { code: totp(secret) } }));

    const short = await POST(req("POST", "/api/v1/admin/break-glass", { as: "platform_admin", body: { scope: "cases:Kinshasa", justification: "trop court", minutes: 30 } }));
    expect(short.status).toBe(400);

    const opened = await json(
      await POST(req("POST", "/api/v1/admin/break-glass", { as: "platform_admin", body: { scope: "cases:Kinshasa", justification: "Enquête sur un incident de sécurité signalé par la zone de santé", minutes: 30 } })),
    );
    const grantId = (opened.grant as { id: string }).id;
    expect(new Date(opened.expiresAt as string).getTime()).toBeGreaterThan(Date.now());

    const listed = await json(await GET(req("GET", "/api/v1/admin/break-glass", { as: "platform_admin" })));
    expect((listed.grants as unknown[]).length).toBe(1);

    const revoked = await json(await POST(req("POST", "/api/v1/admin/break-glass", { as: "platform_admin", body: { scope: "cases:Kinshasa", justification: "Fin de l'enquête, accès révoqué immédiatement", revokeId: grantId } })));
    expect((revoked.grant as { revokedAt: string | null }).revokedAt).not.toBeNull();

    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityType, "break_glass"));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["admin.break_glass_opened", "admin.break_glass_revoked"]));
  });

  it("opens and processes a data request", async () => {
    const list = await import("@/app/api/v1/data-requests/route");
    const created = await json(await list.POST(req("POST", "/api/v1/data-requests", { as: "citizen", body: { type: "access", method: "voice" } })));
    const requestId = (created.request as { id: string }).id;
    expect(created.slaDays).toBe(30);

    const one = await import("@/app/api/v1/data-requests/[id]/route");
    const held = await json(await one.PATCH(req("PATCH", `/api/v1/data-requests/${requestId}`, { as: "platform_admin", body: { action: "hold", reason: "Procédure judiciaire en cours" } }), params({ id: requestId })));
    expect((held.request as { legalHold: boolean }).legalHold).toBe(true);

    await one.PATCH(req("PATCH", `/api/v1/data-requests/${requestId}`, { as: "platform_admin", body: { action: "release_hold" } }), params({ id: requestId }));
    const done = await json(await one.PATCH(req("PATCH", `/api/v1/data-requests/${requestId}`, { as: "platform_admin", body: { action: "process" } }), params({ id: requestId })));
    expect((done.request as { status: string }).status).toBe("completed");
  });

  it("creates and completes a task", async () => {
    const list = await import("@/app/api/v1/tasks/route");
    const created = await json(await list.POST(req("POST", "/api/v1/tasks", { as: "chw", body: { caseId: ids.case, type: "call_citizen", priority: "high" } })));
    const taskId = (created.task as { id: string }).id;

    const mine = await json(await list.GET(req("GET", "/api/v1/tasks?caseId=" + ids.case, { as: "chw" })));
    expect((mine.tasks as unknown[]).length).toBeGreaterThan(0);

    const one = await import("@/app/api/v1/tasks/[id]/route");
    await one.PATCH(req("PATCH", `/api/v1/tasks/${taskId}`, { as: "chw", body: { action: "acknowledge" } }), params({ id: taskId }));
    const done = await json(await one.PATCH(req("PATCH", `/api/v1/tasks/${taskId}`, { as: "chw", body: { action: "complete", note: "Citoyenne jointe, orientée au CS" } }), params({ id: taskId })));
    expect((done.task as { status: string }).status).toBe("done");
  });

  it("records notes, follow-ups and merges through their endpoints", async () => {
    const db = await getDb();
    const notes = await import("@/app/api/v1/cases/[id]/notes/route");
    await notes.POST(req("POST", `/api/v1/cases/${ids.case}/notes`, { as: "chw", body: { note: "Visite effectuée à domicile." } }), params({ id: ids.case }));
    const listed = await json(await notes.GET(req("GET", `/api/v1/cases/${ids.case}/notes`, { as: "chw" }), params({ id: ids.case })));
    expect((listed.notes as unknown[]).length).toBe(1);

    const followUps = await import("@/app/api/v1/cases/[id]/follow-ups/route");
    const scheduled = await json(
      await followUps.POST(req("POST", `/api/v1/cases/${ids.case}/follow-ups`, { as: "chw", body: { scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), channel: "sms" } }), params({ id: ids.case })),
    );
    expect(scheduled.captured).toBe(false);
    const captured = await json(
      await followUps.POST(req("POST", `/api/v1/cases/${ids.case}/follow-ups`, { as: "chw", body: { outcome: "went_to_clinic", outcomeText: "Consultation faite" } }), params({ id: ids.case })),
    );
    expect(captured.captured).toBe(true);

    const [interaction] = await db.insert(schema.interactions).values({ module: "health", status: "completed" }).returning();
    const dup = await openCase({ module: "health", interactionId: interaction.id, title: "Doublon", severity: "medium", province: "Kinshasa", autoAssign: false });
    const merge = await import("@/app/api/v1/cases/[id]/merge/route");
    const merged = await json(
      await merge.POST(req("POST", `/api/v1/cases/${dup.id}/merge`, { as: "gov_admin", body: { targetCaseId: ids.case, reason: "Même signalement enregistré deux fois" } }), params({ id: dup.id })),
    );
    expect((merged.source as { status: string }).status).toBe("duplicate");
  });

  it("runs the scheduler through the cron endpoint", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { POST } = await import("@/app/api/v1/workflow/run/route");
    const denied = await POST(new NextRequest(`${BASE}/api/v1/workflow/run`, { method: "POST" }));
    expect(denied.status).toBe(401);

    const headers = new Headers({ "x-cron-secret": "test-cron-secret" });
    const res = await POST(new NextRequest(`${BASE}/api/v1/workflow/run`, { method: "POST", headers }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { errors: unknown[]; auditChain: { ok: boolean } | null };
    expect(body.errors).toEqual([]);
    delete process.env.CRON_SECRET;
  });
});
