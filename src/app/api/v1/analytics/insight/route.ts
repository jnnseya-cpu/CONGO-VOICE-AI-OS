import { handle } from "@/lib/core/api";
import { insightOfTheDay } from "@/lib/ai/agents/reporting";
export const GET = handle({ permission: "dashboard:gov" }, async () => ({ insight: await insightOfTheDay() }));
