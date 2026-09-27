import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Schema bootstrap that converges instead of exploding.
 *
 * Drizzle's own migrator decides what to apply by comparing timestamps: it runs
 * every migration whose journal `when` is newer than the newest `created_at`
 * recorded in the database. The convention this repository documents —
 * `rm -rf drizzle && drizzle-kit generate --name init`, one migration until
 * release — writes a brand-new `when` on every regeneration. So the deployed
 * database, which already holds the whole schema, is handed the whole init file
 * again, and the first `CREATE TYPE` fails with 42710. The container never
 * passes its startup probe, and the failure is not intermittent: it is what
 * happens every single time the schema is regenerated against a database that
 * already exists.
 *
 * Deleting the database is not an option — it holds pilot interactions and a
 * hash-chained audit log. Asking an operator to hand-stamp a bookkeeping table
 * after every regeneration is the kind of undocumented manual step that has
 * already cost this project days.
 *
 * So the runner here applies migration statements tolerantly: an object that
 * already exists is counted and skipped, anything else still fails the boot. It
 * then reconciles what a replayed `CREATE TABLE IF NOT EXISTS` cannot reach —
 * enum values and columns added since the database was built — from the
 * generated snapshot, and reports whatever it could not settle safely instead of
 * pretending the schema matches.
 *
 * Additive only, by design. Nothing here drops a column, narrows a type or
 * rewrites data; those need a human-written migration and are reported as
 * drift.
 */

/** Postgres error codes that mean "this object is already there". */
const ALREADY_EXISTS = new Set([
  "42710", // duplicate_object — types, constraints
  "42P07", // duplicate_table — tables, indexes
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42723", // duplicate_function
]);

export function isAlreadyExists(err: unknown): boolean {
  const code = errorCode(err);
  return code !== null && ALREADY_EXISTS.has(code);
}

/** Both drivers wrap the server error, so the code can sit one or two levels down. */
function errorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current !== null && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause ?? null;
  }
  return null;
}

export type DriftKind = "missing_column" | "nullable_column" | "extra_column" | "missing_table";

export interface SchemaDrift {
  kind: DriftKind;
  object: string;
  detail: string;
}

export interface SchemaReport {
  /** Migrations whose statements were executed on this boot. */
  migrationsApplied: string[];
  /** Statements that ran without incident. */
  statementsRun: number;
  /** Statements skipped because the object already existed. */
  statementsSkipped: number;
  enumValuesAdded: string[];
  columnsAdded: string[];
  drift: SchemaDrift[];
}

export const EMPTY_REPORT: SchemaReport = {
  migrationsApplied: [],
  statementsRun: 0,
  statementsSkipped: 0,
  enumValuesAdded: [],
  columnsAdded: [],
  drift: [],
};

/* ---------------------------------------------------------------------------
 * Snapshot reading
 * ------------------------------------------------------------------------- */

export interface ColumnSpec {
  name: string;
  type: string;
  typeSchema?: string;
  notNull: boolean;
  default?: string;
}

export interface Snapshot {
  enums: Map<string, string[]>;
  columns: Map<string, ColumnSpec[]>;
}

interface RawSnapshot {
  enums?: Record<string, { name: string; schema?: string; values: string[] }>;
  tables?: Record<string, { name: string; columns: Record<string, RawColumn> }>;
}

interface RawColumn {
  name: string;
  type: string;
  typeSchema?: string;
  notNull?: boolean;
  default?: string | number | boolean;
}

/**
 * Reads the newest generated snapshot. The snapshot, not the SQL, is the
 * statement of intent: it is what `drizzle-kit` believes the schema should be,
 * so it is what convergence is measured against.
 */
export function readSnapshot(migrationsFolder: string): Snapshot | null {
  const metaDir = path.join(migrationsFolder, "meta");
  let files: string[];
  try {
    files = fs.readdirSync(metaDir).filter((f) => f.endsWith("_snapshot.json")).sort();
  } catch {
    return null;
  }
  const newest = files.at(-1);
  if (!newest) return null;
  const raw = JSON.parse(fs.readFileSync(path.join(metaDir, newest), "utf8")) as RawSnapshot;
  return parseSnapshot(raw);
}

export function parseSnapshot(raw: RawSnapshot): Snapshot {
  const enums = new Map<string, string[]>();
  for (const e of Object.values(raw.enums ?? {})) {
    if (e?.name && Array.isArray(e.values)) enums.set(e.name, e.values);
  }
  const columns = new Map<string, ColumnSpec[]>();
  for (const t of Object.values(raw.tables ?? {})) {
    if (!t?.name) continue;
    columns.set(
      t.name,
      Object.values(t.columns ?? {}).map((c) => ({
        name: c.name,
        type: c.type,
        typeSchema: c.typeSchema,
        notNull: Boolean(c.notNull),
        default: c.default === undefined ? undefined : String(c.default),
      })),
    );
  }
  return { enums, columns };
}

/** The type as it must be written in DDL, qualified when it is a custom enum. */
export function renderType(spec: ColumnSpec): string {
  return spec.typeSchema ? `"${spec.typeSchema}"."${spec.type}"` : spec.type;
}

/**
 * `ADD COLUMN` for a column the database is missing.
 *
 * A column the schema marks NOT NULL cannot be added as NOT NULL to a table
 * that already holds rows unless it has a default. Failing the boot over that
 * would take the platform down to enforce a constraint; adding it nullable and
 * saying so leaves the platform serving and the operator informed. The
 * application supplies the value either way — a missing NOT NULL makes the
 * database more permissive than the schema, never less.
 */
