import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { safeStringify } from "@dikabuff/shared";
import type { DailyLearn, LearnedToolSpec, LearnEpisode } from "./types";

/**
 * File-backed storage for the learner. Layout under `learnDir`:
 *
 *   episodes/<day>.jsonl   — one JSON episode per line, append-only
 *   daily/<day>.json       — per-day rollup
 *   tools/<name>.json      — one serialized learned tool per file
 *
 * JSONL keeps episode capture cheap (no rewrite on append); tools are one
 * file each so users can inspect or hand-edit what the agent learned.
 */
export class LearnerStore {
  readonly episodesDir: string;
  readonly dailyDir: string;
  readonly toolsDir: string;

  constructor(readonly learnDir: string) {
    this.episodesDir = path.join(learnDir, "episodes");
    this.dailyDir = path.join(learnDir, "daily");
    this.toolsDir = path.join(learnDir, "tools");
    for (const dir of [learnDir, this.episodesDir, this.dailyDir, this.toolsDir]) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /* ------------------------------ episodes ------------------------------ */

  async appendEpisode(episode: LearnEpisode): Promise<void> {
    const file = path.join(this.episodesDir, `${episode.day}.jsonl`);
    writeFileSync(file, safeStringify(episode) + "\n", { flag: "a" });
  }

  async episodesForDay(day: string): Promise<LearnEpisode[]> {
    const file = path.join(this.episodesDir, `${day}.jsonl`);
    return readJsonl<LearnEpisode>(file);
  }

  /** All episodes across days, newest first. `limit` caps total. */
  async recentEpisodes(days: string[], limit = 500): Promise<LearnEpisode[]> {
    const out: LearnEpisode[] = [];
    for (const day of days) {
      const eps = await this.episodesForDay(day);
      for (const e of eps) out.push(e);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async dayKeys(): Promise<string[]> {
    try {
      return readdirSync(this.episodesDir).map((f) => f.replace(/\.jsonl$/, "")).sort();
    } catch {
      return [];
    }
  }

  async countEpisodes(): Promise<number> {
    let total = 0;
    for (const key of await this.dayKeys()) total += (await this.episodesForDay(key)).length;
    return total;
  }

  /** Keep only the newest `max` episodes for a day (disk hygiene). */
  async truncateDay(day: string, max: number): Promise<void> {
    if (max <= 0) return;
    const file = path.join(this.episodesDir, `${day}.jsonl`);
    const eps = await this.episodesForDay(day);
    if (eps.length <= max) return;
    const keep = eps.slice(-max);
    writeFileSync(file, keep.map((e) => safeStringify(e)).join("\n") + (keep.length ? "\n" : ""), "utf8");
  }

  async pruneEpisodesBefore(day: string): Promise<void> {
    for (const key of await this.dayKeys()) {
      if (key < day) {
        try {
          rmSync(path.join(this.episodesDir, `${key}.jsonl`), { force: true });
        } catch { /* ignore */ }
      }
    }
  }

  /* ------------------------------- daily -------------------------------- */

  async writeDaily(daily: DailyLearn): Promise<void> {
    writeFileSync(path.join(this.dailyDir, `${daily.day}.json`), safeStringify(daily, 2), "utf8");
  }

  async dailyFor(day: string): Promise<DailyLearn | undefined> {
    const file = path.join(this.dailyDir, `${day}.json`);
    try {
      return JSON.parse(readFileSync(file, "utf8")) as DailyLearn;
    } catch {
      return undefined;
    }
  }

  /* -------------------------------- tools ------------------------------- */

  async saveTool(spec: LearnedToolSpec): Promise<void> {
    writeFileSync(path.join(this.toolsDir, `${spec.name}.json`), safeStringify(spec, 2), "utf8");
  }

  /** Synchronous — called at startup so learned tools are registered before the agent runs. */
  loadTools(): LearnedToolSpec[] {
    let files: string[];
    try {
      files = readdirSync(this.toolsDir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const out: LearnedToolSpec[] = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(readFileSync(path.join(this.toolsDir, f), "utf8")) as LearnedToolSpec;
        if (raw && typeof raw.name === "string" && Array.isArray(raw.steps)) out.push(raw);
      } catch { /* skip malformed */ }
    }
    return out.sort((a, b) => (a.lastUsedAt ?? a.createdAt) - (b.lastUsedAt ?? b.createdAt));
  }

  async removeTool(name: string): Promise<void> {
    try {
      rmSync(path.join(this.toolsDir, `${name}.json`), { force: true });
    } catch { /* ignore */ }
  }
}

/** Read a JSONL file into objects (empty/missing → []). */
function readJsonl<T>(file: string): T[] {
  try {
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    const out: T[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as T);
      } catch { /* skip corrupt line */ }
    }
    return out;
  } catch {
    return [];
  }
}
