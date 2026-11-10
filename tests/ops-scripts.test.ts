import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The operational scripts are code, and nothing was compiling them.
 *
 * `dr-drill.sh`, `rollback.sh` and `alerts.sh` are the three things an operator
 * reaches for on the worst day: restore the backup, put traffic back on the last
 * good revision, find out a failure happened at all. They are shell and SQL, so
 * TypeScript never saw them, the test suite never ran them, and they refer to
 * tables, routes and response fields that the platform is free to rename
 * underneath them.
 *
 * That is exactly what had happened. `dr-drill.sh` counted rows in `audit_log`;
 * the table has always been `audit_logs`. Worse than the typo was its
 * consequence: psql without `ON_ERROR_STOP` prints the error, returns 0, and the
 * script's own "could the copy be read" guard does not fire — so the drill
 * printed a measured RTO and an operator would have recorded a pass, with the
 * one check that proves the backup is not a backup of an empty database having
 * silently produced nothing. Verified against PostgreSQL 16 and the real
 * migration: exit 0 before, exit 3 after.
 *
 * These tests are cheap and they are the only thing standing between a rename
 * and a disaster-recovery script that lies. They do not need GCP: every
 * assertion is a name this repository already knows.
 */

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const SCHEMA = read("src/server/db/schema.ts");

/** Every table name the platform actually declares. */
const declaredTables = (): Set<string> => {
  const names = new Set<string>();
  for (const match of SCHEMA.matchAll(/pgTable\(\s*"([a-z_0-9]+)"/g)) names.add(match[1]);
  return names;
};

/**
 * Relations that are real but are not the platform's own tables: the bootstrap's
 * migration bookkeeping, and PostgreSQL's catalogue.
 */
const NON_SCHEMA_RELATIONS = new Set(["drizzle.__drizzle_migrations", "information_schema.tables"]);

/** The SQL heredoc inside dr-drill.sh, as the script actually sends it. */
function drillSql(): string {
  const script = read("scripts/dr-drill.sh");
  const match = script.match(/SQL_CHECKS=\$\(cat <<'SQL'\n([\s\S]*?)\nSQL\n\)/);
  if (match === null) throw new Error("could not find the SQL_CHECKS heredoc in scripts/dr-drill.sh");
  return match[1];
}

describe("the disaster-recovery drill can actually read the database it restores", () => {
  const tables = declaredTables();

  it("queries only relations that exist", () => {
    const referenced = new Set<string>();
    for (const match of drillSql().matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z_0-9.]*)/gi)) {
      referenced.add(match[1]);
    }
    expect(referenced.size, "the drill should query something").toBeGreaterThan(0);

    const unknown = [...referenced].filter((r) => !tables.has(r) && !NON_SCHEMA_RELATIONS.has(r));
    expect(
      unknown,
      `scripts/dr-drill.sh queries relations the schema does not declare: ${unknown.join(", ")}. ` +
        "A drill that cannot read the copy it restored reports a failure that has nothing to do with the backup.",
    ).toEqual([]);
  });

  it("stops on the first SQL error instead of exiting zero", () => {
    // Without this, a renamed table prints an ERROR, psql exits 0, and the
    // script reports a passed drill. Measured: exit 0 without it, exit 3 with it.
    expect(
      drillSql(),
      "scripts/dr-drill.sh must set ON_ERROR_STOP, or its read-back guard cannot fire",
    ).toContain("\\set ON_ERROR_STOP on");
  });

  it("counts the rows whose absence would make a restore worthless", () => {
    const sql = drillSql();
    // A backup of an empty database looks exactly like a good one until these
    // are counted.
    for (const table of ["users", "interactions", "cases", "audit_logs"]) {
      expect(sql, `the drill must count ${table}`).toContain(table);
      expect(tables.has(table), `${table} must still be a declared table`).toBe(true);
    }
  });

  it("verifies the restored copy read-only, never touching the live instance", () => {
    const script = read("scripts/dr-drill.sh");
    // The restore target is a distinct instance and the source is only ever read.
    expect(script).toMatch(/RESTORE_INSTANCE=/);
    expect(script).not.toMatch(/sql instances (delete|patch|restart) "\$SOURCE_INSTANCE"/);
    expect(script).not.toMatch(/users set-password[^\n]*SOURCE_INSTANCE/);
  });
});

