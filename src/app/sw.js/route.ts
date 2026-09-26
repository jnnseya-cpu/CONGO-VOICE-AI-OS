import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

/**
 * The service worker, served with a version that changes when the build does.
 *
 * It used to be a static file with `const VERSION = "v1"` written into it. A
 * browser only reinstalls a service worker when the script's own bytes change,
 * so that file — identical on every deploy — meant the worker installed once
 * and then never updated again. Its `activate` step, the one that deletes the
 * old caches, could not run. Every subsequent release was invisible to anybody
 * who had already opened the site: new code was deployed and an old app kept
 * being served from a cache nothing was allowed to clear.
 *
 * That is close to unfixable from the outside — a citizen cannot be asked to
 * clear site data — so the version is stamped from the build here. A new image
 * produces new bytes, the browser sees a changed worker, and the activate step
 * runs and clears what came before.
 *
 * Served from a route rather than from public/ for exactly that reason: a
 * static file cannot know what build it belongs to.
 */

// Read once per process, at module load: the file does not change under a
// running instance, and reading it per request would be a filesystem hit on the
// path every cold start takes.
const SOURCE = readFileSync(new URL("./sw-source.js", import.meta.url), "utf8");

/**
 * BUILD_ID is set from the commit the image was built at. Without it the
 * process start time is used, which still changes per deployment — a weaker
 * guarantee than the commit, and a much stronger one than a constant.
 */
const VERSION = process.env.BUILD_ID?.trim() || `t${Date.now().toString(36)}`;

const BODY = SOURCE.replace(/^const VERSION = "[^"]*";$/m, `const VERSION = ${JSON.stringify(VERSION)};`);

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(BODY, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // The worker script itself must never be served from a cache: it is the
      // thing that tells the browser a new version exists.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      // Without this the worker may only control the path it was served from.
      "Service-Worker-Allowed": "/",
    },
  });
}
