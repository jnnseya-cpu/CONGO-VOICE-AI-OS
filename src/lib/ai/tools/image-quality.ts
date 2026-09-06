/**
 * Image quality gate (FR-AG-05 / AGR-002).
 *
 * Reads image headers directly (JPEG, PNG, WebP, GIF) — no native decoder, no extra
 * dependency — and applies conservative heuristics so an unusable photo is answered with
 * recapture guidance instead of spending a vision call on it.
 *
 * The heuristics are intentionally simple and explainable:
 *   - dimensions come from the file header;
 *   - "information density" (compressed bytes per pixel) is a robust proxy for a photo
 *     that is very dark, out of focus or flat: such images compress far more than a sharp,
 *     well-exposed one at the same resolution;
 *   - truncation is detected from the end-of-image marker.
 * Videos are never sent to vision: they are kept as evidence only.
 */

export type EvidenceKind = "image" | "video" | "other";

export interface ImageQualityIssue {
  code: "too_small" | "too_dark_or_blurry" | "truncated" | "unreadable_header" | "unsupported" | "too_large" | "video";
  message: string;
}

export interface ImageQualityResult {
  kind: EvidenceKind;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  megapixels: number | null;
  /** Compressed bytes per pixel — the density proxy. */
  bytesPerPixel: number | null;
  usableForVision: boolean;
  issues: ImageQualityIssue[];
  /** 0..1 — only a triage score, never a measurement. */
  score: number;
  /** Present when the citizen should take another photo. */
  recaptureGuidance: string | null;
  exif: { present: boolean; note: string };
}

const MIN_SIDE = 480;
const MIN_DENSITY_LOSSY = 0.045; // bytes per pixel for JPEG / WebP lossy
const MIN_DENSITY_LOSSLESS = 0.12; // PNG / WebP lossless
const MAX_BYTES = 20 * 1024 * 1024;

const RECAPTURE_TEXT =
  "La photo reçue est difficile à lire. Reprenez-la à la lumière du jour, à environ 30 cm de la feuille ou de l'animal, " +
  "en tenant le téléphone bien immobile, sans ombre portée et sans contre-jour. Une deuxième photo sous un autre angle aide beaucoup.";

const EXIF_NOTE_PRESENT =
  "La photo contient des métadonnées EXIF (date, appareil, parfois position GPS). La date est utilisée pour situer l'observation ; la position n'est jamais partagée hors du service.";
const EXIF_NOTE_ABSENT =
  "Aucune métadonnée EXIF : la date et le lieu de la prise de vue ne peuvent pas être vérifiés automatiquement, indiquez-les si possible.";

function readPng(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  if (b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function readJpeg(b: Buffer): { width: number; height: number; exif: boolean; truncated: boolean } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let exif = false;
  let dims: { width: number; height: number } | null = null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const len = b.readUInt16BE(i + 2);
    if (len < 2) break;
    if (marker === 0xe1 && b.toString("ascii", i + 4, i + 8) === "Exif") exif = true;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 9 < b.length) {
      dims = { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xda) break; // start of scan: header parsing is done
    i += 2 + len;
  }
  const truncated = !(b.length >= 2 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9);
  return dims ? { ...dims, exif, truncated } : null;
}

function readWebp(b: Buffer): { width: number; height: number; lossless: boolean } | null {
  if (b.length < 30) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const fourcc = b.toString("ascii", 12, 16);
  if (fourcc === "VP8 ") {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, lossless: false };
  }
  if (fourcc === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, lossless: true };
  }
  if (fourcc === "VP8X") {
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width: w, height: h, lossless: false };
  }
  return null;
}

