import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { END_OF_UTTERANCE_MS, gather, speechTimeoutValue } from "@server/channels/twilio";
import { languageMenu, openQuestionMenu } from "@server/channels/ivr";
import { placeBridgedCall } from "@server/channels/outbound-call";
import { identifyCitizen } from "@server/channels/session";
import { phoneColumns, readPhone } from "@server/core/phone";
import { encodeSession } from "@server/core/auth";
import { getDb, resetDbForTests, schema } from "@server/db/client";

import { POST as callRoute } from "@/app/api/v1/cases/[id]/call/route";

const ORIGIN = "http://localhost:3000";
const WORKER_NUMBER = "+243810000111";
const CITIZEN_NUMBER = "+243990000222";

describe("IVR turn taking (FR-CH-03)", () => {
  it("lets a caller speak over the menu", () => {
    // A caller who has heard the menu twenty times must not have to sit through it.
    expect(languageMenu("fr")).toContain('bargeIn="true"');
    expect(openQuestionMenu("ln")).toContain('bargeIn="true"');
  });

  it("keeps the prompt inside the gather, so there is something to interrupt", () => {
    const menu = languageMenu("fr");
    const gatherOpen = menu.indexOf("<Gather ");
    expect(gatherOpen).toBeGreaterThanOrEqual(0);
    expect(menu.indexOf("<Say")).toBeGreaterThan(gatherOpen);
    expect(menu.indexOf("<Say")).toBeLessThan(menu.indexOf("</Gather>"));
  });

  it("ends a spoken turn after the configured silence", () => {
    expect(END_OF_UTTERANCE_MS).toBe(800);
    expect(gather({ action: "/x" }, "")).toContain('speechTimeout="1"');
  });

  it("sends the gateway whole seconds, never a fraction it would reject", () => {
    // 0 would disable speech capture outright; a fraction is refused by the gateway.
    expect(speechTimeoutValue(800)).toBe("1");
    expect(speechTimeoutValue(200)).toBe("1");
    expect(speechTimeoutValue(2400)).toBe("2");
    expect(Number(speechTimeoutValue(800))).toBeGreaterThan(0);
    expect(speechTimeoutValue(800)).not.toContain(".");
  });

  it("hands endpointing to the recogniser when the deployment asks for it", () => {
    vi.stubEnv("IVR_END_OF_UTTERANCE_MS", "auto");
    expect(speechTimeoutValue()).toBe("auto");
    expect(gather({ action: "/x" }, "")).toContain('speechTimeout="auto"');
    vi.unstubAllEnvs();
  });

  it("lets a single step override the silence window", () => {
    expect(openQuestionMenu("fr")).toContain('speechTimeout="auto"');
  });
});

describe("click to call (FR-CS-04)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("dials the worker and bridges the citizen, so the number is never handed over", async () => {
    const calls: Array<{ url: string; body: URLSearchParams }> = [];
    vi.stubEnv("VOICE_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token_test");
    vi.stubEnv("TWILIO_FROM", "+243800000000");
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: new URLSearchParams(String((init as RequestInit).body)) });
      return new Response(JSON.stringify({ sid: "CA_test" }), { status: 201, headers: { "content-type": "application/json" } });
    });

    const mod = await import("@server/channels/outbound-call");
    const result = await mod.placeBridgedCall({ caseId: "case-1", workerNumber: WORKER_NUMBER, citizenNumber: CITIZEN_NUMBER });

    expect(result.ok).toBe(true);
    expect(result.callId).toBe("CA_test");
    expect(calls).toHaveLength(1);
    // The leg that rings is the worker's; the citizen is reached from inside the
    // instruction, so the worker's handset never receives the number.
    expect(calls[0].body.get("To")).toBe(WORKER_NUMBER);
    expect(calls[0].body.get("To")).not.toBe(CITIZEN_NUMBER);
    expect(calls[0].body.get("Twiml")).toContain(`<Number>${CITIZEN_NUMBER}</Number>`);
    fetchSpy.mockRestore();
  });

  it("refuses to pretend a call happened when telephony is half configured", async () => {
    vi.stubEnv("VOICE_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_FROM", "");
    vi.resetModules();
    const mod = await import("@server/channels/outbound-call");
    const result = await mod.placeBridgedCall({ caseId: "case-1", workerNumber: WORKER_NUMBER, citizenNumber: CITIZEN_NUMBER });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("twilio_not_configured");
  });

  it("fails loudly in production when no telephony provider is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VOICE_PROVIDER", "log");
    vi.resetModules();
    const mod = await import("@server/channels/outbound-call");
    const result = await mod.placeBridgedCall({ caseId: "case-1", workerNumber: WORKER_NUMBER, citizenNumber: CITIZEN_NUMBER });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("voice_provider_not_configured");
  });

  it("logs rather than fails on a laptop, so the workflow is testable offline", async () => {
    const result = await placeBridgedCall({ caseId: "case-1", workerNumber: WORKER_NUMBER, citizenNumber: CITIZEN_NUMBER });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("log");
  });
});

