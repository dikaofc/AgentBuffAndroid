import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts", "apps/*/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    coverage: {
      reporter: ["text", "json-summary"],
      include: ["packages/*/src/**/*.ts"],
    },
  },
});