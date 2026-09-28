import "server-only";

/**
 * Photographs as phones actually produce them.
 *
 * A farmer photographed a diseased cassava leaf, attached it, and the platform
 * answered "Format non pris en charge : image/heic". HEIC is what an iPhone and
 * most recent Android cameras save by default, and the agriculture module exists
 * to look at photographs of crops, so the one format the camera produces was the
 * one format refused. The allowlist had jpeg, png and webp and nothing else.
 *
 * Refusing it is not an option a citizen can act on — they cannot change their
 * camera's format from inside this app, and telling them to is asking a farmer
 * to go into iOS settings before they can ask about their field. So the file is
 * accepted and converted here, once, on the way in. What is stored and what the
 * vision model sees is a JPEG; no model provider accepts HEIC either, so the
 * conversion would be needed even if storage did.
 *
 * Not verified in this container: decoding a genuine camera HEIC. No HEIC
 * encoder is available here to produce a real one, so the tests cover detection,
 * routing and the failure path, and a real photograph from a real phone remains
 * unproven until someone attaches one. The failure path is written on the
 * assumption that it will sometimes be needed.
 */

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
}

/**
 * Returns a picture every downstream component can read.
 *
 * Quality is set high because the subject is a leaf lesion or a rash, and the
 * thing being looked for is often a few pixels of discolouration; the file is
 * already bounded by the upload limit.
 */
export async function normaliseImage(data: Buffer<ArrayBuffer>, mime: string): Promise<NormalisedImage> {
  if (!needsJpegConversion(data, mime)) return { data, mimeType: mime, converted: false };
  const convert = (await import("heic-convert")).default;
  const out = await convert({ buffer: new Uint8Array(data), format: "JPEG", quality: 0.92 });
  return { data: Buffer.from(out), mimeType: "image/jpeg", converted: true };
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