describe("click to call route (FR-CS-04)", () => {
  let workerToken = "";
  let workerId = "";
  let otherWorkerId = "";
  let caseId = "";

  beforeEach(async () => {
    resetDbForTests();
    const db = await getDb();
    const [worker] = await db
      .insert(schema.users)
      .values({ name: "Agent", role: "chw", province: "Kinshasa", ...phoneColumns(WORKER_NUMBER) })
      .returning();
    const [other] = await db
      .insert(schema.users)
      .values({ name: "Autre agent", role: "chw", province: "Kinshasa", ...phoneColumns("+243810000999") })
      .returning();
    const [citizen] = await db
      .insert(schema.users)
      .values({ isAnonymous: false, role: "citizen", province: "Kinshasa", ...phoneColumns(CITIZEN_NUMBER) })
      .returning();
    const [interaction] = await db
      .insert(schema.interactions)
      .values({ module: "health", channel: "ivr", status: "completed", originalInput: "fièvre" })
      .returning();
    const [c] = await db
      .insert(schema.cases)
      .values({ module: "health", userId: citizen.id, interactionId: interaction.id, title: "Fièvre", severity: "medium", assignedTo: worker.id })
      .returning();

    workerId = worker.id;
    otherWorkerId = other.id;
    caseId = c.id;
    workerToken = encodeSession({ userId: worker.id, role: "chw", language: "fr", province: "Kinshasa", anonymous: false });
  });

  function request(): NextRequest {
    return new NextRequest(`${ORIGIN}/api/v1/cases/${caseId}/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" },
      body: "{}",
    } as ConstructorParameters<typeof NextRequest>[1]);
  }

  it("places the call and records it without writing a number down", async () => {
    const res = await callRoute(request(), { params: Promise.resolve({ id: caseId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { call: { ok: boolean } };
    expect(body.call.ok).toBe(true);

    const db = await getDb();
    const [entry] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, caseId))
      .orderBy(desc(schema.auditLogs.createdAt));
    expect(entry.action).toBe("case.call_placed");
    // The audit log is read by people who are not on the case.
    const serialised = JSON.stringify(entry);
    expect(serialised).not.toContain(CITIZEN_NUMBER);
    expect(serialised).not.toContain(WORKER_NUMBER);
  });

  it("will not connect a worker to a household on somebody else's case", async () => {
    const db = await getDb();
    await db.update(schema.cases).set({ assignedTo: otherWorkerId }).where(eq(schema.cases.id, caseId));
    const res = await callRoute(request(), { params: Promise.resolve({ id: caseId }) });
    expect(res.status).toBe(403);
  });

  it("says so plainly when there is no number to reach", async () => {
    const db = await getDb();
    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, caseId));
    await db.update(schema.users).set({ phone: null, phoneIndex: null }).where(eq(schema.users.id, c.userId as string));
    const res = await callRoute(request(), { params: Promise.resolve({ id: caseId }) });
    expect(res.status).toBe(404);
    expect(workerId).toBeTruthy();
  });
});

describe("a caller's number on the way in (FR-CH-01, SEC-05)", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("stores the number encrypted and still recognises the caller next time", async () => {
    const first = await identifyCitizen({ kind: "ivr_caller", value: CITIZEN_NUMBER, language: "ln" });
    expect(first.isNew).toBe(true);

    const db = await getDb();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, first.userId));
    // What is on disk is not the number.
    expect(row.phone).not.toContain("243");
    expect(row.phone?.startsWith("v1.")).toBe(true);
    expect(readPhone(row.phone)).toBe(CITIZEN_NUMBER);
    // …and it is still findable, which a plain column without its index would not be.
    expect(row.phoneIndex).toBeTruthy();

    await db.delete(schema.citizenIdentifiers);
    const second = await identifyCitizen({ kind: "msisdn", value: CITIZEN_NUMBER });
    expect(second.userId).toBe(first.userId);
    expect(second.isNew).toBe(false);
  });
});
