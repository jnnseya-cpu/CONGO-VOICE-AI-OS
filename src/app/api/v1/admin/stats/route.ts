import { handle } from "@/lib/core/api";
import { adminStats } from "@/lib/ai/agents/reporting";
export const GET = handle({ permission: "dashboard:admin" }, async () => adminStats());
