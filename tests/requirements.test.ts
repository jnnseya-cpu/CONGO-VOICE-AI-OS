import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the traceability matrix honest.
 *
 * A matrix is worth having only if it cannot quietly go stale. This test reads
 * the identifiers extracted from the two requirement documents and the rows in
 * docs/REQUIREMENTS.md, and fails when they disagree: a requirement with no row,
 * a row for a requirement that does not exist, a claim of "Built" that names a
 * file which is not there.
 */

const ROOT = path.resolve(__dirname, "..");

interface Row {
  id: string;
  status: string;
  where: string;
  note: string;
}

function requirementIds(): Map<string, string> {
  const text = fs.readFileSync(path.join(ROOT, "tests/fixtures/prd-requirements.tsv"), "utf8");
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, context] = line.split("\t");
    out.set(id, context ?? "");
  }
  return out;
}

function matrixRows(): Row[] {
  const text = fs.readFileSync(path.join(ROOT, "docs/REQUIREMENTS.md"), "utf8");
  const rows: Row[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("| ")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // | id | requirement | status | where | note |
    if (cells.length < 7) continue;
    const id = cells[1];
    if (!/^(?:[A-Z]{2,3}|FR|NFR|SEC|AI|CP|CM|DO)[-A-Z0-9]*\d$/.test(id) && !/^E\d{2}$/.test(id)) continue;
    rows.push({ id, status: cells[3], where: cells[4], note: cells[5] });
  }
  return rows;
}

const STATUSES = new Set(["Built", "Partial", "Programme", "Deferred", "Hosting"]);

describe("requirement traceability", () => {
  const ids = requirementIds();
  const rows = matrixRows();

  it("extracted every identifier the documents define", () => {
    // A floor, not an assertion about the documents: if the extractor silently
    // started returning nothing, every other check here would pass vacuously.
    expect(ids.size).toBeGreaterThan(150);
  });

  it("has exactly one row per requirement, and no invented ones", () => {
    const rowIds = rows.map((r) => r.id);
    const missing = [...ids.keys()].filter((id) => !rowIds.includes(id)).sort();
    expect(missing, `no row in docs/REQUIREMENTS.md for: ${missing.join(", ")}`).toEqual([]);

    const unknown = rowIds.filter((id) => !ids.has(id)).sort();
    expect(unknown, `rows for identifiers the documents do not define: ${unknown.join(", ")}`).toEqual([]);

    const duplicates = rowIds.filter((id, i) => rowIds.indexOf(id) !== i);
    expect(duplicates, `more than one row for: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("uses only the five defined statuses", () => {
    for (const row of rows) expect(STATUSES.has(row.status), `${row.id} has status "${row.status}"`).toBe(true);
  });

  it("names a file that exists for everything it claims is built", () => {
    const broken: string[] = [];
    for (const row of rows) {
      if (row.status !== "Built" && row.status !== "Partial") continue;
      for (const raw of row.where.split("·")) {
        const candidate = raw.trim().replace(/\s*\(.*\)$/, "");
        // Prose references ("repository root", "—") are not paths.
        if (!candidate || !/[/.]/.test(candidate) || candidate.includes(" ")) continue;
        const target = candidate.replace(/\[|\]/g, (c) => c); // route segments are real directory names
        if (!fs.existsSync(path.join(ROOT, target))) broken.push(`${row.id} → ${target}`);
      }
    }
    expect(broken, `evidence that does not exist:\n${broken.join("\n")}`).toEqual([]);
  });

  it("explains itself whenever it is not simply built", () => {
    for (const row of rows) {
      if (row.status === "Built") continue;
      expect(row.note.length, `${row.id} is "${row.status}" with no explanation`).toBeGreaterThan(20);
    }
  });

  it("does not claim more than the safety work actually covers", () => {
    // Two rows the rest of this repository's honesty depends on. If either is
    // ever quietly upgraded to Built, this fails.
    const redTeam = rows.find((r) => r.id === "AI-12");
    expect(redTeam?.status, "the adversarial corpus is a seed, not the 300 cases per module the specification asks for").toBe("Partial");
    const crb = rows.find((r) => r.id === "AI-10");
    expect(crb?.status, "no clinical review board has been constituted").toBe("Partial");
  });
});
