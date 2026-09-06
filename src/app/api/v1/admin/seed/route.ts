import { handle } from "@server/core/api";
import { seed } from "@server/db/seed";

/** Loads demo data into an empty database (admin only). */
export const POST = handle({ permission: "admin:config" }, async () => seed());
