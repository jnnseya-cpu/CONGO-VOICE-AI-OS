/**
 * Uniform API handler wrapper. Every /api/v1 route goes through `handle()` which provides:
 *  authentication, permission check, rate limiting, request logging, error handling
 *  and an audit hook — the six guarantees required for every platform API.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, badRequest, forbidden, tooMany, unauthorized } from "./errors";
import { sessionFromRequest, type Session } from "./auth";
import { hasPermission, type Permission } from "./rbac";
import { checkRateLimit } from "./rate-limit";
import { env } from "./env";
import { getDb, schema, type Database } from "@/lib/db/client";

export interface ApiContext<P = Record<string, string>> {
  req: NextRequest;
  session: Session | null;
  /** Non-null when the route requires auth. */
  user: Session;
  db: Database;
  params: P;
  ip: string | null;
  json<T>(schema: ZodType<T>): Promise<T>;
}

export interface HandleOptions {
  /** Permission required. Omit for public routes. */
  permission?: Permission;
  /** Require a session but no specific permission. */
  auth?: boolean;
  /** Rate-limit class: AI routes are more expensive. */
  limit?: "default" | "ai" | "none";
}

type RouteParams = { params: Promise<Record<string, string>> };
type Handler<P> = (ctx: ApiContext<P>) => Promise<Response | object>;

export function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export function handle<P = Record<string, string>>(opts: HandleOptions, fn: Handler<P>) {
  return async (req: NextRequest, route?: RouteParams): Promise<Response> => {
    const started = Date.now();
    const ip = clientIp(req);
    const session = sessionFromRequest(req);
    let status = 200;
    let errorMessage: string | undefined;
    let db: Database | undefined;

    try {
      db = await getDb();
      if ((opts.auth || opts.permission) && !session) throw unauthorized();
      if (opts.permission && session && !hasPermission(session.role, opts.permission)) throw forbidden();

      const limitClass = opts.limit ?? "default";
      if (limitClass !== "none") {
        const key = `${limitClass}:${session?.userId ?? ip ?? "anon"}`;
        const max = limitClass === "ai" ? env.rateLimit.maxAiRequests : env.rateLimit.maxRequests;
        const rl = checkRateLimit(key, max, env.rateLimit.windowSeconds);
        if (!rl.allowed) throw tooMany();
      }

      const params = (route ? await route.params : {}) as P;
      const ctx: ApiContext<P> = {
        req,
        session,
        user: session as Session,
        db,
        params,
        ip,
        async json<T>(zschema: ZodType<T>): Promise<T> {
          let body: unknown;
          try {
            body = await req.json();
          } catch {
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
      if (status >= 500) console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, err);
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

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) return badRequest("Validation échouée", flattenZod(err));
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
