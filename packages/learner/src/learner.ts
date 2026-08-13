import type { AgentEvent, LearnConfig, ToolCategory, ToolDefinition } from "@dikabuff/shared";
import { newId } from "@dikabuff/shared";
import { LearnerStore } from "./store";
import { detectPatterns, describePattern, representativeArgs, toolNameForPattern } from "./patterns";
import { makeLearnedTool } from "./macro";
import type { DailyLearn, LearnedToolSpec, LearnEpisode, LearnStatus, ToolCallTrace, ToolPattern } from "./types";

/** Minimal event-bus contract (satisfied by agent-core's AgentEvents). */
export interface LearnEventBus {
  onAny(listener: (ev: AgentEvent) => void): () => void;
}

/** Minimal registry contract (satisfied by @dikabuff/tools ToolRegistry). */
export interface LearnRegistryLike {
  get(name: string): ToolDefinition | undefined;
  has(name: string): boolean;
  register(tool: ToolDefinition): void;
}

export interface LearnerOptions {
  learnDir: string;
  registry: LearnRegistryLike;
  config: LearnConfig;
  logger: { debug(m: string): void; info(m: string): void };
  /** Working directory of the host (recorded on episodes). */
  cwd?: string;
  /** Episodes older than this many days are pruned (default 14). */
  retentionDays?: number;
  /** Days of history scanned for patterns (default 14). */
  historyDays?: number;
}

const DAY_MS = 86_400_000;

/**
 * The DikaBuff learner.
 *
 * Every CLI start runs `learnOnce()`: it rolls episodes into daily stats and
 * turns repeated successful tool sequences into reusable macro tools that are
 * auto-saved to disk (global — available in every project) and auto-registered
 * on the current registry. Every agent run is recorded via `attach(events)`.
 */
export class Learner {
  readonly store: LearnerStore;
  private registered = new Set<string>();
  private pendingEpisodeCalls: ToolCallTrace[] = [];
  private inRun = false;
  private runningPromise: Promise<void> | null = null;
  private scheduled = false;
  private lastLearnAt: number | undefined;

  constructor(private readonly opts: LearnerOptions) {
    this.store = new LearnerStore(opts.learnDir);
    if (!opts.config.enabled) return;
    // Register tools learned in previous sessions so they're available now.
    for (const spec of this.store.loadTools()) {
      this.registerTool(spec);
    }
  }

  /* ----------------------------- recording ----------------------------- */

  /** Subscribe to an agent event bus and record every run as an episode. */
  attach(events: LearnEventBus): void {
    if (!this.opts.config.enabled) return;
    events.onAny((ev) => {
      try {
        if (ev.type === "message:start") {
          // New run begins. In "regenerate" streaming mode the host emits a
          // second message:start mid-run (final answer generation) — only open
          // a fresh buffer for the first one of a run, never mid-run.
          if (!this.inRun) {
            this.inRun = true;
            this.pendingEpisodeCalls = [];
          }
        } else if (ev.type === "tool:start" && ev.toolName) {
          this.pendingEpisodeCalls.push({ tool: ev.toolName, ok: false, args: (ev.toolArgs ?? {}) as Record<string, unknown> });
        } else if (ev.type === "tool:done" && ev.toolName) {
          this.settleLast(ev.toolName, true);
        } else if (ev.type === "tool:error" && ev.toolName) {
          this.settleLast(ev.toolName, false);
        } else if (ev.type === "done") {
          this.inRun = false;
          void this.recordEpisode(ev).catch((err) => this.opts.logger.debug(`learner record failed: ${(err as Error).message}`));
        }
      } catch (err) {
        this.opts.logger.debug(`learner event error: ${(err as Error).message}`);
      }
    });
  }

  private settleLast(tool: string, ok: boolean): void {
    for (let i = this.pendingEpisodeCalls.length - 1; i >= 0; i--) {
      if (this.pendingEpisodeCalls[i]!.tool === tool) {
        this.pendingEpisodeCalls[i]!.ok = ok;
        return;
      }
    }
  }

