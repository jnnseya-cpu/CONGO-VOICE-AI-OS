/**
 * Shared loading and scoping helpers for the case routes.
 * Not a route: Next.js only exposes `route.ts` files.
 */
import { eq } from "drizzle-orm";
import { forbidden, notFound } from "@/lib/core/errors";
import { moduleScopeFor } from "@/lib/core/rbac";
import { schema, type Database } from "@/lib/db/client";
import type { Role } from "@/lib/db/schema";

/** Load a case and refuse it when the caller's role does not cover its module. */
export async function loadCaseScoped(db: Database, id: string, role: Role) {
  const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
  if (!c) throw notFound();
  const scope = moduleScopeFor(role);
  if (scope && !scope.includes(c.module)) throw forbidden();
  return c;
}
