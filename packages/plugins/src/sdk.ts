import type { AgentHooks } from "@dikabuff/agent-core";
import type { ToolDefinition } from "@dikabuff/shared";

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** Space-separated semver constraint of the diba CLI this plugin targets. */
  engines?: { dikabuff?: string };
  /** Tool names this plugin requires at load time. */
  requiresTools?: string[];
  /** Declared permissions the plugin asks for (allow/ask/deny). */
  permissions?: Record<string, "allow" | "ask" | "deny">;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  tools?: ToolDefinition[];
  hooks?: AgentHooks;
  /** CLI subcommand hooks: `dikabuff plugin run <name> <args...>`. */
  commands?: Array<{
    name: string;
    description: string;
    run(args: string[], ctx: PluginCommandContext): Promise<number>;
  }>;
  /** Called once after registration. */
  onActivate?(ctx: PluginActivationContext): Promise<void> | void;
  onDeactivate?(): Promise<void> | void;
}

export interface PluginCommandContext {
  cwd: string;
  argv: string[];
  log: { info(m: string): void; error(m: string): void };
}

export interface PluginActivationContext {
  cwd: string;
  log: { info(m: string): void; error(m: string): void };
}

/**
 * Plugin SDK entry — the only import a plugin needs:
 *   import { definePlugin } from "@dikabuff/plugins";
 */
export function definePlugin(def: PluginDefinition): PluginDefinition {
  validateManifest(def.manifest);
  return def;
}

export function validateManifest(manifest: PluginManifest): void {
  if (!/^[a-z0-9][a-z0-9-_.]{1,63}$/.test(manifest.name)) {
    throw new Error(`Invalid plugin name "${manifest.name}" — use lowercase letters, digits, - _ .`);
  }
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    throw new Error(`Invalid plugin version "${manifest.version}" for ${manifest.name}`);
  }
  const names = new Set<string>();
  for (const tool of manifest.requiresTools ?? []) {
    if (names.has(tool)) throw new Error(`Duplicate required tool "${tool}" in ${manifest.name}`);
    names.add(tool);
  }
  if (manifest.engines?.dikabuff && !/^\d+\.\d+\.\d+/.test(manifest.engines.dikabuff)) {
    throw new Error(`Invalid engines.dikabuff "${manifest.engines.dikabuff}" in ${manifest.name}`);
  }
}