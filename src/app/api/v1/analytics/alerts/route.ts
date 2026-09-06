import { handle } from "@/lib/core/api";
import { importantAlerts } from "@/lib/ai/agents/reporting";
export const GET = handle({ permission: "case:read" }, async () => ({ alerts: await importantAlerts() }));
