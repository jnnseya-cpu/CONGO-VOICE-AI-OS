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

  /** 32-byte key (hex or base64) protecting second-factor seeds and stored recordings. */
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY,

  /**
   * Number of proxies in front of the app that are ours. The client address is
   * read that many hops from the right of X-Forwarded-For; anything further
   * left was written by the caller and cannot be trusted.
   */
  trustedProxyHops: num("TRUSTED_PROXY_HOPS", 1),

  /** Largest JSON body a route will read, before any handler sees it. */
  maxJsonBodyBytes: num("MAX_JSON_BODY_BYTES", 1024 * 1024),

  auth: {
    /** Failed sign-ins before an account or address is locked out. */
    maxFailures: num("AUTH_MAX_FAILURES", 5),
    /** How long a lockout lasts, doubling for each further failed burst. */
    lockoutSeconds: num("AUTH_LOCKOUT_SECONDS", 900),
    /** Work factor for PIN hashing. 2^17 keeps a 6-digit PIN expensive to grind. */
    scryptCost: num("AUTH_SCRYPT_COST", 1 << 17),
    /** PINs too common to allow, whatever the length. */
    forbiddenPins: (process.env.AUTH_FORBIDDEN_PINS ?? "0000,1111,1234,4321,123456,000000,111111,654321,112233,121212")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  },

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
    /** Sign-in and enrolment: deliberately far below the general ceiling. */
    maxAuthRequests: num("RATE_LIMIT_MAX_AUTH_REQUESTS", 10),
  },
} as const;

export type Env = typeof env;
