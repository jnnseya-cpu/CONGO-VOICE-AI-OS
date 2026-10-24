import { describe, expect, it } from "vitest";
import { storeUpload } from "@server/core/storage";

/** A 1x1 PNG, so the content check passes and the prefix is what is under test. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

/**
 * The prefix is the folder half of a storage key. Nothing user-supplied reaches
 * it today; this is the check that keeps a future caller from changing that
 * quietly.
 */
describe("storage key prefix", () => {
  it("accepts the prefixes the platform actually uses", async () => {
    for (const prefix of ["voice", "evidence", "uploads", "tts", "avatar", "cover"]) {
      const stored = await storeUpload(PNG, "image/png", prefix);
      expect(stored.key.startsWith(`${prefix}/`)).toBe(true);
    }
  });

  it("refuses a prefix that could climb out of its folder", async () => {
    for (const prefix of ["../../etc", "voice/../..", "/absolute", "a/b", "", "UPPER", "with space", "x".repeat(40)]) {
      await expect(storeUpload(PNG, "image/png", prefix)).rejects.toThrow(/Invalid storage prefix/);
    }
  });
});
