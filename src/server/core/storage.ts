/**
 * File storage abstraction. Local disk by default; Google Cloud Storage when configured.
 */
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { decryptBytes, encryptBytes, looksEncryptedBytes } from "./crypto";
import { env } from "./env";

export interface StoredFile {
  key: string;
  sizeBytes: number;
  sha256: string;
}

export interface StorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  private root = path.resolve(process.cwd(), env.dataDir, "uploads");
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class GcsStorage implements StorageDriver {
  private bucketPromise?: Promise<{
    file(k: string): {
      save(d: Buffer, o: { contentType: string }): Promise<void>;
      download(): Promise<[Buffer]>;
      delete(): Promise<unknown>;
    };
  }>;
  private bucket() {
    if (!this.bucketPromise) {
      const name = env.storage.gcsBucket;
      if (!name) throw new Error("GCS_BUCKET is required when STORAGE_DRIVER=gcs");
      // A literal specifier, and no webpackIgnore. Both matter.
      //
      // This was written as a const holding the name plus webpackIgnore, to keep
      // an optional dependency out of the bundle. The effect in a standalone
      // build is that Next's file tracer cannot see the import at all, so the
      // package is never copied into the image — and the deployment failed at
      // runtime with "Cannot find package '@google-cloud/storage'" on every
      // voice turn, long after it was added to package.json. A literal
      // specifier is what the tracer follows; serverExternalPackages in
      // next.config.ts is what keeps it out of the bundle instead.
      this.bucketPromise = import("@google-cloud/storage").then((m) => new m.Storage().bucket(name));
    }
    return this.bucketPromise;
  }
  async put(key: string, data: Buffer, mimeType: string) {
    await (await this.bucket()).file(key).save(data, { contentType: mimeType });
  }
  async get(key: string) {
    const [buf] = await (await this.bucket()).file(key).download();
    return buf;
  }
  async delete(key: string) {
    await (await this.bucket()).file(key).delete();
  }
}

/**
 * Encrypts everything on the way down and decrypts on the way up, so no caller
 * has to remember to. What lands on disk or in the bucket is AES-256-GCM
 * ciphertext: a recording of a citizen describing a sick child is unreadable to
 * anyone holding the volume, the backup or the bucket without the key.
 *
 * Objects written before this wrapper existed have no container header and are
 * returned as they are, so an upgrade needs no migration window.
 */
class EncryptedStorage implements StorageDriver {
  constructor(private readonly inner: StorageDriver) {}
  async put(key: string, data: Buffer, mimeType: string) {
    await this.inner.put(key, encryptBytes(data, "storage"), mimeType);
  }
  async get(key: string) {
    const raw = await this.inner.get(key);
    return looksEncryptedBytes(raw) ? decryptBytes(raw, "storage") : raw;
  }
  async delete(key: string) {
    await this.inner.delete(key);
  }
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  return (driver ??= new EncryptedStorage(env.storage.driver === "gcs" ? new GcsStorage() : new LocalStorage()));
}

/** Test hook: forget the cached driver so a changed configuration takes effect. */
export function resetStorage() {
  driver = undefined;
}

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "image/jpeg": "jpg",
  // What a phone's camera actually saves. Converted to JPEG on the way in — see
  // src/server/core/images.ts — so these extensions are only ever reached if a
  // caller stores one deliberately without normalising it first.
  "image/heic": "heic",
  "image/heif": "heif",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

export function kindFromMime(mime: string): "audio" | "image" | "video" | "document" {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export function isAllowedMime(mime: string): boolean {
  return mime in EXT;
}

/**
 * Leading bytes that a declared type must actually begin with.
 *
 * The MIME type arrives from the client and nothing checked it, so a file could
 * be stored as "image/jpeg" while containing anything at all. The allowlist above
 * is what keeps that from being serious — HTML and SVG are not in it, so there is
 * no stored-cross-site-scripting path — and the download route sets
 * X-Content-Type-Options: nosniff and requires ownership. What remains is a PDF:
 * it is allowlisted, it renders inline in a viewer, and the person most likely to
 * open an attachment is a health worker looking at a case.
 *
 * Images and PDFs are checked here because their signatures are stable and
 * universal. Audio and video deliberately are not: this is a voice-first service
 * for people who may not be able to type, the recordings arrive from Android
 * WebViews and old iOS builds whose container quirks cannot be tested from here,
 * and rejecting a caregiver's voice note over a signature check would be a worse
 * defect than the one being fixed. That gap is recorded rather than closed.
 */
const MAGIC: Record<string, Array<{ offset: number; bytes: number[] }>> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  // RIFF....WEBP
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  // %PDF-
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
  // ISO base media container: "ftyp" at offset 4. The brand that follows says
  // which flavour, and looksLikeHeic() in images.ts checks it properly; here it
  // is enough that the file is an ISO-BMFF container and not something else.
  "image/heic": [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
  "image/heif": [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
};

/** True when the bytes are consistent with the declared type, or unchecked. */
export function contentMatchesMime(data: Buffer, mime: string): boolean {
  const checks = MAGIC[mime];
  if (!checks) return true; // audio and video: see the note above
  return checks.every(({ offset, bytes }) =>
    data.length >= offset + bytes.length && bytes.every((b, i) => data[offset + i] === b),
  );
}

export async function storeUpload(data: Buffer, mimeType: string, prefix: string): Promise<StoredFile> {
  if (data.length > env.storage.maxUploadBytes) throw new Error("File too large");
  if (data.length === 0) throw new Error("Empty file");
  if (!contentMatchesMime(data, mimeType)) throw new Error("File contents do not match the declared type");
  const ext = EXT[mimeType] ?? "bin";
  const sha256 = createHash("sha256").update(data).digest("hex");
  const day = new Date().toISOString().slice(0, 10);
  const key = `${prefix}/${day}/${randomUUID()}.${ext}`;
  await storage().put(key, data, mimeType);
  return { key, sizeBytes: data.length, sha256 };
}
