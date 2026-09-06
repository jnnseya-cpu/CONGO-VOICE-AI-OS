import { detectBlockedCases } from "@/lib/ai/agents/workflow";

detectBlockedCases()
  .then((b) => {
    console.log(`Rappels envoyés pour ${b.length} cas.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
