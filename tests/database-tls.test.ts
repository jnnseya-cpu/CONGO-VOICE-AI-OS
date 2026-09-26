import { createRequire } from "node:module";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { databaseTls, withoutTlsParams, resetTlsWarningForTests } from "@server/db/client";

/**
 * The deploy that failed did so with UNABLE_TO_VERIFY_LEAF_SIGNATURE, and the
 * reason was not the certificate: pg assigns a parsed connection string over
 * the config it was handed, so one `sslmode=` in the URL discarded the `ssl`
 * object carrying the CA. These tests pin both halves of the fix — the URL is
 * stripped, and the decision is made here rather than inferred.
 */

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

/**
 * pg resolves ssl configuration in an internal module that ships no usable
 * types, so it is required through createRequire and given the shape this test
 * relies on. Reaching into an internal is deliberate: the assertion is about
 * what pg does with our arguments, and asserting it against our own re-reading
 * of pg's source would prove nothing.
 */
interface ResolvedParams {
  ssl?: boolean | { ca?: string };
}
type ConnectionParametersCtor = new (config: Record<string, unknown>) => ResolvedParams;
const ConnectionParameters: ConnectionParametersCtor = createRequire(import.meta.url)(
  "pg/lib/connection-parameters.js",
);
const caOf = (p: ResolvedParams): string | undefined =>
  typeof p.ssl === "object" && p.ssl !== null ? p.ssl.ca : undefined;

beforeEach(() => resetTlsWarningForTests());
afterEach(() => vi.restoreAllMocks());

describe("the connection string carries no TLS parameters", () => {
  it("removes every parameter pg would interpret", () => {
    const url =
      "postgresql://u:p@10.64.0.3:5432/cvos" +
      "?sslmode=verify-ca&sslrootcert=/etc/ssl/ca.pem&uselibpqcompat=true&ssl=true&sslnegotiation=direct";
    const out = withoutTlsParams(url);
    for (const key of ["sslmode", "sslrootcert", "uselibpqcompat", "ssl=", "sslnegotiation"]) {
      expect(out).not.toContain(key);
    }
  });

  it("keeps the parts that identify the database", () => {
    const out = withoutTlsParams("postgresql://cvos_app:secret@10.64.0.3:5432/cvos?sslmode=require");
    const parsed = new URL(out);
    expect(parsed.hostname).toBe("10.64.0.3");
    expect(parsed.port).toBe("5432");
    expect(parsed.pathname).toBe("/cvos");
    expect(parsed.username).toBe("cvos_app");
    expect(parsed.password).toBe("secret");
  });

  it("keeps a non-TLS parameter", () => {
    expect(withoutTlsParams("postgresql://u:p@h:5432/d?application_name=cvos&sslmode=require"))
      .toContain("application_name=cvos");
  });

  it("leaves a string it cannot parse alone rather than losing it", () => {
    expect(withoutTlsParams("not a url")).toBe("not a url");
  });

  it("is what pg actually honours: an explicit ssl option survives a stripped URL", () => {
    // The regression itself, asserted against pg's own resolution rather than
    // against a reading of its source: with sslmode present it assigns the
    // parsed connection string over the config and the CA is lost.
    const ssl = { ca: PEM, rejectUnauthorized: true as const, checkServerIdentity: () => undefined };

    const withMode = new ConnectionParameters({
      connectionString: "postgresql://u:p@10.64.0.3:5432/cvos?sslmode=require",
      ssl,
    });
    expect(caOf(withMode)).toBeUndefined();

    const stripped = new ConnectionParameters({
      connectionString: withoutTlsParams("postgresql://u:p@10.64.0.3:5432/cvos?sslmode=require"),
      ssl,
    });
    expect(caOf(stripped)).toBe(PEM);
  });
});

describe("how the database's certificate is trusted", () => {
  it("verifies the chain against a supplied CA, and skips the hostname", () => {
    const tls = databaseTls(PEM);
    expect(tls).toMatchObject({ ca: PEM, rejectUnauthorized: true });
    // The certificate names the instance; we connect to a private address.
    expect(typeof (tls as { checkServerIdentity: unknown }).checkServerIdentity).toBe("function");
    expect((tls as { checkServerIdentity: () => undefined }).checkServerIdentity()).toBeUndefined();
  });

  it("ignores a CA variable that is present but blank", () => {
    expect(databaseTls("   ")).toEqual({ rejectUnauthorized: false });
  });

  it("trims a CA that arrived with surrounding whitespace", () => {
    const tls = databaseTls(`\n${PEM}\n`);
    expect((tls as { ca: string }).ca).toBe(PEM);
  });

  it("turns TLS off only when asked explicitly", () => {
    expect(databaseTls(undefined, "disable")).toBe(false);
    expect(databaseTls(undefined, "DISABLE")).toBe(false);
    expect(databaseTls(undefined, "off")).not.toBe(false);
  });

  it("an explicit disable beats a supplied CA", () => {
    expect(databaseTls(PEM, "disable")).toBe(false);
  });

  it("says out loud when it cannot verify, once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    databaseTls(undefined, undefined);
    databaseTls(undefined, undefined);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("DATABASE_CA_CERT");
  });

  it("does not warn when a CA is supplied", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    databaseTls(PEM);
    expect(warn).not.toHaveBeenCalled();
  });
});
