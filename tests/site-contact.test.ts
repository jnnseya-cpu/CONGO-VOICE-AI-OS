import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SITE } from "@shared/site";

/**
 * An address on a published page is a promise that somebody reads it. The site
 * listed five — donnees@, presse@, partenaires@, securite@ — and one mailbox
 * existed. The help page used two of them to tell citizens how to exercise a
 * data right and how to report a safety problem, and mail to both bounced.
 *
 * So: every route resolves to an address that exists, and no page may hardcode
 * one. Adding a real mailbox means changing site.ts, which is the only place
 * that should know.
 */
const REAL_MAILBOXES = new Set(["contact@congovoicecd.com"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|md)$/.test(entry) ? [full] : [];
  });
}

describe("every published address has a mailbox behind it", () => {
  it("resolves each contact route to a real one", () => {
    for (const [route, address] of Object.entries(SITE.contact)) {
      expect(REAL_MAILBOXES, `${route} -> ${address}`).toContain(address);
    }
  });

  it("names no address the programme cannot receive, anywhere in the source", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles("src"), ...sourceFiles("docs")]) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/[\w.+-]+@congovoicecd\.com/g)) {
        // site.ts holds the one real default; everywhere else must go through it.
        if (file.endsWith(join("shared", "site.ts")) && REAL_MAILBOXES.has(match[0])) continue;
        if (!REAL_MAILBOXES.has(match[0])) offenders.push(`${file}: ${match[0]}`);
        else offenders.push(`${file}: ${match[0]} (hardcoded; use SITE.contact)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
