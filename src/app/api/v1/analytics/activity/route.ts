import { handle } from "@/lib/core/api";
import { recentActivity } from "@/lib/ai/agents/reporting";
import type { ModuleType } from "@/lib/db/schema";
export const GET = handle({ permission: "case:read" }, async ({ req }) => ({ activity: await recentActivity(Number(req.nextUrl.searchParams.get("limit") ?? 10), (req.nextUrl.searchParams.get("module") as ModuleType | null) ?? undefined) }));
