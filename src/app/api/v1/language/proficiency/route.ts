import { handle } from "@/lib/core/api";
import { languageProficiency } from "@/lib/ai/agents/learning";
export const GET = handle({ permission: "language:review" }, async () => ({ languages: await languageProficiency() }));
