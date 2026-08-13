import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Workspace packages resolve to their `dist/` output via package.json
 * `exports` — which doesn't exist on a fresh checkout (dist/ is gitignored).
 * Point vitest at the TypeScript source so `npm test` works from a clean
 * clone without a prior build.
 */
const src = (pkg: string, entry: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/${entry}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@dikabuff/shared": src("shared", "index.ts"),
      "@dikabuff/config": src("config", "index.ts"),
      "@dikabuff/memory": src("memory", "index.ts"),
      "@dikabuff/tools": src("tools", "index.ts"),
      "@dikabuff/learner": src("learner", "index.ts"),
      "@dikabuff/agent-core": src("agent-core", "index.ts"),
      "@dikabuff/plugins": src("plugins", "index.ts"),
      "@dikabuff/terminal-ui": src("terminal-ui", "index.tsx"),
      "@dikabuff/cli": src("cli", "index.ts"),
    },
  },
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
