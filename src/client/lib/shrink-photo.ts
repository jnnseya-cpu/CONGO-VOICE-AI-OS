/**
 * Make a photograph small enough to leave the handset.
 *
 * A phone camera writes three to five megabytes a picture, and this service is
 * used on mobile networks where a hundred kilobytes a second is a good day. Two
 * photographs is then a minute of uploading before the server has seen
 * anything — longer than any sensible deadline — and the citizen is told the
 * connection failed while it was in fact still working. Shrinking first turns
 * that minute into a few seconds.
 *
 * The server still normalises whatever arrives; this does not replace it. It
 * only avoids sending bytes that were going to be discarded at the other end,
 * since the server resizes to the same edge.
 *
 * HEIC usually cannot be done here. Only Safari decodes it, because the codec
 * inside is HEVC and the other browsers ship no decoder for it. When the browser
 * cannot read the file this returns the original untouched and the server does
 * the work — the upload is slow but it is not broken, which is the outcome that
 * matters on the phone of someone with a sick child.
 */

const MAX_EDGE = 2048;
/** Below this a re-encode is not worth the battery or the quality it costs. */
const WORTH_SHRINKING_BYTES = 600 * 1024;

export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= WORTH_SHRINKING_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return file;

  try {
    // createImageBitmap applies EXIF orientation with this option, so the
    // picture that leaves the handset is the right way up.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    // Re-encoding a small or already-efficient picture can make it bigger.
    if (blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    // Any failure — an unreadable HEIC, a canvas the browser would not give us,
    // memory — means send the original and let the server deal with it.
    return file;
  }
}

/**
 * How long to wait for a turn carrying this many bytes.
 *
 * The deadline was a flat forty-five seconds, chosen for a typed question and
 * then applied unchanged to a turn carrying two photographs. On a weak mast the
 * upload alone outlasts it, so the handset aborted a request that was still
 * making progress and told the citizen the network had failed. Allowing time in
 * proportion to what is being sent is the difference between a slow answer and
 * no answer.
 *
 * The ceiling is what stops it becoming a spinner that never resolves.
 */
export function uploadDeadlineMs(bytes: number): number {
  const BASE = 45_000;
  /** Roughly a 60 kB/s uplink, which is a bad but survivable mobile link. */
  const PER_MEGABYTE = 20_000;
  const CEILING = 180_000;
  return Math.min(CEILING, BASE + Math.ceil(bytes / (1024 * 1024)) * PER_MEGABYTE);
}
