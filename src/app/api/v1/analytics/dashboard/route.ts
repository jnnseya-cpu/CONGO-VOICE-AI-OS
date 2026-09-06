import { handle } from "@server/core/api";
import { commandStats } from "@server/ai/agents/reporting";
export const GET = handle({ permission: "dashboard:gov" }, async () => commandStats());
