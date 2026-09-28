#!/usr/bin/env node
/**
 * Does the image actually contain what it loads at runtime?
 *
 *   npm run build && node scripts/check-standalone.mjs
 *
 * This exists because every other gate passed while production was broken.
 * tests/runtime-dependencies.test.ts checks that a dynamically imported package
 * is declared in package.json — @google-cloud/storage was. Typecheck, lint,
 * 1580 tests, the production build, the container start and both probes all
 * passed. And then every question in all three modules failed, because the
 * standalone output carried @google-cloud/storage without the fifty-seven
 * packages it needs:
 *
 *   [orchestrator] Failed to load external module @google-cloud/storage:
 *   Cannot find module 'gcp-metadata'
 *
 * The gap is that every other check reads the source. This one reads the
 * artefact that will actually be deployed, which is the only place this class
 * of defect is visible.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const STANDALONE = join(ROOT, ".next", "standalone", "node_modules");

/** Packages Next is told not to bundle: each must be present with its whole tree. */
function externalPackages() {
  const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
  const block = config.match(/const EXTERNAL_PACKAGES = \[([^\]]*)\]/s);
  if (!block) return [];
  return [...block[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

function closure(entry) {
  const found = new Set();
  const locate = (name, from) => {
    let dir = from;
    for (;;) {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return candidate;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    const hoisted = join(ROOT, "node_modules", name);
    return existsSync(join(hoisted, "package.json")) ? hoisted : null;
  };
  const walk = (name, from) => {
    if (found.has(name)) return;
    const dir = locate(name, from);
    if (!dir) return;
    if (name.startsWith("@types/")) return; // compile-time only
    found.add(name);
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      // Optional as well as required: sharp's native libvips is an optional
      // dependency per platform, and it is the decoder, not an extra.
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) walk(dep, dir);
    } catch {
      /* unreadable manifest carries nothing further */
    }
  };
  walk(entry, ROOT);
  return [...found];
}

if (!existsSync(STANDALONE)) {
  console.error("No .next/standalone — run `npm run build` first.");
  process.exit(2);
}

/** Files read at runtime by path rather than imported. */
const REQUIRED_FILES = [
  [".next/standalone/src/app/sw.js/sw-source.js", "the service worker's source, read by its route"],
  ["drizzle/0000_init.sql", "the schema the bootstrap applies on first boot"],
  ["drizzle/meta/_journal.json", "the migration journal the bootstrap reads"],
];

let failed = 0;
console.log("Checking what the deployed image will actually contain.\n");

for (const entry of externalPackages()) {
  const needed = closure(entry);
  const missing = needed.filter((name) => !existsSync(join(STANDALONE, name, "package.json")));
  const status = missing.length === 0 ? "ok  " : "MISS";
  console.log(`  ${status} ${entry}  (${needed.length - missing.length}/${needed.length} packages present)`);
  if (missing.length > 0) {
    failed += 1;
    for (const name of missing.slice(0, 12)) console.log(`         missing: ${name}`);
    if (missing.length > 12) console.log(`         …and ${missing.length - 12} more`);
  }
}

for (const [rel, why] of REQUIRED_FILES) {
  const full = join(ROOT, rel.startsWith(".next/") ? rel : join(".next", "standalone", rel));
  const present = existsSync(full) || existsSync(join(ROOT, rel));
  console.log(`  ${present ? "ok  " : "MISS"} ${rel}  — ${why}`);
  if (!present) failed += 1;
}

/**
 * Decode a real photograph with the image's own copies of the decoders.
 *
 * Presence of a package is not proof it works. The HEIC path failed in
 * production while every package it named was installed: the bundler had
 * inlined libheif's emscripten glue and left `libheif.wasm` out, so the decoder
 * resolved and then could not load. Nothing that reads source or counts
 * directories can see that.
 *
 * It also catches the opposite mistake, and did. sharp reports HEIC in its
 * format table and returns correct dimensions from `metadata()`, so it looks
 * like a decoder; its prebuilt libvips has AV1 but not HEVC, which is the codec
 * a phone writes. This check failed on exactly that, after the application had
 * already been rewritten to rely on it — a header parse that looks like success
 * is the kind of thing only a real file catches.
 *
 * The two steps mirror src/server/core/images.ts. They are duplicated rather
 * than imported because the application's copy is inside a server chunk with no
 * entry point; the unit tests cover that function against the same fixture, and
 * this covers the built image's ability to run it.
 */
async function decodesARealPhotograph() {
  const fixture = join(ROOT, "tests", "fixtures", "camera-photo.heic");
  if (!existsSync(fixture)) {
    console.log("  MISS tests/fixtures/camera-photo.heic — the HEIC the decode check needs");
    return false;
  }

  const load = async (pkg) => {
    const pkgPath = join(STANDALONE, pkg, "package.json");
    if (!existsSync(pkgPath)) throw new Error(`${pkg} is not in the standalone output at all`);
    const manifest = JSON.parse(readFileSync(pkgPath, "utf8"));
    // Resolved from the manifest rather than a guessed path: sharp moved from
    // lib/index.js to dist/index.mjs in 0.35, and a stale path would fail this
    // check for a reason that has nothing to do with the image.
    const rel = manifest.exports?.["."]?.import?.default ?? manifest.module ?? manifest.main ?? "index.js";
    const entry = join(STANDALONE, pkg, rel);
    if (!existsSync(entry)) throw new Error(`${pkg}'s own entry point (${rel}) is not in the image`);
    return (await import(pathToFileURL(entry).href)).default;
  };

  try {
    const heicDecode = await load("heic-decode");
    const sharp = await load("sharp");

    const raw = await heicDecode({ buffer: new Uint8Array(readFileSync(fixture)) });
    if (!raw?.width || raw.data.byteLength !== raw.width * raw.height * 4) {
      console.log("  FAIL libheif returned something that is not a full RGBA image");
      return false;
    }

    const out = await sharp(Buffer.from(raw.data), { raw: { width: raw.width, height: raw.height, channels: 4 } })
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    if (out.data[0] !== 0xff || out.data[1] !== 0xd8) {
      console.log("  FAIL a real HEIC re-encoded to something that is not a JPEG");
      return false;
    }
    console.log(`  ok   a real HEVC-coded HEIC decodes to ${raw.width}x${raw.height} and re-encodes to a ${out.data.length}-byte JPEG`);
    return true;
  } catch (err) {
    console.log(`  FAIL a real HEIC could not be processed by the image's own decoders: ${err?.message ?? err}`);
    return false;
  }
}

if (!(await decodesARealPhotograph())) failed += 1;

console.log("");
if (failed > 0) {
  console.error(`${failed} item(s) the running container will not find. This is what a`);
  console.error("passing build and a failing production look like; do not deploy this image.");
  process.exit(1);
}
console.log("Everything the container loads at runtime is in the image.");
