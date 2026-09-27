import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import path from "node:path";
import { getDb, resetDbForTests } from "@server/db/client";
import {
  addColumnStatement,
  applySchema,
  isAlreadyExists,
  parseSnapshot,
  readSnapshot,
  schemaMatches,
  type Executor,
} from "@server/db/bootstrap";

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

function executorFor(db: Awaited<ReturnType<typeof getDb>>): Executor {
  const exec = db as unknown as { execute: (q: unknown) => Promise<unknown> };
  return {
    async run(statement) {
      await exec.execute(sql.raw(statement));
    },
    async rows<T extends Record<string, unknown>>(statement: string) {
      const result = await exec.execute(sql.raw(statement));
      if (Array.isArray(result)) return result as T[];
      const rows = (result as { rows?: unknown }).rows;
      return Array.isArray(rows) ? (rows as T[]) : [];
    },
  };
}

describe("already-exists detection", () => {
  it("reads the code off the error and off a wrapped cause", () => {
    expect(isAlreadyExists({ code: "42710" })).toBe(true);
    expect(isAlreadyExists({ code: "42P07" })).toBe(true);
    expect(isAlreadyExists(new Error("boom"))).toBe(false);
    const wrapped = Object.assign(new Error("Failed query"), { cause: { code: "42710" } });
    expect(isAlreadyExists(wrapped), "the driver wraps the server error one level down").toBe(true);
    const twice = Object.assign(new Error("outer"), { cause: Object.assign(new Error("inner"), { cause: { code: "42701" } }) });
    expect(isAlreadyExists(twice)).toBe(true);
  });

  it("does not treat an unrelated failure as benign", () => {
    // 42703 is undefined_column: a real schema mismatch that must fail the boot.
    expect(isAlreadyExists({ code: "42703" })).toBe(false);
    expect(isAlreadyExists({ code: "23505" })).toBe(false);
  });
});

describe("add-column rendering", () => {
  it("qualifies an enum type and carries the default", () => {
    const out = addColumnStatement("cases", { name: "module", type: "module_type", typeSchema: "public", notNull: true, default: "'health'" }, false);
    expect(out.sql).toBe(`ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "module" "public"."module_type" DEFAULT 'health' NOT NULL`);
    expect(out.relaxed).toBe(false);
  });

  it("enforces NOT NULL on an empty table even with no default", () => {
    const out = addColumnStatement("cases", { name: "label", type: "text", notNull: true }, true);
    expect(out.sql).toContain("NOT NULL");
    expect(out.relaxed).toBe(false);
  });

  it("relaxes NOT NULL rather than failing a boot against a populated table", () => {
    const out = addColumnStatement("cases", { name: "label", type: "text", notNull: true }, false);
    expect(out.sql).not.toContain("NOT NULL");
    expect(out.relaxed, "the operator has to be told the constraint was not applied").toBe(true);
  });
});

describe("snapshot parsing", () => {
  it("keeps enum values and column specs", () => {
    const snap = parseSnapshot({
      enums: { "public.module_type": { name: "module_type", schema: "public", values: ["health", "agriculture"] } },
      tables: { "public.cases": { name: "cases", columns: { id: { name: "id", type: "uuid", notNull: true }, note: { name: "note", type: "text" } } } },
    });
    expect(snap.enums.get("module_type")).toEqual(["health", "agriculture"]);
    expect(snap.columns.get("cases")?.map((c) => c.name)).toEqual(["id", "note"]);
    expect(snap.columns.get("cases")?.[1].notNull).toBe(false);
  });

  it("reads the checked-in snapshot", () => {
    const snap = readSnapshot(migrationsFolder);
    expect(snap, "drizzle/meta must carry a snapshot for convergence to be possible").not.toBeNull();
    expect(snap!.enums.size).toBeGreaterThan(10);
    expect(snap!.columns.size).toBeGreaterThan(50);
  });
});

