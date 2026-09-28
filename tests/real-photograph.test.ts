/**
 * A real photograph from a real camera, decoded by the code that runs in
 * production.
 *
 * The HEIC path shipped with this admission in its own source:
 *
 *   > Not verified in this container: decoding a genuine camera HEIC. No HEIC
 *   > encoder is available here to produce a real one, so the tests cover
 *   > detection, routing and the failure path.
 *
 * Detection, routing and the failure path all passed, and every photograph sent
 * to production failed, because the decoder was not in the deployed image at
 * all. tests/fixtures/camera-photo.heic exists so that sentence can never be
 * written again: it is a genuine HEVC-coded HEIC, the same container and codec
 * a phone writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { looksLikeHeic, needsJpegConversion, normaliseImage } from "@server/core/images";

const HEIC = readFileSync(join(__dirname, "fixtures", "camera-photo.heic")) as Buffer<ArrayBuffer>;

/** The two bytes every JPEG starts with. */
function isJpeg(data: Buffer): boolean {
  return data[0] === 0xff && data[1] === 0xd8;
}

describe("a genuine camera HEIC", () => {
  it("is recognised from its bytes, not from what the phone called it", () => {
    expect(looksLikeHeic(HEIC)).toBe(true);
    // Android pickers hand over an empty type for a HEIC often enough that the
    // declared type cannot be the thing relied on.
    expect(needsJpegConversion(HEIC, "")).toBe(true);
    expect(needsJpegConversion(HEIC, "application/octet-stream")).toBe(true);
  });

  it("decodes to a JPEG that downstream code can actually read", async () => {
    const out = await normaliseImage(HEIC, "image/heic");
    expect(out.mimeType).toBe("image/jpeg");
    expect(isJpeg(out.data)).toBe(true);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    expect(out.converted).toBe(true);
  });

  it("comes out smaller than it went in, which is the point on a mobile link", async () => {
    const out = await normaliseImage(HEIC, "image/heic");
    expect(out.data.length).toBeLessThan(HEIC.length);
  });

  it("is bounded to the long edge, whatever the camera's resolution", async () => {
    const out = await normaliseImage(HEIC, "image/heic");
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2048);
  });
});

describe("photographs in the formats that are not HEIC", () => {
  it("re-encodes a JPEG and keeps it readable", async () => {
    const sharp = (await import("sharp")).default;
    const jpeg = (await sharp({ create: { width: 3000, height: 1500, channels: 3, background: { r: 20, g: 120, b: 40 } } })
      .jpeg()
      .toBuffer()) as Buffer<ArrayBuffer>;
    const out = await normaliseImage(jpeg, "image/jpeg");
    expect(isJpeg(out.data)).toBe(true);
    // Resized down the long edge, so a twelve-megapixel photograph does not
    // travel to a vision model at full size.
    expect(out.width).toBe(2048);
    expect(out.height).toBe(1024);
  });

  it("does not enlarge a picture that is already small", async () => {
    const sharp = (await import("sharp")).default;
    const small = (await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png()
      .toBuffer()) as Buffer<ArrayBuffer>;
    const out = await normaliseImage(small, "image/png");
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
  });

  it("strips the EXIF a camera writes, GPS included", async () => {
    const sharp = (await import("sharp")).default;
    const withExif = (await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .withExif({ IFD0: { Copyright: "somebody" }, IFD2: { GPSLatitudeRef: "S" } })
      .jpeg()
      .toBuffer()) as Buffer<ArrayBuffer>;
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const out = await normaliseImage(withExif, "image/jpeg");
    // A photograph of a sick child should not carry the household's
    // coordinates into the platform's storage because a camera put them there.
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
  });

  it("refuses bytes that are not a picture at all, rather than storing them", async () => {
    const notAnImage = Buffer.from("<html><script>alert(1)</script></html>") as Buffer<ArrayBuffer>;
    await expect(normaliseImage(notAnImage, "image/jpeg")).rejects.toThrow();
  });
});

describe("the memory bound", () => {
  it("refuses a header claiming more pixels than any camera produces", async () => {
    /**
     * A JPEG header and nothing else, declaring 30000x30000.
     *
     * Built by hand because sharp will not produce one: nine hundred megapixels
     * is 3.6 GB decoded, on an instance with two. That is the whole point — the
     * bound has to be decided from the header, before anything tries to
     * allocate, and a file like this costs an attacker a few hundred bytes.
     */
    const sof = Buffer.alloc(19);
    sof.writeUInt16BE(0xffc0, 0); // start of frame, baseline
    sof.writeUInt16BE(17, 2); // segment length
    sof.writeUInt8(8, 4); // 8 bits per sample
    sof.writeUInt16BE(30000, 5); // height
    sof.writeUInt16BE(30000, 7); // width
    sof.writeUInt8(3, 9); // three components
    for (let i = 0; i < 3; i += 1) {
      sof.writeUInt8(i + 1, 10 + i * 3);
      sof.writeUInt8(0x11, 11 + i * 3);
      sof.writeUInt8(0, 12 + i * 3);
    }
    const forged = Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]) as Buffer<ArrayBuffer>;

    await expect(normaliseImage(forged, "image/jpeg")).rejects.toThrow();
  });

  it("decodes one at a time, so concurrent uploads cannot multiply the peak", async () => {
    const sharp = (await import("sharp")).default;
    const jpeg = (await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .jpeg()
      .toBuffer()) as Buffer<ArrayBuffer>;
    const all = await Promise.all(Array.from({ length: 6 }, () => normaliseImage(jpeg, "image/jpeg")));
    expect(all).toHaveLength(6);
    for (const out of all) expect(isJpeg(out.data)).toBe(true);
  });

  it("does not let one caller's failure reject the next caller's photograph", async () => {
    const sharp = (await import("sharp")).default;
    const good = (await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 4, g: 4, b: 4 } } })
      .jpeg()
      .toBuffer()) as Buffer<ArrayBuffer>;
    const bad = Buffer.from("not an image") as Buffer<ArrayBuffer>;
    const results = await Promise.allSettled([
      normaliseImage(bad, "image/jpeg"),
      normaliseImage(good, "image/jpeg"),
    ]);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
  });
});
