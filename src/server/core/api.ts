/**
 * Uniform API handler wrapper. Every /api/v1 route goes through `handle()` which provides:
 *  authentication, permission check, rate limiting, request logging, error handling
 *  and an audit hook — the six guarantees required for every platform API.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ApiError, badRequest, forbidden, tooMany, unauthorized, isMalformedInput } from "./errors";
import { sessionFromRequest, type Session } from "./auth";
import { hasPermission, type Permission } from "./rbac";
import { checkSharedRateLimit } from "./rate-limit";
import { env } from "./env";
import { getDb, schema, type Database } from "@server/db/client";

export interface ApiContext<P = Record<string, string>> {
  req: NextRequest;
  session: Session | null;
  /** Non-null when the route requires auth. */
  user: Session;
  db: Database;
  params: P;
  ip: string | null;
  /**
   * One identifier per request, for correlating a citizen's report with a log.
   *
   * Three tables carried a trace_id column and nothing ever wrote one, so an
   * operator holding "it failed at about four o'clock" had no way to reach the
   * request that failed. Cloud Run already stamps X-Cloud-Trace-Context on every
   * inbound request, which is the identifier Cloud Logging indexes, so that one is
   * adopted where present rather than inventing a second scheme beside it.
   */
  traceId: string;
  json<T>(schema: ZodType<T>): Promise<T>;
}

export interface HandleOptions {
  /** Permission required. Omit for public routes. */
  permission?: Permission;
  /** Require a session but no specific permission. */
  auth?: boolean;
  /**
   * Require an account somebody signed up for, not an anonymous session.
   *
   * The voice console creates an anonymous session so a citizen on a borrowed
   * phone can ask about a sick child without registering, and that must stay
   * true — asking is free. What an anonymous session must not reach is anything
   * that persists under a name or belongs to somebody else: conversation
   * history, saved cases, dashboards, reports, profile media, settings.
   *
   * Without this the two are indistinguishable to a route: both have a session,
   * both pass `auth: true`, and an anonymous visitor could read a history that
   * happens to share their session id.
   */
  registered?: boolean;
  /** Rate-limit class: AI routes are more expensive, sign-in routes far stricter. */
  limit?: "default" | "ai" | "auth" | "none";
}

type RouteParams = { params: Promise<Record<string, string>> };
type Handler<P> = (ctx: ApiContext<P>) => Promise<Response | object>;

/**
 * The caller's address, read from the right of X-Forwarded-For.
 *
 * Taking the left-most entry trusts whatever the caller wrote, which lets an
 * attacker put a new address in the header on every request and walk straight
 * past any per-address limit. Only the hops we put there ourselves can be
 * trusted, so the address is read `TRUSTED_PROXY_HOPS` positions from the end.
 */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (chain.length > 0) {
      const index = Math.max(0, chain.length - Math.max(1, env.trustedProxyHops));
      return chain[index] ?? chain[chain.length - 1];
    }
  }
  return req.headers.get("x-real-ip") ?? null;
}

