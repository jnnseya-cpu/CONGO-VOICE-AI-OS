import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { badRequest, notFound } from "@server/core/errors";
import { schema } from "@server/db/client";
import { env } from "@server/core/env";
import { storage, storeUpload } from "@server/core/storage";
import { publicUser } from "@server/core/users";

/**
 * A profile photograph and a cover image.
 *
 * They are stored as `files` rows like any recording, not as a URL on the user:
 * a photograph of a citizen is personal data, so it must be encrypted at rest,
 * swept by retention, erased by a tombstone and served only to someone entitled
 * to see it. A column holding a public URL would sidestep every one of those.
 *
 * Registered accounts only. An anonymous session exists so somebody can ask a
 * question without signing up; giving it a face to store would be collecting a
 * photograph from a person the platform has deliberately not identified.
 */

/** Small enough that a first-time upload over a slow connection completes. */
const MAX_BYTES = Math.min(env.storage.maxUploadBytes, 5 * 1024 * 1024);
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const SLOTS = { avatar: "avatarFileId", cover: "coverFileId" } as const;
type Slot = keyof typeof SLOTS;

function slotFrom(value: string | null): Slot {
  if (value === "avatar" || value === "cover") return value;
  throw badRequest("Indiquez « avatar » ou « cover ».");
}

export const POST = handle({ auth: true, registered: true }, async ({ db, req, user, ip }) => {
  const form = await req.formData();
  const slot = slotFrom(form.get("slot") as string | null);
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) throw badRequest("Aucune image reçue.");

  const mime = (file.type || "").split(";")[0].toLowerCase();
  // An allow-list, not a deny-list: an SVG is a script that renders as a
  // picture, and a profile image is shown to other people.
  if (!ALLOWED.has(mime)) throw badRequest("Format accepté : JPEG, PNG ou WebP.");
  if (file.size > MAX_BYTES) throw badRequest(`Image trop volumineuse (maximum ${Math.round(MAX_BYTES / 1024 / 1024)} Mo).`);

  const data = Buffer.from(await file.arrayBuffer());
  const stored = await storeUpload(data, mime, slot);
  const [created] = await db
    .insert(schema.files)
    .values({ userId: user.userId, kind: slot, storageKey: stored.key, mimeType: mime, sizeBytes: stored.sizeBytes, sha256: stored.sha256 })
    .returning();

  const column = SLOTS[slot];
  const [before] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId));
  const [after] = await db
    .update(schema.users)
    .set({ [column]: created.id, updatedAt: new Date() })
    .where(eq(schema.users.id, user.userId))
    .returning();

  // The replaced image is deleted rather than orphaned: a photograph somebody
  // chose to remove must stop existing, not merely stop being pointed at.
  const previousId = before?.[column];
  if (previousId) await removeFile(db, previousId);

  await audit({ action: "user.photo_set", actorUserId: user.userId, actorRole: user.role, entityType: "user", entityId: user.userId, after: { slot, sizeBytes: stored.sizeBytes }, ip });
  return { user: publicUser(after), slot, fileId: created.id };
});

export const DELETE = handle({ auth: true, registered: true }, async ({ db, req, user, ip }) => {
  const slot = slotFrom(new URL(req.url).searchParams.get("slot"));
  const column = SLOTS[slot];
  const [before] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId));
  if (!before) throw notFound();
  const fileId = before[column];
  if (!fileId) return { user: publicUser(before), slot, removed: false };

  const [after] = await db.update(schema.users).set({ [column]: null, updatedAt: new Date() }).where(eq(schema.users.id, user.userId)).returning();
  await removeFile(db, fileId);
  await audit({ action: "user.photo_removed", actorUserId: user.userId, actorRole: user.role, entityType: "user", entityId: user.userId, after: { slot }, ip });
  return { user: publicUser(after), slot, removed: true };
});

/** Drop the object and its row. A failure to delete bytes must not leave a row claiming they are gone. */
async function removeFile(db: Awaited<ReturnType<typeof import("@server/db/client").getDb>>, fileId: string) {
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId));
  if (!row) return;
  try {
    await storage().delete(row.storageKey);
    await db.delete(schema.files).where(eq(schema.files.id, fileId));
  } catch (err) {
    console.warn("[me/photo] the stored image could not be deleted:", err);
  }
}
