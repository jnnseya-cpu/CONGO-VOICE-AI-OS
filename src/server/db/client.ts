/**
 * Database client.
 *
 * - `DATABASE_URL` set   → node-postgres pool against managed PostgreSQL (production).
 * - otherwise            → embedded PGlite (WASM PostgreSQL) stored under DATA_DIR/pglite,
 *                          or in memory when PGLITE_MEMORY=1 (tests).
 *
 * Migrations in ./drizzle are applied automatically on first use so the platform
 * boots from a clean checkout without any manual database step.
 */
import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { env } from "@server/core/env";

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

type Holder = { db?: Database; ready?: Promise<Database> };

// Survive Next.js dev hot reloads without opening many PGlite instances.
const globalHolder = globalThis as unknown as { __cvaiDb?: Holder };
const holder: Holder = (globalHolder.__cvaiDb ??= {});

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

/** TLS parameters pg would otherwise interpret for us. See `databaseTls`. */
const SSL_URL_PARAMS = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslnegotiation",
  "uselibpqcompat",
];

/**
 * The connection string with every TLS parameter removed.
 *
 * `new Pool({ connectionString, ssl })` looks like it takes both. It does not:
 * pg assigns the parsed connection string *over* the config it was given, so a
 * single `sslmode=` in the URL silently discards the `ssl` object — including a
 * CA certificate — and leaves whatever pg inferred instead. Stripping the
 * parameters is what makes the explicit configuration below authoritative, and
 * it means a deployment whose stored URL still carries an old `sslmode` keeps
 * working rather than failing on a value nobody remembers setting.
 */
export function withoutTlsParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of SSL_URL_PARAMS) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    // Not a parseable URL: hand it back untouched rather than lose a
    // connection string we do not understand.
    return url;
  }
}

export type DatabaseTls = false | { ca: string; rejectUnauthorized: true; checkServerIdentity: () => undefined } | { rejectUnauthorized: false };

let tlsWarned = false;

/**
 * How to trust the database's certificate, decided here rather than inferred
 * from a URL by a library whose interpretation of `sslmode=require` changed
 * under us — it now means full verification where libpq only meant encryption.
 *
 * - `DATABASE_CA_CERT` set → verify the chain against that CA, and skip the
 *   hostname check. Managed PostgreSQL signs its certificate with a private
 *   per-instance CA and names the *instance* in it, while the platform connects
 *   to a private address, so hostname matching would fail on a certificate that
 *   is entirely correct. The chain is what proves we reached our own database.
 * - `DATABASE_SSL=disable` → no TLS. For a PostgreSQL on the same host that
 *   serves no certificate at all.
 * - otherwise → encrypt without verifying, and say so once. Honest but weaker:
 *   it protects the traffic and proves nothing about who answered.
 */
export function databaseTls(
  // Taken as values rather than read from an object, so each variable name stays
  // visible in the source as a literal lookup. The environment contract test
  // scans for those to check that .env.example advertises nothing the code
  // ignores, and reading them through a parameter hides them from it.
  rawCa: string | undefined = process.env.DATABASE_CA_CERT,
  sslSetting: string | undefined = process.env.DATABASE_SSL,
): DatabaseTls {
  if (sslSetting?.trim().toLowerCase() === "disable") return false;

  const ca = rawCa?.trim();
  if (ca) {
    return { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined };
  }

  if (!tlsWarned) {
    tlsWarned = true;
    console.warn(
      "[db] DATABASE_CA_CERT is not set: the connection is encrypted but the server's " +
        "certificate is not verified. Supply the instance's CA to authenticate it.",
    );
  }
  return { rejectUnauthorized: false };
}

/** Test seam: the warning above is once per process, which a test has to reset. */
export function resetTlsWarningForTests() {
  tlsWarned = false;
}

async function connect(): Promise<Database> {
  if (env.databaseUrl) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({
      connectionString: withoutTlsParams(env.databaseUrl),
      ssl: databaseTls(),
      max: 10,
    });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client: InstanceType<typeof PGlite>;
  if (env.pgliteMemory || env.isTest) {
    client = new PGlite();
  } else {
    const dir = path.resolve(process.cwd(), env.dataDir, "pglite");
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

/** Returns the shared, migrated database handle. */
export function getDb(): Promise<Database> {
  if (holder.db) return Promise.resolve(holder.db);
  if (!holder.ready) {
    holder.ready = connect().then((db) => {
      holder.db = db;
      return db;
    });
    holder.ready.catch(() => {
      holder.ready = undefined;
    });
  }
  return holder.ready;
}

/** Test helper: drop the cached handle so the next call opens a fresh in-memory database. */
export function resetDbForTests() {
  holder.db = undefined;
  holder.ready = undefined;
}

export { schema };
