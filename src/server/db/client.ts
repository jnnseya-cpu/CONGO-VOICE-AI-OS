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

async function connect(): Promise<Database> {
  if (env.databaseUrl) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });
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
