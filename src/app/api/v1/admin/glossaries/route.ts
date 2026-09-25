import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";
import { resetGlossaryCache } from "@server/ai/language/glossary";

/**
 * The terminology the platform is not free to paraphrase (FR-LG-05).
 *
 * Entries are versioned like protocols and templates: a new wording is a new
 * row, nothing is edited in place, and only an entry set to `active` is
 * enforced on a citizen's answer.
 */
export const GET = handle({ permission: "admin:config" }, async ({ req, db }) => {
  const q = req.nextUrl.searchParams;
  const moduleFilter = q.get("module");
  const status = q.get("status");
  const rows = await db
    .select()
    .from(schema.glossaries)
    .where(
      and(
        moduleFilter ? eq(schema.glossaries.module, moduleFilter as "health") : undefined,
        status ? eq(schema.glossaries.status, status as "active") : undefined,
      ),
    )
    .orderBy(schema.glossaries.module, schema.glossaries.termFr, desc(schema.glossaries.version));

  // What is still waiting on a language panel, which is the number that decides
  // whether terminology is actually being enforced anywhere.
  const pending = rows.filter((r) => r.status !== "active" && r.status !== "retired").length;
  return { terms: rows, total: rows.length, awaitingApproval: pending };
});

const Upsert = z.object({
  module: z.enum(["health", "agriculture", "education", "general"]).default("general"),
  termFr: z.string().min(2).max(160),
  translations: z.record(z.enum(["ln", "kg", "sw", "lua"]), z.string().min(1).max(240)),
  variants: z.record(z.enum(["ln", "kg", "sw", "lua"]), z.array(z.string().min(1).max(240))).optional(),
  version: z.string().max(24).default("1.0.0"),
  status: z.enum(["draft", "review", "approved", "canary", "active", "retired"]).default("draft"),
  notes: z.string().max(2000).optional(),
});

/** Record a new version of a term. Approving one is an audited act, not an edit. */
export const POST = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Upsert);
  const [previous] = await db
    .select()
    .from(schema.glossaries)
    .where(and(eq(schema.glossaries.module, body.module), eq(schema.glossaries.termFr, body.termFr)))
    .orderBy(desc(schema.glossaries.createdAt))
    .limit(1);

  const [row] = await db
    .insert(schema.glossaries)
    .values({
      module: body.module,
      termFr: body.termFr,
      translations: body.translations,
      variants: body.variants ?? {},
      version: body.version,
      status: body.status,
      approvedBy: body.status === "active" || body.status === "approved" ? user.userId : null,
      notes: body.notes ?? null,
    })
    .returning();

  resetGlossaryCache();
  await audit({
    action: "glossary.version_created",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "glossary",
    entityId: row.id,
    before: previous ? { version: previous.version, status: previous.status, translations: previous.translations } : null,
    after: { termFr: row.termFr, module: row.module, version: row.version, status: row.status, translations: row.translations },
    ip,
  });
  return { term: row };
});
