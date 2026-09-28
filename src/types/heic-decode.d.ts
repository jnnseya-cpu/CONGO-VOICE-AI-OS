/**
 * Types for heic-decode, which ships none of its own.
 *
 * Written out rather than declared as a bare module, because `declare module
 * "heic-decode";` makes every value from it implicitly `any` — the thing this
 * repository does not allow — and it would have hidden the shape of `data`,
 * which is the part that has to line up exactly with sharp's raw-input
 * contract: four channels, eight bits, width times height times four bytes.
 */
declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    /** Straight RGBA, 8 bits per channel, no padding between rows. */
    data: ArrayBufferLike;
  }

  interface DecodeOptions {
    buffer: Uint8Array;
  }

  /** Decodes the primary image of a HEIC/HEIF file. */
  function decode(options: DecodeOptions): Promise<DecodedImage>;

  namespace decode {
    /** Every image in the file, for the multi-picture containers a burst makes. */
    function all(options: DecodeOptions): Promise<Array<{ decode(): Promise<DecodedImage> }>>;
  }

  export default decode;
}
