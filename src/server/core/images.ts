import "server-only";

/**
 * Photographs as phones actually produce them.
 *
 * A farmer photographed a diseased cassava leaf, attached it, and the platform
 * answered "Format non pris en charge : image/heic". HEIC is what an iPhone and
 * most recent Android cameras save by default, and the agriculture module exists
 * to look at photographs of crops, so the one format the camera produces was the
 * one format refused.
 *
 * Accepting it was only half the job, and the half that shipped was the wrong
 * half. The decode ran through libheif compiled to WebAssembly, and the bundler
 * inlined the emscripten glue while leaving `libheif.wasm` behind: the built
 * image referenced a path that did not exist in the container. Every photograph
 * reached a decoder that could not load, and the citizen watched the connection
 * die rather than getting an answer. Hence EXTERNAL_PACKAGES in next.config.ts,
 * which keeps the package whole on disk instead of inlined into a chunk.
 *
 * Two decoders, because neither does the whole job:
 *
 *   - HEIC from a camera is HEVC-coded, and the libvips inside sharp is built
 *     with AV1 only — HEVC is patent-encumbered, so the prebuilt binaries leave
 *     it out. sharp reads the container and reports "heif 1280x854" but cannot
 *     decode a pixel of it, which is a trap: the header parse looks exactly like
 *     success. libheif, via heic-decode, does the actual decode.
 *   - Everything else — JPEG, PNG, WebP, AVIF — sharp decodes natively, and it
 *     does the resize and re-encode for all of them including HEIC.
 *
 * Both halves are proven against tests/fixtures/camera-photo.heic, a genuine
 * HEVC-coded HEIC, by the test suite and again by scripts/check-standalone.mjs
 * against the built artefact. The artefact check is the one that matters: it is
 * what turned this comment from an assumption into a fact, and it is what
 * caught sharp being unable to decode HEVC after this file had already been
 * rewritten to depend on it.
 */

const MAX_EDGE = 2048;

/**
 * The most pixels worth decoding.
 *
 * Not a preference — a memory bound. Cloud Run gives this service one vCPU and
 * a gigabyte, sixteen requests at a time; a decoded image costs four bytes a
 * pixel before anything is done with it, so an unbounded decode is how a phone
 * camera takes the instance down and every other caller's turn with it. 80
 * megapixels clears any handset on sale and refuses a crafted header claiming
 * four billion.
 */
const MAX_INPUT_PIXELS = 80_000_000;

/** What a phone calls its own photographs. */
export const HEIC_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

/**
 * ISO base media file format brands that mean "this is a HEIF picture".
 *
 * Checked as well as the declared type because a phone's own type string is not
 * dependable: some Android pickers hand over "image/heic" for a JPEG, and some
 * hand over an empty type for a HEIC.
 */
const HEIF_BRANDS: ReadonlySet<string> = new Set([
  "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1",
]);

/** True when the bytes are a HEIF/HEIC picture, whatever the client called them. */
export function looksLikeHeic(data: Buffer): boolean {
  if (data.length < 12) return false;
  if (data.toString("latin1", 4, 8) !== "ftyp") return false;
  return HEIF_BRANDS.has(data.toString("latin1", 8, 12).toLowerCase());
}

/** True when this upload needs converting before anything else touches it. */
export function needsJpegConversion(data: Buffer, mime: string): boolean {
  return HEIC_MIME_TYPES.has(mime.toLowerCase()) || looksLikeHeic(data);
}

export interface NormalisedImage {
  data: Buffer<ArrayBuffer>;
  mimeType: string;
  /** True when the bytes were re-encoded on the way in. */
  converted: boolean;
  width: number;
  height: number;
}

/**
 * One decode at a time, per instance.
 *
 * Bounding a single image is not enough when sixteen requests share a gigabyte:
 * the bound has to hold across callers, or sixteen lawful photographs do what
 * one unlawful one could not. Queueing costs a few seconds under load and keeps
 * the instance alive, which is the better trade for everyone in the queue.
 */
