import { handle } from "@/lib/core/api";
import { aiGateway } from "@/lib/ai/gateway";
import { env } from "@/lib/core/env";

/** Internal platform status: which capability chains are active (internal keys only). */
export const GET = handle({ permission: "dashboard:admin" }, async () => ({
  ai: await aiGateway().status(),
  database: env.databaseUrl ? "postgresql" : "embedded",
  storage: env.storage.driver,
  notifications: { sms: env.notifications.smsProvider, whatsapp: env.notifications.whatsappProvider, email: env.notifications.emailProvider },
  version: process.env.npm_package_version ?? "0.1.0",
}));
