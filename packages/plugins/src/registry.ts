import type { PluginDefinition } from "./sdk";

/** In-memory registry of activated plugins (tools already merged into the main ToolRegistry). */
export class PluginRegistry {
  private plugins = new Map<string, PluginDefinition>();

  register(plugin: PluginDefinition): void {
    if (this.plugins.has(plugin.manifest.name)) {
      throw new Error(`Plugin already loaded: ${plugin.manifest.name}`);
    }
    this.plugins.set(plugin.manifest.name, plugin);
  }

  get(name: string): PluginDefinition | undefined {
    return this.plugins.get(name);
  }

  list(): PluginDefinition[] {
    return [...this.plugins.values()];
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  remove(name: string): boolean {
    return this.plugins.delete(name);
  }
}