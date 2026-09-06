import { NextResponse } from "next/server";
import { getDb } from "@server/db/client";
import { sql } from "drizzle-orm";

/** Liveness/readiness probe. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: "degraded", error: err instanceof Error ? err.message : "db" }, { status: 503 });
  }
}
