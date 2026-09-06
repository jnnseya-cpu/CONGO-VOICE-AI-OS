import { handle } from "@server/core/api";
import { languageProficiency } from "@server/ai/agents/learning";
export const GET = handle({ permission: "language:review" }, async () => ({ languages: await languageProficiency() }));
