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
