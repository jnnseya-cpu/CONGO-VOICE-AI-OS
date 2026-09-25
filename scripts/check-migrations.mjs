/**
 * Migration safety (DO-05).
 *
 * The expand-and-contract discipline exists because a migration runs while the
 * previous version of the application is still serving traffic. Dropping a
 * column the running code still selects takes the platform down in the seconds
 * between the migration and the deploy, and on a national service that window
 * is calls that do not get answered.
 *
 * So a destructive statement is not forbidden, it is made deliberate: it needs a
 * comment saying why, on the line before, which ends up in the review.
 *
 *   node scripts/check-migrations.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "drizzle";
const MARKER = /^--\s*destructive:\s*\S/i;

const DESTRUCTIVE = [
  { re: /\bDROP\s+TABLE\b/i, what: "drops a table" },
  { re: /\bDROP\s+COLUMN\b/i, what: "drops a column" },
  { re: /\bDROP\s+(?:TYPE|SCHEMA)\b/i, what: "drops a type or schema" },
  { re: /\bALTER\s+COLUMN\b[\s\S]*\bTYPE\b/i, what: "changes a column type in place" },
  { re: /\bSET\s+NOT\s+NULL\b/i, what: "makes an existing column mandatory" },
  { re: /\bTRUNCATE\b/i, what: "empties a table" },
  { re: /\bDELETE\s+FROM\b/i, what: "deletes rows" },
  { re: /\bRENAME\s+(?:COLUMN|TO)\b/i, what: "renames, which the previous version cannot see" },
];

if (!fs.existsSync(DIR)) {
  console.log("no drizzle/ directory: nothing to check");
  process.exit(0);
}

const problems = [];
let statements = 0;

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  const lines = fs.readFileSync(path.join(DIR, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) return;
    statements++;
    for (const rule of DESTRUCTIVE) {
      if (!rule.re.test(trimmed)) continue;
      // Look back past blank lines for the marker.
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      const declared = j >= 0 && MARKER.test(lines[j].trim());
      if (!declared) {
        problems.push(`${file}:${i + 1} ${rule.what}\n    ${trimmed.slice(0, 120)}\n    add a line above it: -- destructive: why this is safe now`);
      }
    }
  });
}

console.log(`${statements} statement(s) checked across ${fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).length} migration file(s).`);
if (problems.length === 0) {
  console.log("No undeclared destructive statement.");
  process.exit(0);
}
console.log(`\n${problems.length} undeclared destructive statement(s):\n`);
for (const p of problems) console.log(`  ${p}\n`);
process.exit(1);
