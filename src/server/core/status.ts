import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@server/db/client";

/** Cheap liveness probe for the status badge in the top bar. Never throws. */
export async function systemOk(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
