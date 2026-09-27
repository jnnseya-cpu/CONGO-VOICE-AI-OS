/**
 * Correlating a citizen's report with the request that failed.
 *
 * Three tables carried a trace_id column and nothing ever wrote one. An operator
 * holding "it stopped working this afternoon" had the audit log, which records
 * what happened, and Cloud Logging, which records the request, and no way to join
 * them. Cloud Run stamps X-Cloud-Trace-Context on every inbound request, so that
 * is the identifier adopted rather than a second scheme beside it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { requestTraceId } from "@server/core/api";
import { encodeSession } from "@server/core/auth";

const BASE = "http://localhost:3000";

describe("choosing the identifier", () => {
  it("adopts Cloud Run's trace, without its span suffix", () => {
    const req = new NextRequest(`${BASE}/x`, { headers: new Headers({ "x-cloud-trace-context": "105445aa7843bc8bf206b12000100000/1;o=1" }) });
    expect(requestTraceId(req)).toBe("105445aa7843bc8bf206b12000100000");
  });

  it("falls back to a proxy's request id", () => {
    const req = new NextRequest(`${BASE}/x`, { headers: new Headers({ "x-request-id": "req-abc-123" }) });
    expect(requestTraceId(req)).toBe("req-abc-123");
  });

  it("generates one when nothing upstream supplied it", () => {
    const a = requestTraceId(new NextRequest(`${BASE}/x`));
    const b = requestTraceId(new NextRequest(`${BASE}/x`));
    expect(a).toHaveLength(36);
    expect(a).not.toBe(b);
  });

  it("truncates a hostile header rather than storing it whole", () => {
    const req = new NextRequest(`${BASE}/x`, { headers: new Headers({ "x-request-id": "A".repeat(500) }) });
    // trace_id is varchar(64): an over-long header must not fail the insert.
    expect(requestTraceId(req).length).toBeLessThanOrEqual(64);
  });
});

describe("the identifier reaches the interaction row", () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ isAnonymous: true, role: "citizen", languagePreference: "fr" }).returning();
    ids.token = encodeSession({ userId: u.id, role: "citizen", language: "fr", anonymous: true });
  });

  it("stores the trace supplied by the platform", async () => {
    const db = await getDb();
    const { POST } = await import("@/app/api/v1/interactions/route");
    const trace = "abc123def456abc123def456abc12345";
    const res = await POST(
      new NextRequest(`${BASE}/api/v1/interactions`, {
        method: "POST",
        headers: new Headers({ "content-type": "application/json", authorization: `Bearer ${ids.token}`, "x-cloud-trace-context": `${trace}/1;o=1` }),
        body: JSON.stringify({ text: "Je ne comprends pas les fractions", wantsAudio: false }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { interactionId: string };
    const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, body.interactionId));
    expect(row.traceId, "the request that produced this row must be findable").toBe(trace);
  });
});
