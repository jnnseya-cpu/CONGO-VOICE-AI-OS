import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /*
   * The three-way boundary, enforced.
   *
   * src/server, src/client and src/shared were separated by directory but
   * nothing stopped the line being crossed, and four imports had already
   * crossed it. The rule is one-directional:
   *
   *   shared  ← imports nothing from the platform. It is the contract.
   *   client  ← may import shared. Never server values.
   *   server  ← may import shared. Never client.
   *
   * Type-only imports across the client/server line are allowed on purpose: a
   * type is erased at build time and creates no runtime coupling, so a
   * component may name the shape of what a page hands it without being able to
   * reach the database that produced it.
   */
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@server/*", "@client/*"], message: "src/shared is the contract both sides depend on; it may not depend on either." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@server/*"],
              allowTypeImports: true,
              message: "A component may not run server code. Let the page fetch and pass the data in; `import type` is fine.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@client/*"], message: "Server code may not reach into the component layer." },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
