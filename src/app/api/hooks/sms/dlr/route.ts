/**
 * SMS delivery reports. The provider posts the message id and its final status; the
 * matching notification row gets `deliveredAt` so "sent" and "delivered" stay distinct.
 */
import { recordDeliveryReport } from "@/lib/channels/sms";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";
  let get: (key: string) => string | null;
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    get = (key) => (typeof body[key] === "string" ? (body[key] as string) : null);
  } else {
    const form = new URLSearchParams(await req.text());
    get = (key) => form.get(key);
  }
  const id = get("id") ?? get("MessageSid") ?? get("messageId");
  const status = get("status") ?? get("MessageStatus") ?? "";
  if (!id || !status) return new Response("OK", { status: 200 });
  const matched = await recordDeliveryReport(id, status);
  return Response.json({ matched });
}
