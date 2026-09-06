/**
 * Signed, short-lived media endpoint used by <Play>.
 *
 * Telephony providers fetch audio anonymously, so the URL carries an expiring HMAC instead
 * of a session cookie. Nothing else is reachable here: only the file id named in the token.
 */
import { storage } from "@server/core/storage";
import { readMediaFile, verifyMediaToken } from "@server/channels/media";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");
  if (!verifyMediaToken(id, token)) return new Response("forbidden", { status: 403 });
  const file = await readMediaFile(id);
  if (!file) return new Response("not found", { status: 404 });
  const data = await storage().get(file.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
