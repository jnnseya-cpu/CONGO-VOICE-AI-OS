import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LANGUAGES } from "@shared/types";
import { t } from "@shared/i18n";

/** LANGUAGES carries descriptors; the dictionaries are keyed by the code. */
const CODES = LANGUAGES.map((l) => l.code);

/**
 * The first sentence a citizen reads has to be in their language.
 *
 * The sign-in page and the navigation drawer both printed `tagline`, which is
 * the programme's English brand line and is defined once — so a Lingala,
 * Kikongo, Swahili or Tshiluba speaker was shown English above everything else.
 * `hero_sub` says the same thing and is written in all five.
 */
describe("citizen-facing copy is localised", () => {
  it("has the promise sentence in every language, and differently in each", () => {
    const rendered = CODES.map((lang) => t(lang, "hero_sub"));
    for (const [i, text] of rendered.entries()) {
      expect(text.length, `${CODES[i]} hero_sub`).toBeGreaterThan(30);
    }
    // Five distinct strings: a dictionary that silently inherits French would
    // give five identical ones.
    expect(new Set(rendered).size).toBe(CODES.length);
  });

  it("does not print the English brand line in the citizen shell", () => {
    for (const file of ["src/client/components/shell/LoginForm.tsx", "src/client/components/shell/Sidebar.tsx"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source.includes('t("tagline")'), `${file} renders the English tagline`).toBe(false);
    }
  });

  it("keeps the brand line available for metadata, where an international reader sees it", () => {
    const site = readFileSync(new URL("../src/shared/site.ts", import.meta.url), "utf8");
    expect(site).toContain("tagline");
  });
});
