import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, paging } from "@server/core/api";
import { IdempotencyConflict, requestHash, withIdempotency } from "@server/core/idempotency";
import { ApiError, badRequest } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { isAllowedMime, kindFromMime, storeUpload } from "@server/core/storage";
import { IMAGE_UNREADABLE, needsJpegConversion, normaliseImage } from "@server/core/images";
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
 * `audio` (voice note), `images` (photos/videos, repeated) and text fields.
 *
 * `images[]` is accepted as well, because that is the spelling the API
 * documentation published and an integrator may already be sending it. A
 * photograph arriving under any *other* field name is refused rather than
 * ignored: it was dropped silently before, and the answer then came from the
 * text alone while naming a crop disease and a confidence — a farmer reading
 * that has no way to know their photograph never reached the service.
 */
export const POST = handle({ permission: "interaction:create", limit: "ai" }, async ({ req, db, user, json, traceId }) => {
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
    const IMAGE_FIELDS = ["images", "images[]"];
    const KNOWN_FIELDS = new Set([...IMAGE_FIELDS, "audio", "text", "module", "province", "wantsAudio"]);
    for (const [name, value] of form.entries()) {
      if (value instanceof File && value.size > 0 && !KNOWN_FIELDS.has(name)) {
        throw badRequest(`Pièce jointe envoyée sous un nom de champ inconnu (« ${name} »). Utilisez « images » pour une photo et « audio » pour un enregistrement.`);
      }
    }
    const imageEntries = IMAGE_FIELDS.flatMap((field) => form.getAll(field));
    for (const entry of imageEntries) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      const declared = entry.type.split(";")[0];
      const raw = Buffer.from(await entry.arrayBuffer());

      /**
       * A photograph is normalised before anything else looks at it.
       *
       * The camera on the phone in the citizen's hand saves HEIC, no vision
       * provider reads HEIC, and refusing it told a farmer his own camera's
       * format was "non pris en charge" — which is true and useless. Converting
       * here means the file that is stored, shown to a worker and sent to a
       * model is the same JPEG.
       */
      let data = raw;
      let mime = declared;
      if (declared.startsWith("image/") || needsJpegConversion(raw, declared)) {
        try {
          const normalised = await normaliseImage(raw, declared || "image/jpeg");
          data = normalised.data;
          mime = normalised.mimeType;
        } catch (err) {
          console.warn("[interactions] a photograph could not be decoded", err instanceof Error ? err.message : err);
          throw badRequest(IMAGE_UNREADABLE[user.language] ?? IMAGE_UNREADABLE.fr);
        }
      }

      if (!isAllowedMime(mime) || (!mime.startsWith("image/") && !mime.startsWith("video/"))) {
        throw badRequest(IMAGE_UNREADABLE[user.language] ?? IMAGE_UNREADABLE.fr);
      }
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

  const run = () =>
    runInteraction({
      user: { userId: user.userId, role: user.role, language: user.language, province: user.province },
      moduleHint: moduleHint ?? null,
      text: text ?? null,
      audio,
      images: images.filter((i) => i.data.length > 0 || true),
      province: province ?? null,
      wantsAudio,
      traceId,
    });

  /**
   * One tap, one turn.
   *
   * The channel route for a queued offline turn has always honoured
   * `Idempotency-Key`; this one — the route the application itself posts to, and
   * the one the API documentation gives integrators — did not. So a double tap
   * on a slow connection, or a client retry after a timeout, produced two
   * interactions. For an ordinary question that is noise. For a danger sign it
   * is two critical cases and two people alerted to one child, which is how a
   * queue stops being trusted.
   *
   * Same key and same request: the stored answer comes back, and the pipeline
   * does not run twice. Same key and a different request: refused, because that
   * is a client bug and silently answering the wrong one is worse.
   */
  const key = req.headers.get("idempotency-key");
  if (!key) return run();
  /*
   * The hash is what makes "same key, different question" detectable. It covers
   * what the turn is about rather than the raw bytes: a photograph can be
   * hundreds of kilobytes, and its size and count are enough to tell two
   * different submissions apart.
   */
  const fingerprint = requestHash({
    text: text ?? null,
    module: moduleHint ?? null,
    province: province ?? null,
    wantsAudio,
    audioBytes: audio?.data.length ?? 0,
    imageBytes: images.map((i) => i.data.length),
  });
  try {
    const { result } = await withIdempotency(key, user.userId, run, { requestHash: fingerprint });
    return result;
  } catch (err) {
    if (err instanceof IdempotencyConflict) {
      throw new ApiError(409, "Cette demande a déjà été envoyée. Attendez la réponse plutôt que de réessayer.", "conflict");
    }
    throw err;
  }
});

export const GET = handle({ permission: "interaction:read_own", registered: true }, async ({ req, db, user }) => {
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
