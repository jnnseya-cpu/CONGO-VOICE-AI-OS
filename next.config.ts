import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Embedded PostgreSQL (WASM) and the pg driver must not be bundled by webpack/turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfkit", "exceljs"],
  agentRules: false,
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(self)" },
      ],
    },
  ],
};

export default nextConfig;
