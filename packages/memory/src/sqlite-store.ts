import type { KeyValueStore } from "./store";

/**
 * SQLite-backed store. Uses better-sqlite3 when available.
 * The class is lazy: better-sqlite3 is an optional dependency so the package
 * installs even on platforms where native builds fail.
 */
export class SqliteStore implements KeyValueStore {
  private db: unknown = null;

  constructor(private readonly dbPath: string) {}

  private getDb(): any {
    if (this.db) return this.db;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("better-sqlite3") as (file: string) => any;
      const db = mod(this.dbPath);
      this.db = db;
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_kv_key ON kv(key);
      `);
      return this.db;
    } catch (err) {
      throw new Error(`better-sqlite3 unavailable: ${(err as Error).message}. Use provider "json".`);
    }
  }

  async read<T>(key: string): Promise<T | undefined> {
    const row = this.getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.getDb()
      .prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(key, JSON.stringify(value), Date.now());
  }

  async delete(key: string): Promise<void> {
    this.getDb().prepare("DELETE FROM kv WHERE key = ?").run(key);
  }

  async search(prefix: string): Promise<Array<{ key: string; value: unknown }>> {
    const rows = this.getDb().prepare("SELECT key, value FROM kv WHERE key LIKE ?").all(`${prefix}%`);
    return rows.map((r: any) => ({ key: r.key, value: JSON.parse(r.value) }));
  }

  async keys(prefix = ""): Promise<string[]> {
    const rows = this.getDb().prepare("SELECT key FROM kv WHERE key LIKE ? ORDER BY key").all(`${prefix}%`);
    return (rows as Array<{ key: string }>).map((r) => r.key);
  }
}