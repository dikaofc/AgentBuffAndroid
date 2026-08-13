import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import type { PluginDefinition } from "./sdk";

export interface LoadPluginResult {
  plugin: PluginDefinition;
  source: "file" | "package";
}

/**
 * Loads plugin entry points from ~/.dikabuff/plugins/.
 * Accepts either:
 *  - `<name>/index.js`  (installed package, compiled)
 *  - `<name>.js`        (single-file plugin)
 */
export async function loadPluginFromDir(pluginsDir: string, name: string): Promise<LoadPluginResult> {
  const candidates = [
    path.join(pluginsDir, name, "dist", "index.js"),
    path.join(pluginsDir, name, "index.js"),
    path.join(pluginsDir, `${name}.js`),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) {
    throw new Error(`Plugin "${name}" not found in ${pluginsDir} (tried ${candidates.join(", ")})`);
  }
  const mod = (await import(pathToFileURL(file).href)) as { default?: PluginDefinition; definePlugin?: (d: PluginDefinition) => PluginDefinition };
  let plugin = mod.default;
  if (!plugin) {
    throw new Error(`Plugin "${name}" must export a default PluginDefinition`);
  }
  return { plugin, source: "file" };
}

export function loadAllPlugins(pluginsDir: string, names: string[]): Promise<Array<LoadPluginResult | { error: string; name: string }>> {
  return Promise.all(
    names.map(async (name) => {
      try {
        return await loadPluginFromDir(pluginsDir, name);
      } catch (err) {
        return { name, error: (err as Error).message };
      }
    }),
  );
}