export function handle<P = Record<string, string>>(opts: HandleOptions, fn: Handler<P>) {
  return async (req: NextRequest, route?: RouteParams): Promise<Response> => {
    const started = Date.now();
    const ip = clientIp(req);
    const traceId = requestTraceId(req);
    const session = sessionFromRequest(req);
    let status = 200;
    let errorMessage: string | undefined;
    let db: Database | undefined;

    try {
      db = await getDb();
      if ((opts.auth || opts.permission || opts.registered) && !session) throw unauthorized();
      if (opts.registered && session?.anonymous) {
        throw forbidden("Créez un compte pour accéder à cette partie du service. Poser une question reste libre et gratuit.");
      }
      if (opts.permission && session && !hasPermission(session.role, opts.permission)) throw forbidden();

      const limitClass = opts.limit ?? "default";
      if (limitClass !== "none") {
        // Sign-in is counted by address, not by session: there is no session yet,
        // and an attacker would otherwise get a fresh allowance per guess.
        const identity = limitClass === "auth" ? (ip ?? "anon") : (session?.userId ?? ip ?? "anon");
        const max =
          limitClass === "ai" ? env.rateLimit.maxAiRequests : limitClass === "auth" ? env.rateLimit.maxAuthRequests : env.rateLimit.maxRequests;
        const rl = await checkSharedRateLimit(db, `${limitClass}:${identity}`, max, env.rateLimit.windowSeconds);
        if (!rl.allowed) throw tooMany();

        /**
         * Provider spend is additionally capped per address.
         *
         * Keying only on the account leaves the ceiling defeatable by asking for
         * another account, which anonymous sign-in grants freely and by design.
         * See RATE_LIMIT_MAX_AI_REQUESTS_PER_IP for why the figure is set well
         * above the per-account one.
         */
        if (limitClass === "ai" && ip) {
          const perIp = await checkSharedRateLimit(db, `ai-ip:${ip}`, env.rateLimit.maxAiRequestsPerIp, env.rateLimit.windowSeconds);
          if (!perIp.allowed) {
            // Named in the logs: a shared clinic address hitting this looks
            // identical to an attack unless the refusal says which ceiling bit.
            console.warn(`[rate-limit] per-address AI ceiling reached for ${ip}`);
            throw tooMany();
          }
        }
      }

      // A session is a signed token, so the only way to withdraw one is to check
      // the account it names on every request: an epoch moved forward by logout,
      // a role change or a suspension, and a status that is no longer active.
      if (session && !session.anonymous) {
        const [account] = await db
          .select({ epoch: schema.users.sessionEpoch, status: schema.users.status, role: schema.users.role })
          .from(schema.users)
          .where(eq(schema.users.id, session.userId));
        if (!account) throw unauthorized("Session expirée");
        if (account.status !== "active") throw forbidden("Compte suspendu");
        if (account.epoch && session.iat < account.epoch.getTime()) throw unauthorized("Session révoquée");
        if (account.role !== session.role) throw unauthorized("Session révoquée");
      }

      const params = (route ? await route.params : {}) as P;
      const ctx: ApiContext<P> = {
        req,
        session,
        user: session as Session,
        db,
        params,
        ip,
        traceId,
        async json<T>(zschema: ZodType<T>): Promise<T> {
          const declared = Number(req.headers.get("content-length") ?? 0);
          if (Number.isFinite(declared) && declared > env.maxJsonBodyBytes) {
            throw new ApiError(413, "Corps de requête trop volumineux", "payload_too_large");
          }
          let body: unknown;
          try {
            const raw = await req.text();
            if (Buffer.byteLength(raw) > env.maxJsonBodyBytes) {
              throw new ApiError(413, "Corps de requête trop volumineux", "payload_too_large");
            }
            body = JSON.parse(raw);
          } catch (err) {
            if (err instanceof ApiError) throw err;
            throw badRequest("Corps JSON invalide");
          }
          const parsed = zschema.safeParse(body);
          if (!parsed.success) throw badRequest("Validation échouée", flattenZod(parsed.error));
          return parsed.data;
        },
      };

      const result = await fn(ctx);
      const res = result instanceof Response ? result : NextResponse.json(result);
      status = res.status;
      return res;
    } catch (err) {
      const apiErr = toApiError(err);
      status = apiErr.status;
      errorMessage = apiErr.message;
      if (status >= 500) console.error(`[api] ${req.method} ${req.nextUrl.pathname} trace=${traceId}`, err);
      return NextResponse.json(
        { error: { code: apiErr.code, message: apiErr.message, details: apiErr.details ?? undefined } },
        { status },
      );
    } finally {
      const durationMs = Date.now() - started;
      if (db && !env.isTest) {
        db.insert(schema.apiRequestLogs)
          .values({
            method: req.method,
            path: req.nextUrl.pathname.slice(0, 240),
            userId: session?.userId ?? null,
            role: session?.role ?? null,
            statusCode: status,
            durationMs,
            ip,
            error: errorMessage,
          })
          .catch((e: unknown) => console.error("[api-log]", e));
      }
    }
  };
}

function flattenZod(e: ZodError) {
  return e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/**
 * The identifier for this request.
 *
 * Cloud Run's own header wins, so an application record and a Cloud Logging entry
 * name the same request. `x-request-id` is honoured next for proxies that set it,
 * and only then is one generated.
 */
export function requestTraceId(req: NextRequest): string {
  const cloud = req.headers.get("x-cloud-trace-context");
  if (cloud) return cloud.split("/")[0].slice(0, 64);
  const given = req.headers.get("x-request-id");
  if (given) return given.slice(0, 64);
  return randomUUID();
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) return badRequest("Validation échouée", flattenZod(err));
  // A malformed identifier is a bad request, not a server fault. See isMalformedInput.
  if (isMalformedInput(err)) return badRequest("Identifiant invalide");
  const message = env.isProd ? "Erreur interne" : err instanceof Error ? err.message : String(err);
  return new ApiError(500, message, "internal_error");
}

/** Paging helper for list endpoints. */
export function paging(req: NextRequest, defaults = { limit: 50, max: 200 }) {
  const url = req.nextUrl;
  const limit = Math.min(defaults.max, Math.max(1, Number(url.searchParams.get("limit") ?? defaults.limit)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  return { limit, offset };
}
