import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * Lightweight dependency-free vector-ish index.
 * Uses lexical overlap (token bigrams) scoring, which is surprisingly
 * effective for code/notes retrieval and needs no native deps.
 *
 * The surface API mirrors what a real embedding backend (OpenAI embeddings,
 * sqlite-vec, Chroma) would expose, so it can be swapped later without
 * touching callers.
 */
export interface VectorEntry {
  id: string;
  text: string;
  meta?: Record<string, unknown>;
}

export class VectorIndex {
  private entries: VectorEntry[] = [];
  private readonly file: string;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "vector-index.json");
    if (existsSync(this.file)) {
      try {
        this.entries = JSON.parse(readFileSync(this.file, "utf8")) as VectorEntry[];
      } catch {
        this.entries = [];
      }
    }
  }

  private tokens(text: string): string[] {
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const words = clean.split(/\s+/).filter((w) => w.length > 1);
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]}_${words[i + 1]}`);
    return [...words, ...bigrams];
  }

  async add(text: string, meta?: Record<string, unknown>): Promise<string> {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.entries.push({ id, text, meta });
    this.persist();
    return id;
  }

  /** Cosine-ish overlap similarity against stored entries. */
  async query(query: string, topK = 5): Promise<Array<{ text: string; score: number; meta?: Record<string, unknown> }>> {
    const q = this.tokens(query);
    if (q.length === 0) return [];
    const qSet = new Set(q);
    const scored = this.entries.map((entry) => {
      const t = this.tokens(entry.text);
      if (t.length === 0) return { text: entry.text, score: 0, meta: entry.meta };
      const hits = t.filter((tok) => qSet.has(tok)).length;
      const score = hits / Math.sqrt(Math.max(t.length, 1) * Math.max(q.length, 1));
      return { text: entry.text, score, meta: entry.meta };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async count(): Promise<number> {
    return this.entries.length;
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.entries), "utf8");
  }

  async clear(): Promise<void> {
    this.entries = [];
    this.persist();
  }
}