let decoding: Promise<unknown> = Promise.resolve();
function serialised<T>(work: () => Promise<T>): Promise<T> {
  const next = decoding.then(work, work);
  // Never let one caller's failure reject the next caller's turn.
  decoding = next.then(() => undefined, () => undefined);
  return next;
}

/**
 * Returns a picture every downstream component can read.
 *
 * Three things happen on the way through, and each is here for a reason.
 *
 * `rotate()` with no argument applies the EXIF orientation and then drops the
 * tag. Phones record orientation rather than rotating the pixels, so a rash
 * photographed in portrait arrives on its side; a health worker reading it
 * sideways, or a model describing it sideways, is a real cost for one call.
 * HEIC does not need it: libheif has already applied the container's rotation.
 *
 * Resizing to 2048 on the long edge is the memory bound made permanent. A leaf
 * lesion and a skin lesion are both legible well below it, and every vision
 * provider downscales further before looking, so the pixels being discarded are
 * ones no one would have seen — while the bytes saved are bytes that would
 * otherwise cross a mobile link and sit in storage for the retention period.
 *
 * Re-encoding drops every other EXIF field with the orientation, and that
 * includes GPS. A phone stamps a photograph with where it was taken; a
 * photograph of a sick child, carrying the household's coordinates, is not
 * something this platform should hold because a camera put it there by default.
 * Location is recorded when the citizen gives it, at the province level the
 * service actually uses.
 */
export async function normaliseImage(data: Buffer<ArrayBuffer>, mime: string): Promise<NormalisedImage> {
  const sharp = (await import("sharp")).default;
  const heic = needsJpegConversion(data, mime);

  return serialised(async () => {
    /**
     * Read the dimensions before decoding anything.
     *
     * sharp parses the container without decoding the pixels, which makes this
     * the cheap half of the memory bound: a header claiming forty thousand
     * pixels a side is refused for the price of reading a few hundred bytes,
     * rather than for the price of trying.
     */
    const probe = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if ((probe.width ?? 0) * (probe.height ?? 0) > MAX_INPUT_PIXELS) {
      throw new Error(`image too large to decode: ${probe.width}x${probe.height}`);
    }

    let pipeline;
    if (heic) {
      // libheif returns pixels with the container's rotation already applied,
      // so there is no EXIF orientation left to honour on this path.
      const decode = (await import("heic-decode")).default;
      const raw = await decode({ buffer: new Uint8Array(data) });
      pipeline = sharp(Buffer.from(raw.data), { raw: { width: raw.width, height: raw.height, channels: 4 } });
    } else {
      pipeline = sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
    }

    const out = await pipeline
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      data: out.data as Buffer<ArrayBuffer>,
      mimeType: "image/jpeg",
      converted: true,
      width: out.info.width,
      height: out.info.height,
    };
  });
}

/**
 * What to tell the citizen when a picture genuinely cannot be read.
 *
 * Never the MIME type. "Format non pris en charge : image/heic" names a fact
 * about the file that the person holding the phone can do nothing with; this
 * names the thing they can do.
 */
export const IMAGE_UNREADABLE: Record<string, string> = {
  fr: "Cette photo n'a pas pu être lue. Reprenez-la avec l'appareil photo depuis l'application, ou envoyez votre question sans photo — vous pouvez aussi la décrire en parlant.",
  ln: "Foto oyo ekokaki kotangama te. Zwa yango lisusu na appareil photo ya application, to tinda motuna na yo kozanga foto — okoki mpe koloba yango.",
  kg: "Foto yayi lendaka ve kutangwa. Baka yo diaka ti appareil photo ya application, to tinda ngiufula na nge kukonda foto — nge lenda mpi kutuba yo.",
  sw: "Picha hii haikuweza kusomwa. Ipige tena kwa kamera ndani ya programu, au tuma swali lako bila picha — unaweza pia kulieleza kwa kusema.",
  lua: "Tshimfuanyi etshi katshivua mua kubalangana to. Tshiangata kabidi ne kamera mu aplikasi, anyi tuma lukonko luebe kabiyi ne tshimfuanyi — udi mua kutshiamba kabidi ne mukana.",
};
