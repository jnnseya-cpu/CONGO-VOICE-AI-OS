/**
 * Central, validated runtime configuration.
 * Secrets never leave the server: nothing in this file is imported by client components.
 */
import "server-only";

function flag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test" || flag("VITEST"),

  /** Where uploads and the embedded database live when no cloud services are configured. */
  dataDir: process.env.DATA_DIR ?? "./data",

  /** PostgreSQL connection string. When absent, an embedded PGlite database is used. */
  databaseUrl: process.env.DATABASE_URL,
  /** Force an in-memory database (tests). */
  pgliteMemory: flag("PGLITE_MEMORY"),

  /** Session signing secret. A random one is generated per process in development. */
  sessionSecret: process.env.SESSION_SECRET,
  sessionTtlHours: num("SESSION_TTL_HOURS", 24 * 14),

  /**
   * AI settings that are not provider selection. Which vendor answers a call is
   * decided in one place only — the gateway's registry and its `AI_*_ORDER`
   * chains. Duplicating that choice here produced two competing answers, so the
   * provider fields were removed rather than kept in sync.
   */
  ai: {
    llmModel: process.env.AI_LLM_MODEL ?? "claude-opus-5",
    llmEffort: (process.env.AI_LLM_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",
    lowConfidenceThreshold: num("AI_LOW_CONFIDENCE_THRESHOLD", 0.55),
  },

  storage: {
    driver: process.env.STORAGE_DRIVER ?? "local", // local | gcs
    gcsBucket: process.env.GCS_BUCKET,
    maxUploadBytes: num("MAX_UPLOAD_BYTES", 25 * 1024 * 1024),
  },

  notifications: {
    smsProvider: process.env.SMS_PROVIDER ?? "log", // log | twilio | africastalking
    whatsappProvider: process.env.WHATSAPP_PROVIDER ?? "log",
    emailProvider: process.env.EMAIL_PROVIDER ?? "log",
    adminEmail: process.env.ADMIN_ALERT_EMAIL,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioFrom: process.env.TWILIO_FROM,
  },

  rateLimit: {
    windowSeconds: num("RATE_LIMIT_WINDOW_SECONDS", 60),
    maxRequests: num("RATE_LIMIT_MAX_REQUESTS", 120),
    maxAiRequests: num("RATE_LIMIT_MAX_AI_REQUESTS", 30),
  },
} as const;

export type Env = typeof env;