/**
 * The production failure, reproduced.
 *
 * Regenerating the single pre-release migration writes a new journal timestamp.
 * Drizzle's own migrator applies anything newer than the newest applied
 * timestamp, so a database that already holds the whole schema is handed the
 * whole init file again and dies on the first CREATE TYPE with 42710. Cloud Run
 * revision congovoice-pilot-00020-46c never passed its startup probe for exactly
 * this reason.
 */
describe("replay against a database that already holds the schema", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("converges instead of failing on duplicate objects", async () => {
    const db = await getDb();
    const exec = executorFor(db);
    const { readMigrationFiles } = await import("drizzle-orm/migrator");
    const migrations = readMigrationFiles({ migrationsFolder });
    expect(migrations.length).toBeGreaterThan(0);

    // The database is already fully migrated by getDb(). Present the same
    // migration under a newer timestamp, which is precisely what
    // `rm -rf drizzle && drizzle-kit generate` produces.
    const regenerated = migrations.map((m) => ({ ...m, folderMillis: m.folderMillis + 1_000 }));
    const report = await applySchema(exec, regenerated, readSnapshot(migrationsFolder));

    expect(report.statementsSkipped, "every object already existed, so every statement should have been skipped").toBeGreaterThan(100);
    expect(report.statementsRun).toBe(0);
    expect(report.columnsAdded).toEqual([]);
    expect(schemaMatches(report), JSON.stringify(report.drift)).toBe(true);
  });

  it("is idempotent a third time and records the migration once per timestamp", async () => {
    const db = await getDb();
    const exec = executorFor(db);
    const { readMigrationFiles } = await import("drizzle-orm/migrator");
    const migrations = readMigrationFiles({ migrationsFolder });
    const again = migrations.map((m) => ({ ...m, folderMillis: m.folderMillis + 1_000 }));
    const report = await applySchema(exec, again, readSnapshot(migrationsFolder));
    // The timestamp is already recorded from the previous test, so nothing runs.
    expect(report.migrationsApplied).toEqual([]);
    expect(report.statementsRun + report.statementsSkipped).toBe(0);
  });

  it("adds a column the running database is missing", async () => {
    const db = await getDb();
    const exec = executorFor(db);
    await exec.run(`CREATE TABLE IF NOT EXISTS "bootstrap_probe" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL)`);
    const snapshot = parseSnapshot({
      enums: {},
      tables: {
        "public.bootstrap_probe": {
          name: "bootstrap_probe",
          columns: {
            id: { name: "id", type: "uuid", notNull: true, default: "gen_random_uuid()" },
            added_later: { name: "added_later", type: "text" },
          },
        },
      },
    });
    const report = await applySchema(exec, [], snapshot);
    expect(report.columnsAdded).toContain("bootstrap_probe.added_later");
    const cols = await exec.rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bootstrap_probe'`,
    );
    expect(cols.map((c) => c.column_name)).toContain("added_later");
  });

  it("adds an enum value the running database is missing", async () => {
    const db = await getDb();
    const exec = executorFor(db);
    await exec.run(`DO $$ BEGIN CREATE TYPE "public"."bootstrap_probe_enum" AS ENUM('one'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    const snapshot = parseSnapshot({
      enums: { "public.bootstrap_probe_enum": { name: "bootstrap_probe_enum", schema: "public", values: ["one", "two"] } },
      tables: {},
    });
    const report = await applySchema(exec, [], snapshot);
    expect(report.drift.filter((d) => d.object.startsWith("bootstrap_probe_enum"))).toEqual([]);
    const labels = await exec.rows<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'bootstrap_probe_enum'`,
    );
    expect(labels.map((l) => l.enumlabel)).toEqual(["one", "two"]);
  });

  it("propagates a failure that is not an already-exists", async () => {
    const db = await getDb();
    const exec = executorFor(db);
    await expect(
      applySchema(exec, [{ sql: ["SELECT * FROM a_table_that_does_not_exist"], folderMillis: 9_999_999_999, hash: "deadbeef" }], null),
    ).rejects.toThrow();
  });
});
