import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `.env.example` is the deployment contract: an operator reads it to know what to
 * set. A variable the code reads but the file never mentions is a silent
 * misconfiguration waiting to happen, and a variable the file advertises but no
 * code reads is a setting an operator can change with no effect. Both fail here.
 */
const ROOTS = ["src", "scripts"];
/** Runtime-provided or test-only, never set by an operator. */
const EXEMPT = new Set(["NODE_ENV", "VITEST", "PGLITE_MEMORY", "PORT", "npm_package_version"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function readVars(): Set<string> {
  const found = new Set<string>();
  for (const root of ROOTS) {
    for (const file of walk(path.resolve(root))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(m[1]);
      for (const m of src.matchAll(/process\.env\["([A-Z][A-Z0-9_]*)"\]/g)) found.add(m[1]);
      // Helpers that take the variable name as a literal: num(), flag(), order().
      for (const m of src.matchAll(/\b(?:num|flag|order)\(\s*"([A-Z][A-Z0-9_]*)"/g)) found.add(m[1]);
    }
  }
  return found;
}

function exampleVars(): Set<string> {
  const text = fs.readFileSync(path.resolve(".env.example"), "utf8");
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

describe("environment contract", () => {
  const used = readVars();
  const declared = exampleVars();

  it("documents every variable the code reads", () => {
    const missing = [...used].filter((v) => !declared.has(v) && !EXEMPT.has(v)).sort();
    expect(missing, `absent from .env.example: ${missing.join(", ")}`).toEqual([]);
  });

  it("advertises no variable the code ignores", () => {
    const unread = [...declared].filter((v) => !used.has(v) && !EXEMPT.has(v)).sort();
    expect(unread, `declared in .env.example but never read: ${unread.join(", ")}`).toEqual([]);
  });
});
