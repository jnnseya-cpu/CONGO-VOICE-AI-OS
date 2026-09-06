import { handle } from "@/lib/core/api";
import { commandStats } from "@/lib/ai/agents/reporting";
export const GET = handle({ permission: "dashboard:gov" }, async () => commandStats());
