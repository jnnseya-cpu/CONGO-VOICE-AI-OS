import { eq } from "drizzle-orm";
import { handle } from "@/lib/core/api";
import { forbidden, notFound } from "@/lib/core/errors";
import { hasPermission } from "@/lib/core/rbac";
import { storage } from "@/lib/core/storage";
import { schema } from "@/lib/db/client";

/** Streams a stored file to its owner or to officers/admins. */
export const GET = handle<{ id: string }>({ auth: true }, async ({ db, user, params }) => {
  const [f] = await db.select().from(schema.files).where(eq(schema.files.id, params.id));
  if (!f) throw notFound();
  if (f.userId !== user.userId && !hasPermission(user.role, "case:read")) throw forbidden();
  const data = await storage().get(f.storageKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": f.mimeType, "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
});
