import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NextConfig } from "next";

/**
 * Every package a runtime-loaded dependency needs, not just the one named.
 *
 * "node_modules/@google-cloud/storage/**" was carried into the image and its
 * fifty-seven dependencies were not, because serverExternalPackages tells the
 * tracer to stop at that package and the glob named one directory. The result
 * reached production and looked like this in the logs:
 *
 *   [orchestrator] Failed to load external module @google-cloud/storage:
 *   Cannot find module 'gcp-metadata'
 *
 * Saving the spoken answer is on the path of every turn, so that was every
 * question in all three modules failing — text, voice and photograph alike —
 * and the citizen was told "Le service est momentanément indisponible". The
 * container started, the probes passed and the home page served throughout.
 *
 * Walking the tree here rather than listing the names keeps it true when the
 * package updates: a new dependency is carried the next time the image is
 * built, and nobody has to remember.
 */
/**
 * Packages Next must not bundle, because they load parts of themselves by
 * runtime string. Declared once: the same list marks them external and pulls
 * their dependency trees into the image, so the two cannot disagree.
 */
const EXTERNAL_PACKAGES = ["@electric-sql/pglite", "pg", "pdfkit", "exceljs", "@google-cloud/storage", "sharp", "heic-decode"];

function runtimeClosure(entry: string, root = process.cwd()): string[] {
  const found = new Set<string>();

  const locate = (name: string, from: string): string | null => {
    let dir = from;
    for (;;) {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return candidate;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    const hoisted = join(root, "node_modules", name);
    return existsSync(join(hoisted, "package.json")) ? hoisted : null;
  };

  const walk = (name: string, from: string): void => {
    if (found.has(name)) return;
    const dir = locate(name, from);
    if (!dir) return;
    // @types/* are compile-time only and are never loaded by the container.
    if (name.startsWith("@types/")) return;
    found.add(name);
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      // Optional dependencies as well as required ones. sharp ships its native
      // libvips as one optional package per platform and requires whichever
      // matches at runtime; walking only `dependencies` would carry the
      // JavaScript and leave the decoder behind — the same shape of fault as
      // the missing WebAssembly it was brought in to replace. `locate` returns
      // null for the twenty-odd platforms npm did not install, so they cost
      // nothing.
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) walk(dep, dir);
    } catch {
      /* a package without a readable manifest carries nothing further */
    }
  };

  walk(entry, root);
  return [...found].sort().map((name) => `node_modules/${name}/**`);
}

const isProd = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * Every origin the platform needs is its own: the fonts are self-hosted, the
 * icons are local, and no analytics or tag manager is loaded. That lets the
 * policy refuse third-party script, style, font, frame and form targets
 * outright, which is what closes the usual exfiltration routes after an
 * injection.
 *
 * `script-src` still allows inline script. Next.js bootstraps hydration with an
 * inline script and the pages carry inline JSON-LD; removing the allowance
 * needs a per-request nonce, which in turn forces every prerendered page to be
 * rendered on demand. That trade — 158 static pages becoming dynamic — is a
 * decision for the programme, not a default, so it is written up in
 * docs/SECURITY.md rather than taken here.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Embedded PostgreSQL (WASM) and the pg driver must not be bundled by webpack/turbopack.
  // @google-cloud/storage joins them: it resolves parts of itself at runtime and
  // does not survive bundling. Listed here it stays a real package on disk —
  // and, crucially, one the file tracer still follows into the standalone
  // output. The previous arrangement (webpackIgnore plus an indirect specifier)
  // hid it from the tracer, so it was absent from the image and every voice turn
  // failed with "Cannot find package".
  serverExternalPackages: EXTERNAL_PACKAGES,
  agentRules: false,
  poweredByHeader: false,
  // Self-contained server bundle, so the container copies one directory.
  output: "standalone",
  /**
   * The tracer walks the working directory and pulled the whole runtime data
   * directory into the bundle — on a developer machine that is a 60 MB embedded
   * database holding the seeded platform administrator whose PIN is printed in
   * the source. Building on a laptop would have shipped it to production.
   */
  outputFileTracingExcludes: {
    "*": ["data/**", ".test-data/**", "screenshots-blog/**"],
  },
  /**
   * Belt and braces for the storage client. The tracer follows the literal
   * import in core/storage.ts, but that package loads further pieces of itself
   * by runtime string, which no static analysis can follow. Naming the whole
   * directory guarantees the image carries it: a recording that cannot be
   * written is a gap in a citizen's record, and finding out at runtime costs a
   * deployment — and naming only that directory, as this did, cost one.
   */
  outputFileTracingIncludes: {
    "*": [
      // Every external package's whole tree, not just the package. pdfkit and
      // exceljs were missing pieces too; report export would have failed the
      // same way the moment somebody used it.
      ...EXTERNAL_PACKAGES.flatMap((name) => runtimeClosure(name)),
      // The service worker's source is read at runtime by its route. A file the
      // tracer does not carry is a 500 on /sw.js, which takes offline support
      // with it — and this repository has already shipped one missing file that
      // every gate passed over.
      "src/app/sw.js/sw-source.js",
    ],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
      ],
    },
    {
      // Fonts and icons are immutable: the filename changes when the file does.
      source: "/fonts/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      // Never let an intermediary cache an API answer about one citizen.
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Vary", value: "Cookie, Authorization" },
      ],
    },
  ],
};

export default nextConfig;
