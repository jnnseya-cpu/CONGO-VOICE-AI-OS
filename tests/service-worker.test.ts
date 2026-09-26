/**
 * A service worker whose bytes never change is never reinstalled.
 *
 * The worker shipped as a static file containing `const VERSION = "v1"`. A
 * browser reinstalls a worker only when the script itself changes, so that file
 * — identical on every deploy — installed once and then never updated. Its
 * activate step, the one that deletes the previous caches, could not run.
 *
 * The consequence is the worst kind: every release after a citizen's first
 * visit was invisible to them. New code was deployed and an old app kept being
 * served from a cache nothing was permitted to clear, and there is no fix from
 * the outside — a citizen cannot be asked to clear site data.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/sw.js/sw-source.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/sw.js/route.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

/** The substitution the route performs, applied here to the real source. */
function stamp(version: string): string {
  return source.replace(/^const VERSION = "[^"]*";$/m, `const VERSION = ${JSON.stringify(version)};`);
}

describe("the version is stamped from the build", () => {
  it("has exactly one version constant for the route to replace", () => {
    const matches = source.match(/^const VERSION = "[^"]*";$/gm) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("replaces it, so two builds produce different bytes", () => {
    const a = stamp("commit-aaa");
    const b = stamp("commit-bbb");
    expect(a).toContain('const VERSION = "commit-aaa";');
    expect(a).not.toBe(b);
  });

  it("carries the version into both cache names", () => {
    // If the names did not change, activate would delete nothing and the old
    // shell would survive the update that was supposed to replace it.
    const out = stamp("xyz789");
    expect(out).toContain("cvos-shell-${VERSION}");
    expect(out).toContain("cvos-data-${VERSION}");
    expect(out).toContain('const VERSION = "xyz789";');
  });

  it("clears caches that do not match the current version", () => {
    expect(source).toContain("caches.delete");
    expect(source).toContain("clients.claim");
  });
});

describe("the worker is served in a way a browser will re-check", () => {
  it("is a route, not a static file, because a static file cannot know its build", () => {
    expect(route).toContain("sw-source.js");
    expect(route).toContain("process.env.BUILD_ID");
  });

  it("forbids caching the worker script itself", () => {
    // The script is the thing that announces a new version; a cached copy
    // announces the old one for ever.
    expect(route).toMatch(/Cache-Control[^\n]*no-store/);
  });

  it("allows the worker to control the whole origin", () => {
    expect(route).toContain("Service-Worker-Allowed");
  });

  it("is carried into the standalone build", () => {
    // Read at runtime by the route, so the tracer must be told: this repository
    // has already shipped one missing file that every other gate passed over.
    expect(config).toContain("src/app/sw.js/sw-source.js");
  });
});

describe("a waiting worker is told to take over", () => {
  const registration = readFileSync(new URL("../src/client/components/shell/ServiceWorker.tsx", import.meta.url), "utf8");

  it("asks a worker that is waiting to activate", () => {
    // Otherwise the new build waits until every tab is closed, which on a phone
    // is never.
    expect(registration).toContain("cvos-skip-waiting");
    expect(source).toContain("cvos-skip-waiting");
  });

  it("checks for an update rather than waiting for the browser's own schedule", () => {
    expect(registration).toContain("registration.update()");
  });

  it("reloads once, and guards against reloading again", () => {
    // A reload triggered by a controller change that triggers another is an
    // infinite refresh, and the citizen can read nothing at all.
    expect(registration).toContain("controllerchange");
    expect(registration).toContain("reloading");
  });
});