function readGif(b: Buffer): { width: number; height: number } | null {
  if (b.length < 10 || b.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

/** Header-only quality check. Never throws. */
export function checkImageQuality(data: Buffer, mimeType: string): ImageQualityResult {
  const mime = (mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const issues: ImageQualityIssue[] = [];
  const base = {
    mimeType: mime,
    bytes: data.length,
    width: null as number | null,
    height: null as number | null,
    megapixels: null as number | null,
    bytesPerPixel: null as number | null,
    exif: { present: false, note: EXIF_NOTE_ABSENT },
  };

  if (mime.startsWith("video/")) {
    return {
      ...base,
      kind: "video",
      usableForVision: false,
      issues: [{ code: "video", message: "Vidéo conservée comme pièce jointe de preuve ; elle n'est pas analysée image par image." }],
      score: 0,
      recaptureGuidance:
        "La vidéo est enregistrée comme preuve pour l'agent agricole. Pour un avis immédiat, envoyez aussi une photo nette de la feuille ou de l'animal.",
      exif: { present: false, note: EXIF_NOTE_ABSENT },
    };
  }

  if (!mime.startsWith("image/")) {
    return { ...base, kind: "other", usableForVision: false, issues: [{ code: "unsupported", message: `Format non pris en charge : ${mime}` }], score: 0, recaptureGuidance: RECAPTURE_TEXT };
  }

  if (data.length > MAX_BYTES) issues.push({ code: "too_large", message: "Fichier très volumineux : réduisez la qualité de la photo avant l'envoi." });

  let width: number | null = null;
  let height: number | null = null;
  let lossless = false;
  let exif = false;
  let truncated = false;

  const png = readPng(data);
  const jpeg = png ? null : readJpeg(data);
  const webp = png || jpeg ? null : readWebp(data);
  const gif = png || jpeg || webp ? null : readGif(data);

  if (png) {
    width = png.width;
    height = png.height;
    lossless = true;
  } else if (jpeg) {
    width = jpeg.width;
    height = jpeg.height;
    exif = jpeg.exif;
    truncated = jpeg.truncated;
  } else if (webp) {
    width = webp.width;
    height = webp.height;
    lossless = webp.lossless;
  } else if (gif) {
    width = gif.width;
    height = gif.height;
    lossless = true;
  }

  if (!width || !height) {
    return {
      ...base,
      kind: "image",
      usableForVision: false,
      issues: [...issues, { code: "unreadable_header", message: "Le fichier image n'a pas pu être lu (en-tête illisible ou fichier incomplet)." }],
      score: 0,
      recaptureGuidance: RECAPTURE_TEXT,
      exif: { present: false, note: EXIF_NOTE_ABSENT },
    };
  }

  const pixels = width * height;
  const bytesPerPixel = pixels > 0 ? data.length / pixels : 0;
  const minDensity = lossless ? MIN_DENSITY_LOSSLESS : MIN_DENSITY_LOSSY;

  if (Math.min(width, height) < MIN_SIDE) {
    issues.push({ code: "too_small", message: `Photo trop petite (${width}x${height} pixels) : les détails de la feuille ne sont pas visibles.` });
  }
  if (truncated) issues.push({ code: "truncated", message: "Le fichier photo est incomplet (transfert interrompu)." });
  if (bytesPerPixel < minDensity) {
    issues.push({ code: "too_dark_or_blurry", message: "La photo semble très sombre, floue ou trop compressée : peu de détails exploitables." });
  }

  const blocking = issues.some((i) => i.code === "too_small" || i.code === "too_dark_or_blurry" || i.code === "truncated" || i.code === "unreadable_header");
  const sizeScore = Math.min(1, Math.min(width, height) / 1000);
  const densityScore = Math.min(1, bytesPerPixel / (minDensity * 3));
  const score = Number((truncated ? 0 : (sizeScore * 0.5 + densityScore * 0.5)).toFixed(2));

  return {
    kind: "image",
    mimeType: mime,
    bytes: data.length,
    width,
    height,
    megapixels: Number((pixels / 1_000_000).toFixed(2)),
    bytesPerPixel: Number(bytesPerPixel.toFixed(4)),
    usableForVision: !blocking,
    issues,
    score,
    recaptureGuidance: blocking ? RECAPTURE_TEXT : null,
    exif: { present: exif, note: exif ? EXIF_NOTE_PRESENT : EXIF_NOTE_ABSENT },
  };
}

export interface EvidenceReview {
  results: ImageQualityResult[];
  /** Indices of the attachments worth sending to a vision model. */
  usableIndexes: number[];
  visionWorthwhile: boolean;
  recaptureGuidance: string | null;
  videoOnly: boolean;
  summary: string;
}

/** Reviews every attachment of one report and decides whether a vision call is justified. */
export function reviewEvidence(items: Array<{ data: Buffer; mimeType: string }>): EvidenceReview {
  const results = items.map((i) => checkImageQuality(i.data, i.mimeType));
  const usableIndexes = results.map((r, i) => (r.usableForVision ? i : -1)).filter((i) => i >= 0);
  const images = results.filter((r) => r.kind === "image");
  const videos = results.filter((r) => r.kind === "video");
  const guidance = usableIndexes.length === 0 ? results.find((r) => r.recaptureGuidance)?.recaptureGuidance ?? null : null;
  const summary = results.length === 0 ? "Aucune pièce jointe." : `${images.length} photo(s), ${videos.length} vidéo(s) ; ${usableIndexes.length} exploitable(s) pour l'analyse visuelle.`;
  return {
    results,
    usableIndexes,
    visionWorthwhile: usableIndexes.length > 0,
    recaptureGuidance: guidance,
    videoOnly: results.length > 0 && images.length === 0,
    summary,
  };
}
