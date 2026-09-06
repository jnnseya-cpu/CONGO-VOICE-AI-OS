import { describe, expect, it } from "vitest";
import { LANGUAGES, PROVINCES as SHARED_PROVINCES } from "@shared/types";
import { SITE, PUBLIC_PAGES } from "@shared/site";
import { PROVINCES as REFERENCE_PROVINCES } from "@server/db/reference/geography";
import { EMERGENCY_MESSAGES, DISCLAIMERS } from "@server/ai/safety";

/**
 * The public site, the product and the seeded reference data must agree. These are the
 * facts a citizen or an institution reads; drift between them is a defect, not a detail.
 */
describe("public and product reference data agree", () => {
  it("serves the same five languages everywhere", () => {
    expect(SITE.languages).toBe(LANGUAGES);
    expect(LANGUAGES).toHaveLength(5);
    for (const l of LANGUAGES) {
      expect(EMERGENCY_MESSAGES[l.code], `emergency message for ${l.code}`).toBeTruthy();
      expect(DISCLAIMERS[l.code], `disclaimer for ${l.code}`).toBeTruthy();
    }
  });

  it("lists the same 26 provinces in the shared list and the seeded reference data", () => {
    const shared = [...SHARED_PROVINCES].sort();
    const reference = REFERENCE_PROVINCES.map((p) => p.name).sort();
    expect(shared).toHaveLength(26);
    expect(reference).toEqual(shared);
  });

  it("keeps every public page reachable from navigation, footer and sitemap", () => {
    const hrefs = PUBLIC_PAGES.map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const p of PUBLIC_PAGES) {
      expect(p.href.startsWith("/")).toBe(true);
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.description.length).toBeGreaterThan(20);
      expect(["citoyen", "programme", "institution", "legal"]).toContain(p.group);
    }
  });

  it("never advertises an address as live before the public origin is configured", () => {
    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      expect(SITE.contactsActive).toBe(false);
      expect(SITE.contactsNote.length).toBeGreaterThan(40);
    }
    for (const channel of Object.values(SITE.channels)) {
      expect(channel.label.length).toBeGreaterThan(2);
      expect(channel.note.length).toBeGreaterThan(10);
    }
  });
});
