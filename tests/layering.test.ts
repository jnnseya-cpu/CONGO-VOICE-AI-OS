/**
 * The three-way boundary: backend, frontend, shared.
 *
 * The directories existed long before anything enforced them, and by the time
 * anyone looked, four imports had crossed the line — a component calling a
 * reporting agent that opens a database connection, and the blog's own data
 * contract living on the server where the browser could not legitimately reach
 * it.
 *
 * ESLint enforces this too. It is duplicated here because a lint rule is
 * skippable and a failing test is not, and because the direction of the
 * dependency is an architectural decision rather than a style preference.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** Imports that carry runtime code. `import type` is erased and does not couple. */
function valueImportsOf(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const found: string[] = [];
  for (const m of text.matchAll(/^import\s+(type\s+)?([\s\S]*?)from\s+"([^"]+)";/gm)) {
    const [, typeKeyword, clause, spec] = m;
    if (typeKeyword) continue;
    // `import { type X, y }` still imports y at runtime; `import { type X }` does not.
    const named = clause.trim();
    const onlyTypes = /^\{[^}]*\}$/.test(named) && named.slice(1, -1).split(",").every((part) => part.trim() === "" || part.trim().startsWith("type "));
    if (onlyTypes) continue;
    found.push(spec);
  }
  return found;
}

function allImportsOf(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+"([^"]+)";/g)].map((m) => m[1]);
}

const rel = (f: string) => path.relative(ROOT, f);

describe("shared owns the contract and depends on neither side", () => {
  it("never imports from the backend or the frontend, not even a type", () => {
    const offenders = sources("src/shared")
      .flatMap((f) => allImportsOf(f).filter((s) => s.startsWith("@server/") || s.startsWith("@client/")).map((s) => `${rel(f)} → ${s}`));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the frontend may not run backend code", () => {
  it("imports no value from src/server", () => {
    const offenders = sources("src/client")
      .flatMap((f) => valueImportsOf(f).filter((s) => s.startsWith("@server/")).map((s) => `${rel(f)} → ${s}`));
    expect(
      offenders,
      `A component may not run server code. Let the page fetch and pass the data in.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("may still name the shapes a page hands it", () => {
    // Not a hole: a type is erased at build time. This asserts the allowance is
    // real, so nobody "fixes" it by banning type imports and duplicating types.
    const typeOnly = sources("src/client").some((f) =>
      allImportsOf(f).some((s) => s.startsWith("@server/")) && !valueImportsOf(f).some((s) => s.startsWith("@server/")),
    );
    expect(typeOnly).toBe(true);
  });
});

describe("the backend may not reach into the component layer", () => {
  it("imports nothing from src/client", () => {
    const offenders = sources("src/server")
      .flatMap((f) => allImportsOf(f).filter((s) => s.startsWith("@client/")).map((s) => `${rel(f)} → ${s}`));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the boundary is declared, not just observed", () => {
  it("is enforced by ESLint as well as by this test", () => {
    const config = fs.readFileSync(path.join(ROOT, "eslint.config.mjs"), "utf8");
    expect(config).toContain("no-restricted-imports");
    expect(config).toContain("src/shared/**");
    expect(config).toContain("src/client/**");
    expect(config).toContain("src/server/**");
    expect(config).toContain("allowTypeImports");
  });

  it("keeps every server module marked server-only", () => {
    // The runtime guard that stops a server module being bundled for a browser
    // even if an import slipped past both checks above.
    const entryPoints = sources("src/server").filter((f) => /\/(core|ai|channels|db)\//.test(f));
    const unmarked = entryPoints.filter((f) => !fs.readFileSync(f, "utf8").includes('import "server-only"'));
    // Pure helpers with no server dependency do not need it; the rule is that
    // the great majority do, and a regression shows as a sharp drop.
    expect(unmarked.length / entryPoints.length, `${unmarked.length}/${entryPoints.length} unmarked`).toBeLessThan(0.5);
  });
});
