export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (m = "Requête invalide", details?: unknown) => new ApiError(400, m, "bad_request", details);
export const unauthorized = (m = "Authentification requise") => new ApiError(401, m, "unauthorized");
export const forbidden = (m = "Accès refusé") => new ApiError(403, m, "forbidden");
export const notFound = (m = "Introuvable") => new ApiError(404, m, "not_found");
export const tooMany = (m = "Trop de requêtes, réessayez dans un instant") => new ApiError(429, m, "rate_limited");

/**
 * Postgres codes that mean "the client sent nonsense", not "the server broke".
 *
 * `GET /api/v1/cases/not-a-uuid` reached the query, Postgres rejected the cast
 * with 22P02, and the wrapper turned that into a 500. Three things were wrong
 * with that: a malformed path parameter is the caller's mistake and belongs in
 * the 4xx range; the difference between a 500 here and a 404 for a well-formed
 * unknown id tells a scanner which identifiers are the right shape; and every
 * bot probing a path produced a 500 in the logs and an error row in
 * api_request_logs, which is how a real 500 goes unnoticed.
 */
const CLIENT_INPUT_CODES: ReadonlySet<string> = new Set([
  "22P02", // invalid_text_representation — a malformed uuid, enum or number
  "22003", // numeric_value_out_of_range
  "22007", // invalid_datetime_format
  "22008", // datetime_field_overflow
]);

/** Walks the cause chain: both drivers wrap the server error. */
function postgresCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current !== null && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause ?? null;
  }
  return null;
}

/** True when the database rejected the request because the input was malformed. */
export function isMalformedInput(err: unknown): boolean {
  const code = postgresCode(err);
  return code !== null && CLIENT_INPUT_CODES.has(code);
}
