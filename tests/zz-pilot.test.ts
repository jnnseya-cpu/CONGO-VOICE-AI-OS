import { beforeAll, describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resetDbForTests, getDb } from "@server/db/client";
import { runInteraction } from "@server/ai/agents/orchestrator";

describe("production stage", () => {
  beforeAll(async () => {
    process.env.DEPLOYMENT_STAGE = "pilot";
    resetDbForTests();
    await getDb();
  });
  it("fever question at pilot stage", async () => {
    const out = await runInteraction({ user: null, text: "Mon enfant de 3 ans a de la fièvre depuis deux jours", wantsAudio: false });
    writeFileSync("/tmp/claude-0/pilot.txt", `status=${out.status} module=${out.module} risk=${out.answer?.risk?.level} esc=${out.answer?.escalation?.required}\n${out.responseText}`);
  });
});
