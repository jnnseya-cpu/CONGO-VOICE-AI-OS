/**
 * Resumable chunked upload — POST init → PUT chunks → POST complete.
 *
 * A 3G connection in Équateur drops halfway through a 5 MB video; the client resumes with
 * the same upload id and only re-sends the missing ranges. The checksum is verified before
 * the file row is created, so a truncated upload can never become evidence.
 *
 *   POST /api/v1/media/uploads            { action: "init", … }        → { upload_id }
 *   PUT  /api/v1/media/uploads            Upload-Id + Content-Range    → { received }
 *   POST /api/v1/media/uploads            { action: "complete", … }    → { file_id }
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { handle } from "@server/core/api";
import { env } from "@server/core/env";
import { schema } from "@server/db/client";
import { isAllowedMime, kindFromMime, storage, storeUpload } from "@server/core/storage";
import { ChannelError } from "@server/channels/errors";
import { channelGuard, parseJson, requestId } from "@server/channels/http";

const CHUNK_PREFIX = "resumable";
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOMMENDED_CHUNK_BYTES = 256 * 1024;

interface Manifest {
  uploadId: string;
  userId: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  fileName: string | null;
  chunks: Array<{ start: number; end: number }>;
  createdAt: string;
}

const InitBody = z.object({
  action: z.literal("init"),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(64).optional(),
  fileName: z.string().max(200).optional(),
});

const CompleteBody = z.object({
  action: z.literal("complete"),
  upload_id: z.string().min(8).max(64),
  sha256: z.string().length(64).optional(),
  interactionId: z.string().uuid().optional(),
});

const Body = z.discriminatedUnion("action", [InitBody, CompleteBody]);

const manifestKey = (uploadId: string) => `${CHUNK_PREFIX}/${uploadId}/manifest.json`;
const chunkKey = (uploadId: string, start: number) => `${CHUNK_PREFIX}/${uploadId}/${String(start).padStart(12, "0")}.part`;

async function readManifest(uploadId: string): Promise<Manifest | null> {
  try {
    const buf = await storage().get(manifestKey(uploadId));
    return JSON.parse(buf.toString("utf8")) as Manifest;
  } catch {
    return null;
  }
}

async function writeManifest(manifest: Manifest): Promise<void> {
  await storage().put(manifestKey(manifest.uploadId), Buffer.from(JSON.stringify(manifest), "utf8"), "application/json");
}

export const POST = handle({ permission: "interaction:create" }, async ({ req, db, user }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const body = await parseJson(req, Body, language, id);

    if (body.action === "init") {
      const mimeType = body.mimeType.split(";")[0];
      if (!isAllowedMime(mimeType)) {
        throw new ChannelError("POLICY_BLOCKED", { language, requestId: id, fields: ["mimeType"] });
      }
      if (body.sizeBytes > env.storage.maxUploadBytes) {
        throw new ChannelError("MEDIA_QUALITY_LOW", { language, requestId: id, fields: ["sizeBytes"] });
      }
      const manifest: Manifest = {
        uploadId: randomUUID(),
        userId: user.userId,
        mimeType,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256 ?? null,
        fileName: body.fileName ?? null,
        chunks: [],
        createdAt: new Date().toISOString(),
      };
      await writeManifest(manifest);
      return {
        upload_id: manifest.uploadId,
        chunk_size: RECOMMENDED_CHUNK_BYTES,
        size_bytes: manifest.sizeBytes,
        expires_at: new Date(Date.now() + UPLOAD_TTL_MS).toISOString(),
        received_ranges: [],
        request_id: id,
      };
    }

    // action === "complete"
    const manifest = await readManifest(body.upload_id);
    if (!manifest || manifest.userId !== user.userId) {
      throw new ChannelError("NOT_FOUND", { language, requestId: id, fields: ["upload_id"] });
    }
    const ordered = [...manifest.chunks].sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const chunk of ordered) {
      if (chunk.start !== cursor) {
        throw new ChannelError("STATE_CONFLICT", {
          language,
          requestId: id,
          fields: ["chunks"],
          detail: `missing bytes ${cursor}-${chunk.start - 1}`,
          extra: { missing_from: cursor, missing_to: chunk.start - 1 },
        });
      }
      cursor = chunk.end + 1;
    }
    if (cursor !== manifest.sizeBytes) {
      throw new ChannelError("STATE_CONFLICT", {
        language,
        requestId: id,
        fields: ["sizeBytes"],
        detail: "upload incomplete",
        extra: { received_bytes: cursor, expected_bytes: manifest.sizeBytes },
      });
    }

    const parts: Buffer[] = [];
    for (const chunk of ordered) parts.push(await storage().get(chunkKey(manifest.uploadId, chunk.start)));
    const data = Buffer.concat(parts);
    const digest = createHash("sha256").update(data).digest("hex");
    const expected = body.sha256 ?? manifest.sha256;
    if (expected && expected !== digest) {
      throw new ChannelError("MEDIA_QUALITY_LOW", {
        language,
        requestId: id,
        fields: ["sha256"],
        detail: "checksum mismatch",
      });
    }

    const stored = await storeUpload(data, manifest.mimeType, "evidence");
    const [file] = await db
      .insert(schema.files)
      .values({
        userId: user.userId,
        interactionId: body.interactionId ?? null,
        kind: kindFromMime(manifest.mimeType),
        storageKey: stored.key,
        mimeType: manifest.mimeType,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
      })
      .returning();

    // Housekeeping: the chunks are no longer needed.
    for (const chunk of ordered) await storage().delete(chunkKey(manifest.uploadId, chunk.start));
    await storage().delete(manifestKey(manifest.uploadId));

    return {
      file_id: file.id,
      sha256: stored.sha256,
      size_bytes: stored.sizeBytes,
      mime_type: manifest.mimeType,
      url: `/api/v1/files/${file.id}`,
      request_id: id,
    };
  });
});

/** Uploads one chunk. `Content-Range: bytes start-end/total`. */
export const PUT = handle({ permission: "interaction:create", limit: "none" }, async ({ req, user }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const uploadId = req.headers.get("upload-id") ?? new URL(req.url).searchParams.get("upload_id");
    const range = req.headers.get("content-range");
    if (!uploadId || !range) {
      throw new ChannelError("VALIDATION_FAILED", { language, requestId: id, fields: ["Upload-Id", "Content-Range"] });
    }
    const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(range.trim());
    if (!match) throw new ChannelError("VALIDATION_FAILED", { language, requestId: id, fields: ["Content-Range"] });
    const start = Number(match[1]);
    const end = Number(match[2]);

    const manifest = await readManifest(uploadId);
    if (!manifest || manifest.userId !== user.userId) {
      throw new ChannelError("NOT_FOUND", { language, requestId: id, fields: ["Upload-Id"] });
    }

    const data = Buffer.from(await req.arrayBuffer());
    if (data.length !== end - start + 1) {
      throw new ChannelError("VALIDATION_FAILED", { language, requestId: id, fields: ["Content-Range"], detail: "range does not match body length" });
    }
    if (end + 1 > manifest.sizeBytes || end + 1 > env.storage.maxUploadBytes) {
      throw new ChannelError("MEDIA_QUALITY_LOW", { language, requestId: id, fields: ["Content-Range"], detail: "chunk beyond declared size" });
    }

    await storage().put(chunkKey(uploadId, start), data, manifest.mimeType);
    const chunks = manifest.chunks.filter((c) => c.start !== start);
    chunks.push({ start, end });
    chunks.sort((a, b) => a.start - b.start);
    await writeManifest({ ...manifest, chunks });

    const received = chunks.reduce((n, c) => n + (c.end - c.start + 1), 0);
    return {
      upload_id: uploadId,
      received_bytes: received,
      size_bytes: manifest.sizeBytes,
      received_ranges: chunks.map((c) => `${c.start}-${c.end}`),
      complete: received === manifest.sizeBytes,
      request_id: id,
    };
  });
});
