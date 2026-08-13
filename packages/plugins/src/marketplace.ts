import { createHash } from "node:crypto";
import type { PluginDefinition, PluginManifest } from "./sdk";

/**
 * Marketplace architecture.
 *
 * Registry index (`marketplace.json`):
 *   { "name": "dikabuff-marketplace", "plugins": [
 *       { "name": "docker", "version": "1.0.0", "checksum": "sha256:...",
 *         "source": { "type": "npm", "package": "@dikabuff-plugin/docker" } } ] }
 *
 * Install flow: resolve index → verify plugin manifest + integrity checksum →
 * install artifact (npm package or JS bundle) → load & activate.
 * Publishing flow is out of scope for the CLI itself; the marketplace index is
 * a plain JSON file served over HTTP(S) or a local file path.
 */
export interface MarketplaceIndex {
  name: string;
  version: string;
  updatedAt?: string;
  plugins: MarketplacePluginEntry[];
}

export interface MarketplacePluginEntry {
  name: string;
  version: string;
  description?: string;
  checksum?: string;
  manifest?: PluginManifest;
  source: {
    type: "npm" | "file" | "url";
    package?: string;
    url?: string;
  };
}

export async function fetchMarketplaceIndex(source: string | URL): Promise<MarketplaceIndex> {
  const url = typeof source === "string" ? source : source.href;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Marketplace ${url} returned ${res.status}`);
    return (await res.json()) as MarketplaceIndex;
  }
  const fs = await import("node:fs");
  return JSON.parse(fs.readFileSync(url, "utf8")) as MarketplaceIndex;
}

export function verifyChecksum(data: Buffer, expected: string): boolean {
  const [algo = "sha256", hash = ""] = expected.split(":");
  if (!hash) return false;
  const actual = createHash(algo).update(data).digest("hex");
  return actual === hash;
}

export function findPlugin(index: MarketplaceIndex, name: string, version?: string): MarketplacePluginEntry | undefined {
  return index.plugins.find((p) => p.name === name && (!version || p.version === version));
}