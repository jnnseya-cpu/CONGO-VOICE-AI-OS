/**
 * Every module the platform loads at runtime must be installed.
 *
 * STORAGE_DRIVER=gcs made the platform import "@google-cloud/storage", which was
 * not in package.json. Nothing caught it: the specifier is a runtime string, so
 * typecheck, lint and 1276 tests all passed, the image built, the container
 * started and passed its probes — and then every single question in all three
 * modules returned 500, because saving the spoken answer is on the path of every
 * turn. A citizen describing a child's symptoms got "Erreur interne".
 *
 * A dynamic import of a bare specifier is therefore checked here: it is the one
 * kind of missing dependency no other gate in this repository can see.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require_ = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** node: builtins, and paths this repository resolves through tsconfig. */
const isInternal = (spec: string) =>
  spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") ||
  spec.startsWith("@server/") || spec.startsWith("@client/") || spec.startsWith("@shared/") || spec.startsWith("@/");

/** "@scope/name/sub" -> "@scope/name"; "name/sub" -> "name". */
const packageOf = (spec: string) =>
  spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

/**
 * Specifiers reached by a dynamic import. Both the inline form and the one
 * storage.ts uses — a const holding the name, so a bundler leaves it alone —
 * because the second is exactly the one that hid this bug.
 */
function dynamicSpecifiers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\bimport\(\s*(?:\/\*[^*]*\*\/\s*)?["']([^"']+)["']\s*\)/g)) found.add(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*(?:\/\*[^*]*\*\/\s*)?([A-Za-z_$][\w$]*)\s*\)/g)) {
    const ident = m[1];
    const assigned = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*(?::[^=]+)?=\\s*["']([^"']+)["']`).exec(text);
    if (assigned) found.add(assigned[1]);
  }
  return [...found];
}

describe("every dynamically imported package is installed", () => {
  const files = [...sources("src")];

  it("finds the dynamic imports it is meant to be checking", () => {
    // A regex that silently matches nothing would make this whole file pass.
    const all = files.flatMap((f) => dynamicSpecifiers(readFileSync(f, "utf8")));
    expect(all.length).toBeGreaterThan(5);
    expect(all).toContain("@google-cloud/storage");
  });

  it("declares each one in package.json", () => {
    const missing: string[] = [];
    for (const file of files) {
      for (const spec of dynamicSpecifiers(readFileSync(file, "utf8"))) {
        if (isInternal(spec)) continue;
        const name = packageOf(spec);
        if (!declared.has(name)) missing.push(`${file}: import("${spec}") -> ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("resolves each one from disk, so a declared-but-absent package also fails", () => {
    const unresolvable: string[] = [];
    for (const file of files) {
      for (const spec of dynamicSpecifiers(readFileSync(file, "utf8"))) {
        if (isInternal(spec)) continue;
        try {
          require_.resolve(spec);
        } catch {
          // Some packages are ESM-only and cannot be resolved by require; the
          // package directory existing is enough to prove it is installed.
          try {
            require_.resolve(`${packageOf(spec)}/package.json`);
          } catch {
            if (!statSync(join("node_modules", packageOf(spec)), { throwIfNoEntry: false })?.isDirectory()) {
              unresolvable.push(`${file}: ${spec}`);
            }
          }
        }
      }
    }
    expect(unresolvable).toEqual([]);
  });
});

describe("the storage driver the deployment selects actually loads", () => {
  it("can load the GCS client, which every saved recording and spoken answer needs", async () => {
    // Not a mock: the real module, because the failure was that it was absent.
    const mod = (await import("@google-cloud/storage")) as { Storage?: unknown };
    expect(typeof mod.Storage).toBe("function");
  });
});

describe("the storage client survives the standalone build", () => {
  /**
   * Adding the package to package.json was not enough, and the deployment said
   * so: "Cannot find package '@google-cloud/storage'" kept arriving from inside
   * the container after the dependency existed. The import was written as a
   * const holding the name plus a webpackIgnore comment — deliberately, to keep
   * an optional dependency out of the bundle — and the effect is that Next's
   * file tracer cannot see it, so the package is never copied into
   * .next/standalone and the image ships without it.
   *
   * Three things have to hold together. Any one of them alone fails.
   */
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("../src/server/core/storage.ts", import.meta.url), "utf8");

  it("imports it by a literal specifier, which is what the tracer follows", () => {
    expect(storage).toContain('import("@google-cloud/storage")');
  });

  it("does not hide that import from the bundler", () => {
    // webpackIgnore is what made it invisible to tracing.
    const importLine = storage.split("\n").find((l) => l.includes('import("@google-cloud/storage")')) ?? "";
    expect(importLine).not.toContain("webpackIgnore");
  });

  it("marks it external, so it stays a real package rather than being bundled", () => {
    const external = /serverExternalPackages:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    expect(external).toContain("@google-cloud/storage");
  });

  it("names it in the traced files, because it loads parts of itself by runtime string", () => {
    // No static analysis can follow those, so the directory is included whole.
    expect(config).toContain("node_modules/@google-cloud/storage/**");
  });
});
