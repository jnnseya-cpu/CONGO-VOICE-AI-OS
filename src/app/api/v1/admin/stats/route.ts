import { handle } from "@server/core/api";
import { adminStats } from "@server/ai/agents/reporting";
export const GET = handle({ permission: "dashboard:admin" }, async () => adminStats());
