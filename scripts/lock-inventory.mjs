#!/usr/bin/env node
/**
 * Write or verify inventory.lock.json.
 *
 *   node scripts/lock-inventory.mjs            # rewrite the lock (a deliberate act)
 *   node scripts/lock-inventory.mjs --check    # compare; non-zero on any drift
 *
 * Rewriting the lock is how a change is declared. It lands in the diff, a
 * reviewer sees exactly which surface moved, and nothing has to be remembered.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { collectInventory, serialise } from "./inventory.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCK = join(ROOT, "inventory.lock.json");
const check = process.argv.includes("--check");

const current = collectInventory(ROOT);

if (!check) {
  writeFileSync(LOCK, serialise(current), "utf8");
  console.log(`inventory.lock.json written — ${summary(current)}`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  console.error("inventory.lock.json is missing. Run: npm run lock");
  process.exit(1);
}

const locked = JSON.parse(readFileSync(LOCK, "utf8"));
const drift = compare(locked, current);

if (drift.length === 0) {
  console.log(`inventory unchanged — ${summary(current)}`);
  process.exit(0);
}

console.error(`\n${drift.length} surface(s) differ from inventory.lock.json:\n`);
for (const d of drift) console.error(d);
console.error(
  "\nIf every line above is intended, declare it:  npm run lock\n" +
    "and commit inventory.lock.json with the change that caused it.\n",
);
process.exit(1);

/** Flattens to "a.b.c" → value, so a diff names the exact surface. */
function flatten(value, prefix = "", out = {}) {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    out[prefix] = value;
    return out;
  }
  for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function compare(locked, current) {
  const a = flatten(locked);
  const b = flatten(current);
  const lines = [];
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const was = a[key];
    const now = b[key];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    if (was === undefined) {
      lines.push(`  + ${key}  (new surface)  ${JSON.stringify(now)}`);
      continue;
    }
    if (now === undefined) {
      lines.push(`  - ${key}  REMOVED ENTIRELY  (was ${JSON.stringify(was)})`);
      continue;
    }
    if (Array.isArray(was) && Array.isArray(now)) {
      const gone = was.filter((v) => !now.includes(v));
      const added = now.filter((v) => !was.includes(v));
      if (gone.length) lines.push(`  - ${key}  DROPPED: ${gone.join(", ")}`);
      if (added.length) lines.push(`  + ${key}  added: ${added.join(", ")}`);
      if (!gone.length && !added.length) lines.push(`  ~ ${key}  reordered`);
      continue;
    }
    lines.push(`  ~ ${key}\n      was: ${JSON.stringify(was)}\n      now: ${JSON.stringify(now)}`);
  }
  return lines;
}

function summary(i) {
  return [
    `${i.db.tableCount} tables`,
    `${i.api.routeCount} routes`,
    `${i.rbac.roles.length} roles`,
    `${i.rbac.permissions.length} permissions`,
    `${i.ai.agents.length} agents`,
    `${i.scheduler.steps.length} scheduler steps`,
    `${i.slo.objectives.length} objectives`,
    `${i.tests.fileCount} test files`,
    `${i.docs.aiOs.length} AI-OS documents`,
  ].join(", ");
}
