/**
 * One address for the service.
 *
 * congovoicecd.com and www.congovoicecd.com both served the whole application
 * with nothing pointing at the other. The session cookie carries no domain, so
 * it belongs to the host that issued it: signing in on one spelling and
 * following a link to the other signs you out without saying so.
 *
 * The redirect has to be narrow. Cloud Run calls the readiness probe on the
 * container's own address, and a redirect there is a startup probe that fails
 * and a revision that never serves — a worse outage than the one being fixed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { aliasOf, middleware } from "@/middleware";

const CANON = "congovoicecd.com";

function req(host: string, path = "/", method = "GET") {
  return new NextRequest(`https://${host}${path}`, { method, headers: new Headers({ host }) });
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

function canonicalIs(host: string) {
  process.env.NEXT_PUBLIC_SITE_URL = `https://${host}`;
}

describe("the two spellings of the address", () => {
  it("knows each is the other's alias", () => {
    expect(aliasOf("congovoicecd.com")).toBe("www.congovoicecd.com");
    expect(aliasOf("www.congovoicecd.com")).toBe("congovoicecd.com");
  });
});

describe("with the apex canonical", () => {
  it("sends www to the apex, permanently, keeping path and query", () => {
    canonicalIs(CANON);
    const res = middleware(req(`www.${CANON}`, "/sante?lang=ln"));
    expect(res.status).toBe(308);
    const to = new URL(res.headers.get("location")!);
    expect(to.host).toBe(CANON);
    expect(to.pathname).toBe("/sante");
    expect(to.searchParams.get("lang")).toBe("ln");
  });

  it("keeps a POST a POST, so a submitted question is not lost", () => {
    canonicalIs(CANON);
    // 308 preserves method and body; 301 does not.
    const res = middleware(req(`www.${CANON}`, "/api/v1/interactions", "POST"));
    expect(res.status).toBe(308);
  });

  it("leaves the canonical host alone", () => {
    canonicalIs(CANON);
    expect(middleware(req(CANON, "/sante")).status).toBe(200);
  });
});

describe("with www canonical", () => {
  it("sends the apex to www", () => {
    canonicalIs(`www.${CANON}`);
    const res = middleware(req(CANON, "/"));
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location")!).host).toBe(`www.${CANON}`);
  });

  it("leaves www alone", () => {
    canonicalIs(`www.${CANON}`);
    expect(middleware(req(`www.${CANON}`, "/")).status).toBe(200);
  });
});

describe("what must never be redirected", () => {
  it("does not touch the readiness probe", () => {
    canonicalIs(CANON);
    // Cloud Run calls this on the container's own address. A redirect here is a
    // revision that never starts.
    expect(middleware(req(`www.${CANON}`, "/api/v1/system/ready")).status).toBe(200);
    expect(middleware(req(`www.${CANON}`, "/api/v1/system/health")).status).toBe(200);
  });

  it("does not touch telephony or messaging webhooks", () => {
    canonicalIs(CANON);
    // Their signatures are computed over the exact URL the provider was given.
    for (const p of ["/api/hooks/ivr/twilio", "/api/hooks/whatsapp", "/api/hooks/sms/dlr"]) {
      expect(middleware(req(`www.${CANON}`, p, "POST")).status, p).toBe(200);
    }
  });

  it("ignores any host that is not the one alias", () => {
    canonicalIs(CANON);
    for (const h of ["congovoice-pilot-abc123-ew.a.run.app", "localhost", "10.0.0.5", "evil.example.com", "api.congovoicecd.com"]) {
      expect(middleware(req(h, "/")).status, h).toBe(200);
    }
  });

  it("does nothing at all when no public origin is configured", () => {
    expect(middleware(req(`www.${CANON}`, "/")).status).toBe(200);
  });
});