describe("the probes the rollback drill and the alerts depend on exist", () => {
  const READY_ROUTE = "src/app/api/v1/system/ready/route.ts";

  it("rollback.sh probes a route this repository serves", () => {
    const script = read("scripts/rollback.sh");
    const match = script.match(/PROBE_PATH="\$\{PROBE_PATH:-([^}]+)\}"/);
    expect(match, "no PROBE_PATH in scripts/rollback.sh").not.toBeNull();
    const probe = match![1];
    expect(probe).toBe("/api/v1/system/ready");
    // The route file must exist, or every rollback verification fails on a 404
    // and the drill condemns a revision that was fine.
    expect(() => read(READY_ROUTE)).not.toThrow();
  });

  it("the uptime check matches a string the readiness route really returns", () => {
    const alerts = read("scripts/alerts.sh");
    const match = alerts.match(/--matcher-content='([^']+)'/);
    expect(match, "no matcher-content in scripts/alerts.sh").not.toBeNull();
    const matcher = match![1]; // '"status":"ready"'

    // NextResponse.json serialises with JSON.stringify, so the body carries
    // "status":"ready" with no spaces. Assert the route can produce it.
    const route = read(READY_ROUTE);
    const field = matcher.match(/^"(\w+)":"(\w+)"$/);
    expect(field, `matcher ${matcher} is not a simple JSON field`).not.toBeNull();
    const [, key, value] = field!;
    expect(route, `the readiness route must return ${key}: "${value}"`).toContain(`${key}: "${value}"`);
  });

  it("alerts.sh matches on the body, not only on the status code", () => {
    // A page that returns 200 while reporting not_ready is the failure an
    // HTTP-only check misses, and this platform's /ready does return 503 — but
    // the matcher is what catches a 200 that lies.
    const alerts = read("scripts/alerts.sh");
    expect(alerts).toContain("--matcher-type=contains-string");
  });

  it("the readiness route answers not_ready rather than throwing", () => {
    const route = read(READY_ROUTE);
    expect(route).toContain('status: "not_ready"');
    expect(route).toContain("503");
  });
});

describe("the load balancer is configured the way serverless backends allow", () => {
  const domain = read("scripts/domain.sh");

  it("attaches the Cloud Run service through a serverless endpoint group", () => {
    expect(domain).toContain("--network-endpoint-type=serverless");
    expect(domain).toContain("--cloud-run-service=");
  });

  it("does not set a timeout on the backend service", () => {
    /*
     * This is the error the script used to fail on, and the reason it is worth a
     * test rather than a comment.
     *
     * Google's documentation: the backend service timeout does not apply to
     * backends that are serverless NEGs, and modifying it returns "Timeout sec
     * is not supported for a backend service with Serverless network endpoint
     * groups." The value is fixed at 60 minutes — 3600 seconds, which is exactly
     * what the script was passing. Asking for it gained nothing and broke the
     * run.
     *
     * The temptation to "fix" a timed-out voice turn by raising this number is
     * exactly what this test exists to stop. The lever is REQUEST_TIMEOUT on the
     * Cloud Run service, in go-live.sh.
     */
    const backendSection = domain.slice(domain.indexOf('step "Backend service"'));
    const offending = backendSection
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .filter((line) => /backend-services (create|update)/.test(line) || /--timeout=/.test(line))
      .filter((line) => /--timeout/.test(line));
    expect(
      offending,
      "scripts/domain.sh must not set --timeout on a backend service with a serverless NEG backend: " +
        offending.join(" | "),
    ).toEqual([]);
  });

  it("keeps the request timeout on the hop that can actually be set", () => {
    // Cloud Run's own request timeout is the real lever, and it must stay at the
    // maximum: a spoken turn is an upload, a transcription, an answer and a
    // synthesis, and the first one hits a cold instance.
    const goLive = read("scripts/go-live.sh");
    expect(goLive).toContain('--timeout="${REQUEST_TIMEOUT:-3600}"');
  });
});
