import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: "test", PGLITE_MEMORY: "1", AI_ALLOW_MOCK: "true", AI_LLM_ORDER: "mock", AI_STT_ORDER: "mock", AI_TTS_ORDER: "", DATA_DIR: ".test-data", SESSION_SECRET: "test-secret" },
    fileParallelism: false,
    /**
     * NFR-010. Eighty per cent on the deterministic domain and policy code, and
     * every branch of a safety rule pack. The thresholds are the point: without
     * them the number is a report nobody reads, and coverage of the rule packs
     * is the one figure a clinical reviewer can be shown.
     */
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      /**
       * The requirement is eighty per cent on the deterministic domain and
       * policy code, not on everything: provider HTTP clients and channel
       * adapters are exercised against live services, not here, and counting
       * them would turn the figure into noise. These are the files where a
       * wrong branch changes what a citizen is told.
       */
      include: [
        "src/server/ai/protocols/**/*.ts",
        "src/server/ai/language/**/*.ts",
        "src/server/ai/safety.ts",
        "src/server/ai/agents/risk.ts",
        "src/server/ai/agents/workflow.ts",
        "src/server/ai/education/**/*.ts",
        "src/server/core/rbac.ts",
        "src/server/core/lockout.ts",
        "src/server/core/crypto.ts",
        "src/server/core/phone.ts",
        "src/server/core/flags.ts",
        "src/server/core/metering.ts",
        "src/server/core/audit.ts",
      ],
      exclude: ["src/server/**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
        // The safety layer is held higher than the rest of the platform.
        "src/server/ai/safety.ts": { lines: 90, functions: 85, statements: 90, branches: 80 },
        "src/server/ai/protocols/**": { lines: 85, functions: 80, statements: 85, branches: 75 },
        "src/server/ai/language/**": { lines: 85, functions: 85, statements: 85, branches: 75 },
      },
    },
  },
  resolve: {
    alias: { "@server": path.resolve(__dirname, "src/server"), "@shared": path.resolve(__dirname, "src/shared"), "@client": path.resolve(__dirname, "src/client"), "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") },
  },
});
