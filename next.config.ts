import type { NextConfig } from "next";

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
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfkit", "exceljs"],
  agentRules: false,
  poweredByHeader: false,
  // Self-contained server bundle, so the container copies one directory.
  output: "standalone",
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
