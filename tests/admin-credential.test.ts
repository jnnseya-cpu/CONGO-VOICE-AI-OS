/**
 * The administrator who could not type their own code.
 *
 * The first platform administrator is created through the bootstrap endpoint,
 * which accepts six to twelve characters of anything — so the code may contain
 * letters. The sign-in field was inputMode="numeric", which on a handset is not
 * a hint but the only keyboard offered, and there is no password reset on this
 * platform and no second administrator to ask. An account set up with a
 * password was therefore a locked door with nobody behind it.
 *
 * The same assumption ran through the strength check, and there it was worse
 * than an inconvenience.
 */
import { describe, expect, it } from "vitest";
import { isWeakPin } from "@server/core/lockout";

describe("weak codes, whatever they are made of", () => {
  it.each(["1111", "111111", "1234", "123456", "654321", "4321"])("refuses the numeric run %j", (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });

  it.each(["aaaaaa", "AAAAAA", "abcdef", "fedcba", "abcd"])("refuses the letter run %j", (pin) => {
    /**
     * These were all accepted. Not for a citizen's four digits — for the one
     * account that can read the whole directory and create every other account,
     * because every check assumed digits and silently passed over anything
     * else.
     */
    expect(isWeakPin(pin)).toBe(true);
  });

  it.each(["4827", "9163", "Kx7mq2", "bonjour7"])("allows a code that is not an obvious guess: %j", (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });

  it("does not call a single character a run", () => {
    // Length is enforced by the schema, not here; this only guards the
    // every()-on-an-empty-or-single-list case from reading as a weak run.
    expect(isWeakPin("7")).toBe(false);
  });
});

describe("the sign-in field lets an administrator type their code", () => {
  it("offers a way off the numeric keypad", async () => {
    const form = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/client/components/shell/LoginForm.tsx", import.meta.url), "utf8"),
    );
    // Numeric stays the default — a citizen's code is four digits and the
    // keypad is a kindness on a feature phone — but it is no longer the only
    // keyboard the page will offer.
    expect(form).toContain('inputMode={lettersInCode ? "text" : "numeric"}');
    expect(form).toContain("codeHasLetters");
  });

  it("names the way out in all five languages", async () => {
    const i18n = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/shared/i18n/index.ts", import.meta.url), "utf8"),
    );
    expect(i18n.match(/codeHasLetters:/g) ?? []).toHaveLength(5);
    expect(i18n.match(/codeDigitsOnly:/g) ?? []).toHaveLength(5);
  });
});
