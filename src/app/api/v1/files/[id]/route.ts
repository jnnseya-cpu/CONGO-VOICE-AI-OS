import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { forbidden, notFound } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { storage } from "@server/core/storage";
import { schema } from "@server/db/client";

/** Streams a stored file to its owner or to officers/admins. */
export const GET = handle<{ id: string }>({ auth: true }, async ({ db, user, params }) => {
  const [f] = await db.select().from(schema.files).where(eq(schema.files.id, params.id));
  if (!f) throw notFound();
  if (f.userId !== user.userId && !hasPermission(user.role, "case:read")) throw forbidden();
  const data = await storage().get(f.storageKey);
  /**
   * A document is downloaded, not rendered.
   *
   * Images and audio are the point of this platform and are displayed inline. A
   * PDF is the one allowlisted type that opens a viewer inside the reader's
   * browser, and the reader is usually a health worker opening somebody else's
   * attachment, so it is sent as a download instead. The filename is fixed rather
   * than echoed: an attacker-supplied name in this header is its own problem.
   */
  const inline = f.mimeType.startsWith("image/") || f.mimeType.startsWith("audio/") || f.mimeType.startsWith("video/");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": inline ? "inline" : `attachment; filename="piece-jointe-${f.id}"`,
    },
  });
});
