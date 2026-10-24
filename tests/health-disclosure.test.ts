import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@server/db/client";
import { GET as health } from "@/app/api/v1/system/health/route";

/**
 * `/api/v1/system/health` is reachable without a session: Cloud Run probes it,
 * and the service is deployed with unauthenticated access. A degraded answer
 * therefore goes out to anybody who asks, and a failing check's explanation can
 * name the vendor chain, the hosting jurisdiction, the environment variables
 * that are unset and how long the scheduler has been dead.
 *
 * The status is public. The explanations are not.
 */
describe("public health disclosure", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("explains what is failing outside production", async () => {
    resetDbForTests();
    // The readiness gates only apply to a deployment that claims to be serving
    // citizens, so say so — while staying out of production, which is the
    // distinction under test.
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    const res = await health();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { failing: Array<{ id: string; detail?: string }> };
    expect(body.failing.length).toBeGreaterThan(0);
    expect(body.failing.some((c) => typeof c.detail === "string" && c.detail.length > 0)).toBe(true);
  });

  it("gives an anonymous caller the identifiers and nothing else in production", async () => {
    resetDbForTests();
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    vi.stubEnv("NODE_ENV", "production");
    const res = await health();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { failing?: Array<Record<string, unknown>>; error?: string };
    expect(body.failing, `body was ${JSON.stringify(body).slice(0, 200)}`).toBeDefined();
    expect(body.failing!.length).toBeGreaterThan(0);
    for (const entry of body.failing!) {
      expect(Object.keys(entry)).toEqual(["id"]);
      expect(typeof entry.id).toBe("string");
    }
  });
});
