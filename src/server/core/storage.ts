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
      // Optional dependency: installed only in cloud deployments.
      const moduleName = "@google-cloud/storage";
      this.bucketPromise = import(/* webpackIgnore: true */ moduleName).then((m) => new m.Storage().bucket(name));
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

export async function storeUpload(data: Buffer, mimeType: string, prefix: string): Promise<StoredFile> {
  if (data.length > env.storage.maxUploadBytes) throw new Error("File too large");
  const ext = EXT[mimeType] ?? "bin";
  const sha256 = createHash("sha256").update(data).digest("hex");
  const day = new Date().toISOString().slice(0, 10);
  const key = `${prefix}/${day}/${randomUUID()}.${ext}`;
  await storage().put(key, data, mimeType);
  return { key, sizeBytes: data.length, sha256 };
}
