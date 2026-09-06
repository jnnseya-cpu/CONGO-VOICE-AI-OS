import { handle } from "@/lib/core/api";
import { seed } from "@/lib/db/seed";

/** Loads demo data into an empty database (admin only). */
export const POST = handle({ permission: "admin:config" }, async () => seed());
