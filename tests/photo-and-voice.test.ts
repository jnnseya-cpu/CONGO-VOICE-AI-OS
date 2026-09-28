/**
 * The two things a citizen actually does: send a photograph, send their voice.
 *
 * A farmer attached two photographs of a cassava leaf and the platform answered
 * "Format non pris en charge : image/heic" — HEIC being what the camera on the
 * phone in his hand saves, and the agriculture module existing to look at
 * photographs of crops. And a voice note whose transcription failed took the
 * whole turn down to "réessayez dans quelques instants", with no typed text for
 * the danger-sign fallback to read.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { IMAGE_UNREADABLE, looksLikeHeic, needsJpegConversion, normaliseImage } from "@server/core/images";
import { contentMatchesMime, isAllowedMime } from "@server/core/storage";
import { runInteraction } from "@server/ai/agents/orchestrator";
import { resetGatewayForTests } from "@server/ai/gateway";

/** A minimal ISO-BMFF header with a HEIC brand, as a camera writes it. */
function heicHeader(brand = "heic"): Buffer<ArrayBuffer> {
  const b = Buffer.alloc(32) as Buffer<ArrayBuffer>;
  b.writeUInt32BE(32, 0); // box size
  b.write("ftyp", 4, "latin1");
  b.write(brand, 8, "latin1");
  b.write("mif1heic", 16, "latin1"); // compatible brands
  return b;
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]) as Buffer<ArrayBuffer>;

describe("recognising a photograph from a phone", () => {
  it("knows a HEIC by its brand, not by what the client called it", () => {
    for (const brand of ["heic", "heix", "hevc", "mif1", "msf1", "heim"]) {
      expect(looksLikeHeic(heicHeader(brand)), brand).toBe(true);
    }
    expect(looksLikeHeic(JPEG)).toBe(false);
    expect(looksLikeHeic(Buffer.alloc(4))).toBe(false);
  });

  it("converts when the type says HEIC, and when only the bytes do", () => {
    expect(needsJpegConversion(heicHeader(), "image/heic")).toBe(true);
    expect(needsJpegConversion(heicHeader(), "")).toBe(true);
    // Some Android pickers mislabel a JPEG as HEIC; the declared type is enough
    // to try, and the conversion failing is handled.
    expect(needsJpegConversion(JPEG, "image/heic")).toBe(true);
    expect(needsJpegConversion(JPEG, "image/jpeg")).toBe(false);
  });

  it("leaves a normal photograph untouched", async () => {
    const out = await normaliseImage(JPEG, "image/jpeg");
    expect(out.converted).toBe(false);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.data).toBe(JPEG);
  });

  it("no longer refuses the camera's own format outright", () => {
    expect(isAllowedMime("image/heic")).toBe(true);
    expect(isAllowedMime("image/heif")).toBe(true);
    expect(contentMatchesMime(heicHeader(), "image/heic")).toBe(true);
    expect(contentMatchesMime(JPEG, "image/heic"), "a JPEG is not an ISO-BMFF container").toBe(false);
  });

  it("tells the citizen what to do, never the MIME type", () => {
    for (const lang of ["fr", "ln", "kg", "sw", "lua"]) {
      const msg = IMAGE_UNREADABLE[lang];
      expect(msg, lang).toBeTruthy();
      expect(msg).not.toContain("image/");
      expect(msg).not.toContain("heic");
      expect(msg.length).toBeGreaterThan(40);
    }
  });

  /**
   * Honest limit, pinned so it is not mistaken for coverage: decoding a genuine
   * camera HEIC is not exercised here. No HEIC encoder exists in this
   * environment to produce one, so what is proven is detection, routing and the
   * failure path — not that libheif reads a particular iPhone's output.
   */
  it("fails safely when the bytes are not decodable after all", async () => {
    await expect(normaliseImage(heicHeader(), "image/heic")).rejects.toBeTruthy();
  });
});

describe("a voice note whose transcription fails", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    process.env.AI_ALLOW_MOCK = "false";
    process.env.AI_STT_ORDER = "openai"; // no credentials: every attempt fails
    process.env.AI_LLM_ORDER = "mock";
    process.env.AI_ALLOW_MOCK = "true";
    resetGatewayForTests();
  });
  afterAll(() => {
    process.env.AI_STT_ORDER = "mock";
    process.env.AI_LLM_ORDER = "mock";
    process.env.AI_ALLOW_MOCK = "true";
    resetGatewayForTests();
  });

  it("asks the citizen to speak again or write, instead of blaming the service", async () => {
    const out = await runInteraction({
      user: null,
      audio: { data: Buffer.from("not decodable as speech"), mimeType: "audio/webm" },
      wantsAudio: false,
    });
    // Whatever happens, the citizen is not told the platform is unavailable.
    expect(out.responseText).not.toContain("momentanément indisponible");
    expect(out.responseText.length).toBeGreaterThan(20);
  });

  it("keeps the interaction row with a reason an operator can read", async () => {
    const db = await getDb();
    const out = await runInteraction({
      user: null,
      audio: { data: Buffer.from("still not speech"), mimeType: "audio/webm" },
      wantsAudio: false,
    });
    const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, out.interactionId));
    expect(row, "the recording's row must survive the failure").toBeTruthy();
    expect(row.errorMessage ?? "", "the reason is recorded, not swallowed").not.toHaveLength(0);
  });
});
