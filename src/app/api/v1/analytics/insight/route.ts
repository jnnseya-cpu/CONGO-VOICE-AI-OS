import { handle } from "@server/core/api";
import { insightOfTheDay } from "@server/ai/agents/reporting";
export const GET = handle({ permission: "dashboard:gov" }, async () => ({ insight: await insightOfTheDay() }));
