import { handle } from "@server/core/api";
import { importantAlerts } from "@server/ai/agents/reporting";
export const GET = handle({ permission: "case:read" }, async () => ({ alerts: await importantAlerts() }));
