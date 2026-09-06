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
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") },
  },
});