export function addColumnStatement(table: string, spec: ColumnSpec, tableIsEmpty: boolean): { sql: string; relaxed: boolean } {
  const parts = [`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${spec.name}" ${renderType(spec)}`];
  if (spec.default !== undefined) parts.push(`DEFAULT ${spec.default}`);
  const canEnforce = spec.notNull && (spec.default !== undefined || tableIsEmpty);
  if (canEnforce) parts.push("NOT NULL");
  return { sql: parts.join(" "), relaxed: spec.notNull && !canEnforce };
}

/* ---------------------------------------------------------------------------
 * Runner
 * ------------------------------------------------------------------------- */

export interface MigrationFile {
  sql: string[];
  folderMillis: number;
  hash: string;
}

export interface Executor {
  /** Runs a statement for its effect. */
  run(statement: string): Promise<void>;
  /** Runs a query and returns its rows. */
  rows<T extends Record<string, unknown>>(statement: string): Promise<T[]>;
}

const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Applies pending migrations, then converges what replaying a migration cannot.
 *
 * The bookkeeping table and its columns are exactly the ones drizzle's own
 * migrator creates, and a migration is keyed on the journal timestamp drizzle
 * keys on, so a database bootstrapped here is one drizzle's migrator would also
 * consider up to date.
 */
export async function applySchema(
  exec: Executor,
  migrations: MigrationFile[],
  snapshot: Snapshot | null,
): Promise<SchemaReport> {
  const report: SchemaReport = { ...EMPTY_REPORT, migrationsApplied: [], enumValuesAdded: [], columnsAdded: [], drift: [] };

  await exec.run(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
  await exec.run(
    `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );

  const applied = await exec.rows<{ created_at: string | number | null }>(
    `SELECT created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
  );
  const appliedMillis = new Set(applied.map((r) => Number(r.created_at)));

  for (const migration of [...migrations].sort((a, b) => a.folderMillis - b.folderMillis)) {
    if (appliedMillis.has(migration.folderMillis)) continue;
    for (const statement of migration.sql) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      try {
        await exec.run(trimmed);
        report.statementsRun += 1;
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
        report.statementsSkipped += 1;
      }
    }
    await exec.run(
      `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES ('${migration.hash}', ${migration.folderMillis})`,
    );
    report.migrationsApplied.push(String(migration.folderMillis));
  }

  if (snapshot) await convergeSnapshot(exec, snapshot, report);
  return report;
}

/** Adds enum values and columns the replay could not reach, and records the rest. */
export async function convergeSnapshot(exec: Executor, snapshot: Snapshot, report: SchemaReport): Promise<void> {
  for (const [enumName, values] of snapshot.enums) {
    for (const value of values) {
      try {
        await exec.run(`ALTER TYPE "public"."${enumName}" ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}'`);
      } catch (err) {
        if (!isAlreadyExists(err)) throw err;
      }
    }
  }
  // Which values were genuinely new is read back rather than inferred, so the
  // report says what the database now holds and not what was attempted.
  const enumRows = await exec.rows<{ typname: string; enumlabel: string }>(
    `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid`,
  );
  const present = new Map<string, Set<string>>();
  for (const row of enumRows) {
    if (!present.has(row.typname)) present.set(row.typname, new Set());
    present.get(row.typname)!.add(row.enumlabel);
  }
  for (const [enumName, values] of snapshot.enums) {
    const have = present.get(enumName);
    if (!have) continue;
    for (const value of values) if (!have.has(value)) report.drift.push({ kind: "missing_column", object: `${enumName}.${value}`, detail: "enum value could not be added" });
  }

  const columnRows = await exec.rows<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const live = new Map<string, Set<string>>();
  for (const row of columnRows) {
    if (!live.has(row.table_name)) live.set(row.table_name, new Set());
    live.get(row.table_name)!.add(row.column_name);
  }

  for (const [table, specs] of snapshot.columns) {
    const existing = live.get(table);
    if (!existing) {
      report.drift.push({ kind: "missing_table", object: table, detail: "table absent after migration replay" });
      continue;
    }
    const missing = specs.filter((s) => !existing.has(s.name));
    if (missing.length === 0) continue;
    const [{ empty }] = await exec.rows<{ empty: boolean }>(`SELECT NOT EXISTS (SELECT 1 FROM "${table}" LIMIT 1) AS empty`);
    for (const spec of missing) {
      const { sql: statement, relaxed } = addColumnStatement(table, spec, Boolean(empty));
      await exec.run(statement);
      report.columnsAdded.push(`${table}.${spec.name}`);
      if (relaxed) {
        report.drift.push({
          kind: "nullable_column",
          object: `${table}.${spec.name}`,
          detail: "added without NOT NULL because the table already holds rows and the column has no default",
        });
      }
    }
  }

  for (const [table, specs] of snapshot.columns) {
    const existing = live.get(table);
    if (!existing) continue;
    const wanted = new Set(specs.map((s) => s.name));
    for (const column of existing) {
      if (!wanted.has(column)) report.drift.push({ kind: "extra_column", object: `${table}.${column}`, detail: "present in the database, absent from the schema; left untouched" });
    }
  }
}

/** True when the report describes a database that matches the schema. */
export function schemaMatches(report: SchemaReport): boolean {
  return report.drift.every((d) => d.kind === "extra_column");
}