  private async recordEpisode(doneEvent: AgentEvent): Promise<void> {
    const meta = (doneEvent.meta ?? {}) as Record<string, unknown>;
    const prompt = typeof meta.prompt === "string" ? meta.prompt : "";
    const turns = Number(meta.turns) || 1;
    const durationMs = Number(meta.durationMs) || 0;
    const calls = this.pendingEpisodeCalls;
    this.pendingEpisodeCalls = [];
    const at = doneEvent.timestamp ?? Date.now();
    const episode: LearnEpisode = {
      id: newId("learn"),
      at,
      day: dayKey(at),
      prompt: truncate(prompt, 160),
      cwd: this.opts.cwd ?? process.cwd(),
      ok: !meta.error,
      turns,
      toolCalls: calls,
      durationMs,
    };
    await this.store.appendEpisode(episode);
    this.opts.logger.debug(`learner: recorded episode ${episode.id} (${calls.length} tool calls)`);
    this.scheduleLearn();
  }

  /* --------------------------- learning pass --------------------------- */

  /**
   * Run a learning pass: aggregate daily stats, detect patterns, and
   * auto-create + auto-save tools for patterns not yet learned. Cheap enough
   * to run on every CLI start. Concurrent callers share the in-flight pass.
   */
  learnOnce(): Promise<void> {
    if (!this.opts.config.enabled) return Promise.resolve();
    if (this.runningPromise) return this.runningPromise;
    this.runningPromise = this.runPass().finally(() => {
      this.runningPromise = null;
    });
    return this.runningPromise;
  }

  private async runPass(): Promise<void> {
    this.lastLearnAt = Date.now();
    try {
      const now = Date.now();
      const today = dayKey(now);
      const retentionDays = this.opts.retentionDays ?? 14;
      const historyDays = this.opts.historyDays ?? 14;

      const days: string[] = [];
      for (let i = 0; i < historyDays; i++) {
        days.push(dayKey(now - i * DAY_MS));
      }

      const episodes = await this.store.recentEpisodes(days);
      const patterns = detectPatterns(episodes, {
        minHits: this.opts.config.minPatternHits,
        maxSteps: this.opts.config.maxSteps,
      });

      // Turn new patterns into tools (skip ones already learned).
      const existing = this.store.loadTools();
      const learnedSignatures = new Set(existing.map((t) => t.signature));
      const taken = new Set([...existing.map((t) => t.name), ...this.registered]);

      let toolsCreated = 0;
      for (const pattern of patterns) {
        if (learnedSignatures.has(pattern.signature)) continue;
        const spec = this.buildSpec(pattern, episodes, taken);
        learnedSignatures.add(pattern.signature);
        taken.add(spec.name);
        this.store.saveTool(spec);
        this.registerTool(spec);
        toolsCreated++;
        this.opts.logger.info(`learner: new tool "${spec.name}" (${pattern.signature}, ${pattern.hits}×)`);
        if (toolsCreated >= 5) break; // don't flood a single pass
      }

      await this.pruneTools();

      // Daily rollup.
      const todayEpisodes = await this.store.episodesForDay(today);
      const daily: DailyLearn = {
        day: today,
        episodeCount: todayEpisodes.length,
        okCount: todayEpisodes.filter((e) => e.ok).length,
        toolUsage: tallyTools(todayEpisodes),
        topPatterns: patterns.slice(0, 5).map((p) => p.signature),
        toolsCreated,
      };
      await this.store.writeDaily(daily);
      await this.store.truncateDay(today, this.opts.config.maxEpisodesPerDay);

      // Prune old episodes (disk hygiene).
      await this.store.pruneEpisodesBefore(dayKey(now - retentionDays * DAY_MS));
    } catch (err) {
      this.opts.logger.debug(`learner pass failed: ${(err as Error).message}`);
    }
  }

