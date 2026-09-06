import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { schema } from "@/lib/db/client";
import { renderTemplate } from "@/lib/core/notifications";
import { NOTIFICATION_TEMPLATES } from "@/lib/db/reference/notification-templates";

/** The template catalogue. `?key=…&language=…`, or `?preview=key&vars={}` to render one. */
export const GET = handle({ permission: "admin:config" }, async ({ req, db }) => {
  const q = req.nextUrl.searchParams;
  const preview = q.get("preview");
  if (preview) {
    let vars: Record<string, unknown> = {};
    try {
      vars = JSON.parse(q.get("vars") ?? "{}") as Record<string, unknown>;
    } catch {
      vars = {};
    }
    const rendered = await renderTemplate(preview, (q.get("language") ?? "fr") as "fr", vars);
    return { preview: rendered };
  }
  const rows = await db
    .select()
    .from(schema.notificationTemplates)
    .where(and(q.get("key") ? eq(schema.notificationTemplates.key, q.get("key") as string) : undefined))
    .orderBy(schema.notificationTemplates.key, schema.notificationTemplates.language);
  return { templates: rows, catalogueKeys: NOTIFICATION_TEMPLATES.map((t) => ({ key: t.key, module: t.module, sensitivity: t.sensitivity })) };
});

const Create = z.object({
  key: z.string().min(2).max(96),
  channel: z.enum(["in_app", "sms", "whatsapp", "email"]).default("sms"),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]),
  module: z.enum(["health", "agriculture", "education", "general"]).default("general"),
  sensitivity: z.enum(["normal", "sensitive"]).default("normal"),
  riskLevel: z.string().max(16).optional(),
  title: z.string().max(240).optional(),
  body: z.string().min(2),
  status: z.enum(["draft", "review", "approved", "canary", "active", "retired"]).default("draft"),
});

/** Create a new template version. New wording starts as a draft and must be approved. */
export const POST = handle({ permission: "admin:config" }, async ({ db, user, json, ip }) => {
  const body = await json(Create);
  const [previous] = await db
    .select()
    .from(schema.notificationTemplates)
    .where(and(eq(schema.notificationTemplates.key, body.key), eq(schema.notificationTemplates.language, body.language), eq(schema.notificationTemplates.channel, body.channel)))
    .orderBy(desc(schema.notificationTemplates.version))
    .limit(1);
  const [row] = await db
    .insert(schema.notificationTemplates)
    .values({ ...body, riskLevel: body.riskLevel ?? null, title: body.title ?? null, version: (previous?.version ?? 0) + 1, approvedBy: body.status === "approved" ? user.userId : null })
    .returning();
  await audit({ action: "notification.template_created", actorUserId: user.userId, actorRole: user.role, entityType: "notification_template", entityId: row.id, before: previous?.body ?? null, after: { key: row.key, language: row.language, version: row.version, status: row.status }, ip });
  return { template: row };
});
