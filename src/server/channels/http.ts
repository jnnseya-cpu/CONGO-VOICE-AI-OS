/**
 * Small helpers shared by the channel-layer /api/v1 routes: they keep the platform's
 * `handle()` wrapper (auth, RBAC, rate limit, logging) while answering with the channel
 * error contract instead of the generic API envelope.
 */
import "server-only";
import type { ZodType } from "zod";
import type { LanguageCode, Role } from "@server/db/schema";
import { hasPermission } from "@server/core/rbac";
import { ChannelError, newRequestId, toChannelResponse } from "./errors";
import { getSessionById, type ChannelSession } from "./session";
import { getDb } from "@server/db/client";
import { checkSharedRateLimit } from "@server/core/rate-limit";
import { phoneLookup } from "@server/core/phone";

/**
 * How often one phone number may drive an inbound channel.
 *
 * The USSD and inbound-SMS webhooks are unauthenticated by design: the operator
 * posts form fields and no signature exists to check. They also do real work —
 * a session, a model call, an outbound SMS — so an unlimited public endpoint is
 * not only a denial-of-service surface but a way to spend the programme's
 * money and to send messages to a number the caller chooses.
 *
 * The limit is deliberately far above human speed: a USSD menu press or a text
 * message arrives once every few seconds at most, so twenty in a minute is
 * generous for a citizen and useless for a flood. The key is the blind index of
 * the number rather than the number itself, because rate-limit buckets are
 * stored and a stored bucket should not be a list of who used the service.
 *
 * Counted per channel: somebody using USSD and SMS at once is still a person.
 */
const INBOUND_PER_MINUTE = Number(process.env.INBOUND_CHANNEL_MAX_PER_MINUTE ?? 20);

export async function inboundChannelAllowed(kind: "ussd" | "sms", phone: string): Promise<boolean> {
  if (!phone) return false;
  try {
    const db = await getDb();
    const result = await checkSharedRateLimit(db, `inbound:${kind}:${phoneLookup(phone)}`, INBOUND_PER_MINUTE, 60);
    return result.allowed;
  } catch {
    // A counter that cannot be read must not stop a citizen from being answered.
    return true;
  }
}

export function requestId(req: Request): string {
  return req.headers.get("x-request-id") ?? newRequestId();
}

/** Runs a route body, converting ChannelError (and anything unexpected) to the contract. */
export async function channelGuard(
  language: LanguageCode,
  id: string,
  fn: () => Promise<Response | object>,
): Promise<Response> {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return Response.json(result, { headers: { "X-Request-Id": id } });
  } catch (err) {
    if (err instanceof ChannelError) return err.response();
    return toChannelResponse(err, language, id);
  }
}

/** Body validation that fails with VALIDATION_FAILED and the offending field paths. */
export async function parseJson<T>(req: Request, schema: ZodType<T>, language: LanguageCode, id: string): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ChannelError("VALIDATION_FAILED", { language, requestId: id, fields: ["body"] });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ChannelError("VALIDATION_FAILED", {
      language,
      requestId: id,
      fields: parsed.error.issues.map((i) => i.path.join(".")).filter(Boolean),
    });
  }
  return parsed.data;
}

export function parseForm<T>(form: FormData, schema: ZodType<T>, language: LanguageCode, id: string): T {
  const record: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") record[key] = value;
  const parsed = schema.safeParse(record);
  if (!parsed.success) {
    throw new ChannelError("VALIDATION_FAILED", {
      language,
      requestId: id,
      fields: parsed.error.issues.map((i) => i.path.join(".")).filter(Boolean),
    });
  }
  return parsed.data;
}

/**
 * Loads a session the caller is allowed to see. A session that belongs to someone else is
 * reported as NOT_FOUND rather than FORBIDDEN so that ids cannot be probed.
 */
export async function loadOwnedSession(
  sessionId: string,
  user: { userId: string; role: Role },
  language: LanguageCode,
  id: string,
): Promise<ChannelSession> {
  const session = await getSessionById(sessionId);
  if (!session) throw new ChannelError("NOT_FOUND", { language, requestId: id, fields: ["session_id"] });
  const isOwner = session.userId === user.userId;
  if (!isOwner && !hasPermission(user.role, "case:read")) {
    throw new ChannelError("NOT_FOUND", { language, requestId: id, fields: ["session_id"] });
  }
  return session;
}
