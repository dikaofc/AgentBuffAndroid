import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { safeStringify } from "@dikabuff/shared";
import type { KeyValueStore } from "./store";

/**
 * JSON-file-backed KV store. One file per key under a namespace dir.
 * Safe for small/medium memory datasets; swap to SqliteStore for scale.
 */
export class JsonStore implements KeyValueStore {
  constructor(
    private readonly dir: string,
    private readonly namespace = "kv",
    private readonly pretty = false,
  ) {
    this.nsDir = path.join(dir, namespace);
    mkdirSync(this.nsDir, { recursive: true });
  }

  private nsDir: string;

  private fileFor(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._:-]/g, "_");
    return path.join(this.nsDir, `${safe}.json`);
  }

  async read<T>(key: string): Promise<T | undefined> {
    const file = this.fileFor(key);
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    const file = this.fileFor(key);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, this.pretty ? safeStringify(value, 2) : safeStringify(value), "utf8");
  }

  async delete(key: string): Promise<void> {
    const file = this.fileFor(key);
    if (existsSync(file)) rmSync(file, { force: true });
  }

  async search(prefix: string): Promise<Array<{ key: string; value: unknown }>> {
    const out: Array<{ key: string; value: unknown }> = [];
    for (const entry of readdirSync(this.nsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const key = entry.name.replace(/\.json$/, "");
      if (!key.startsWith(prefix)) continue;
      const value = await this.read(key);
      if (value !== undefined) out.push({ key, value });
    }
    return out;
  }

  async keys(prefix = ""): Promise<string[]> {
    return readdirSync(this.nsDir)
      .filter((f) => f.endsWith(".json") && f.slice(0, -5).startsWith(prefix))
      .map((f) => f.slice(0, -5));
  }
}