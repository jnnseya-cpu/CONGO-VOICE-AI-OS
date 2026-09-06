import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@server/core/api";
import { badRequest } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { isAllowedMime, kindFromMime, storeUpload } from "@server/core/storage";
import { env } from "@server/core/env";
import { schema } from "@server/db/client";
import { runInteraction } from "@server/ai/agents/orchestrator";
import type { ModuleType } from "@server/db/schema";

const Json = z.object({
  text: z.string().max(4000).optional(),
  module: z.enum(["health", "agriculture", "education", "general"]).optional(),
  province: z.string().max(120).optional(),
  wantsAudio: z.boolean().optional(),
  clientKey: z.string().max(120).optional(),
});

/**
 * Create and process an interaction. Accepts JSON (text) or multipart/form-data with
 * `audio` (voice note), `images[]` (photos/videos) and text fields.
 */
export const POST = handle({ permission: "interaction:create", limit: "ai" }, async ({ req, db, user, json }) => {
  const contentType = req.headers.get("content-type") ?? "";
  let text: string | undefined;
  let moduleHint: ModuleType | undefined;
  let province: string | undefined;
  let wantsAudio = true;
  let audio: { data: Buffer; mimeType: string } | null = null;
  const images: Array<{ data: Buffer; mimeType: string; fileId: string }> = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    text = (form.get("text") as string | null) ?? undefined;
    const m = form.get("module") as string | null;
    moduleHint = m && ["health", "agriculture", "education", "general"].includes(m) ? (m as ModuleType) : undefined;
    province = (form.get("province") as string | null) ?? undefined;
    wantsAudio = form.get("wantsAudio") !== "false";
    const a = form.get("audio");
    if (a instanceof File && a.size > 0) {
      const mime = (a.type || "audio/webm").split(";")[0];
      if (!mime.startsWith("audio/") && !mime.startsWith("video/")) throw badRequest("Format audio non pris en charge");
      if (a.size > env.storage.maxUploadBytes) throw badRequest("Fichier audio trop volumineux");
      audio = { data: Buffer.from(await a.arrayBuffer()), mimeType: mime };
    }
    for (const entry of form.getAll("images")) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      const mime = entry.type.split(";")[0];
      if (!isAllowedMime(mime) || (!mime.startsWith("image/") && !mime.startsWith("video/"))) throw badRequest(`Format non pris en charge : ${mime}`);
      const data = Buffer.from(await entry.arrayBuffer());
      const stored = await storeUpload(data, mime, "evidence");
      const [f] = await db.insert(schema.files).values({ userId: user.userId, kind: kindFromMime(mime), storageKey: stored.key, mimeType: mime, sizeBytes: stored.sizeBytes, sha256: stored.sha256 }).returning();
      if (mime.startsWith("image/")) images.push({ data, mimeType: mime, fileId: f.id });
      else images.push({ data: Buffer.alloc(0), mimeType: mime, fileId: f.id }); // videos stored as evidence, frames not analysed yet
    }
  } else {
    const body = await json(Json);
    text = body.text;
    moduleHint = body.module;
    province = body.province;
    wantsAudio = body.wantsAudio ?? true;
  }
  if (!text?.trim() && !audio && images.length === 0) throw badRequest("Envoyez un message vocal, un texte ou une image");

  const result = await runInteraction({
    user: { userId: user.userId, role: user.role, language: user.language, province: user.province },
    moduleHint: moduleHint ?? null,
    text: text ?? null,
    audio,
    images: images.filter((i) => i.data.length > 0 || true),
    province: province ?? null,
    wantsAudio,
  });
  return result;
});

export const GET = handle({ permission: "interaction:read_own" }, async ({ req, db, user }) => {
  const { limit, offset } = paging(req);
  const moduleFilter = req.nextUrl.searchParams.get("module") as ModuleType | null;
  const all = hasPermission(user.role, "interaction:read_all") && req.nextUrl.searchParams.get("scope") === "all";
  const rows = await db
    .select({ id: schema.interactions.id, createdAt: schema.interactions.createdAt, module: schema.interactions.module, channel: schema.interactions.channel, language: schema.interactions.language, province: schema.interactions.province, intent: schema.interactions.intent, transcript: schema.interactions.transcript, response: schema.interactions.response, summary: schema.interactions.summary, severity: schema.interactions.severity, confidence: schema.interactions.confidence, escalated: schema.interactions.escalationRequired, status: schema.interactions.status, caseId: schema.interactions.caseId })
    .from(schema.interactions)
    .where(and(all ? undefined : eq(schema.interactions.userId, user.userId), moduleFilter ? eq(schema.interactions.module, moduleFilter) : undefined))
    .orderBy(desc(schema.interactions.createdAt))
    .limit(limit)
    .offset(offset);
  return { interactions: rows };
});
