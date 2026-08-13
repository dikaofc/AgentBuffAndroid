import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node18",
  external: ["ink", "react", "commander", "@dikabuff/shared", "@dikabuff/config", "@dikabuff/memory", "@dikabuff/tools", "@dikabuff/agent-core", "@dikabuff/plugins", "@dikabuff/terminal-ui", "@dikabuff/cli"],
  banner: { js: "#!/usr/bin/env node" },
});