import { handle } from "@server/core/api";
import { badRequest } from "@server/core/errors";
import { isAllowedMime, kindFromMime, storeUpload } from "@server/core/storage";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";

/** Generic upload (photos, videos, audio, PDF). Returns file ids to attach to an interaction. */
export const POST = handle({ permission: "interaction:create" }, async ({ req, db, user }) => {
  const form = await req.formData();
  const out = [];
  for (const entry of form.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const mime = entry.type.split(";")[0];
    if (!isAllowedMime(mime)) throw badRequest(`Format non pris en charge : ${mime}`);
    const stored = await storeUpload(Buffer.from(await entry.arrayBuffer()), mime, "uploads");
    const [f] = await db.insert(schema.files).values({ userId: user.userId, kind: kindFromMime(mime), storageKey: stored.key, mimeType: mime, sizeBytes: stored.sizeBytes, sha256: stored.sha256 }).returning();
    out.push({ id: f.id, kind: f.kind, mimeType: f.mimeType, sizeBytes: f.sizeBytes, url: `/api/v1/files/${f.id}` });
  }
  if (out.length === 0) throw badRequest("Aucun fichier reçu");
  await audit({ action: "file.uploaded", actorUserId: user.userId, actorRole: user.role, entityType: "file", after: { count: out.length } });
  return { files: out };
});