  /** Debounced re-run after new episodes arrive (keeps tools fresh mid-session). */
  private scheduleLearn(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    // unref(): never let the debounce hold a headless CLI alive after output.
    const timer = setTimeout(() => {
      this.scheduled = false;
      void this.learnOnce();
    }, 1500);
    timer.unref?.();
  }

  /** Build a macro tool spec from a pattern + the episodes that produced it. */
  private buildSpec(pattern: ToolPattern, episodes: LearnEpisode[], taken: Set<string>): LearnedToolSpec {
    const evidence = episodes.find((e) => pattern.tools.every((t) => e.toolCalls.some((c) => c.tool === t && c.ok)));
    const steps = pattern.tools.map((tool) => ({
      tool,
      args: evidence ? representativeArgs(evidence.toolCalls, tool) : {},
    }));
    return {
      name: toolNameForPattern(pattern, taken),
      description: describePattern(pattern),
      category: this.categoryFor(steps.map((s) => s.tool)),
      permission: "standard",
      steps,
      signature: pattern.signature,
      hits: pattern.hits,
      createdAt: Date.now(),
    };
  }

  /** Majority tool category across steps; analysis fallback (mode-safe). */
  private categoryFor(tools: string[]): ToolCategory {
    const counts = new Map<ToolCategory, number>();
    for (const name of tools) {
      const cat = this.opts.registry.get(name)?.category;
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    let best: ToolCategory = "analysis";
    let bestCount = 0;
    for (const [cat, n] of counts) {
      if (n > bestCount) {
        best = cat;
        bestCount = n;
      }
    }
    return best;
  }

  private registerTool(spec: LearnedToolSpec): void {
    if (this.registered.has(spec.name) || this.opts.registry.has(spec.name)) return;
    try {
      this.opts.registry.register(makeLearnedTool(spec));
      this.registered.add(spec.name);
    } catch (err) {
      this.opts.logger.debug(`learner: could not register ${spec.name}: ${(err as Error).message}`);
    }
  }

  private async pruneTools(): Promise<void> {
    const tools = this.store.loadTools();
    const cap = this.opts.config.maxTools;
    if (tools.length <= cap) return;
    for (const spec of tools.slice(0, tools.length - cap)) {
      await this.store.removeTool(spec.name);
      this.registered.delete(spec.name);
      this.opts.logger.debug(`learner: pruned tool ${spec.name}`);
    }
  }

  /* ------------------------------- status ------------------------------ */

  async getStatus(): Promise<LearnStatus> {
    const today = await this.store.dailyFor(dayKey(Date.now()));
    const tools = this.store.loadTools();
    const pending = await this.pendingPatternCount();
    return {
      enabled: this.opts.config.enabled,
      learnDir: this.opts.learnDir,
      episodesToday: today?.episodeCount ?? 0,
      episodesTotal: await this.store.countEpisodes(),
      learnedTools: tools.length,
      patternsPending: pending,
      lastLearnAt: this.lastLearnAt,
      recentTools: tools.slice(-5).reverse(),
    };
  }

  private async pendingPatternCount(): Promise<number> {
    if (!this.opts.config.enabled) return 0;
    const days: string[] = [];
    const now = Date.now();
    for (let i = 0; i < (this.opts.historyDays ?? 14); i++) days.push(dayKey(now - i * DAY_MS));
    const episodes = await this.store.recentEpisodes(days);
    const learned = new Set(this.store.loadTools().map((t) => t.signature));
    return detectPatterns(episodes, { minHits: this.opts.config.minPatternHits, maxSteps: this.opts.config.maxSteps }).filter((p) => !learned.has(p.signature)).length;
  }
}

/* ------------------------------ helpers -------------------------------- */

/** Local date key YYYY-MM-DD (safe across timezones; Europe/Asia ok). */
export function dayKey(at: number): string {
  const d = new Date(at);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function tallyTools(episodes: LearnEpisode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of episodes) {
    for (const c of e.toolCalls) {
      out[c.tool] = (out[c.tool] ?? 0) + 1;
    }
  }
  return out;
}

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}
