import type { LearnEpisode, ToolPattern, ToolCallTrace } from "./types";

export interface PatternOptions {
  /** Minimum episodes a sequence must appear in (successful) to count. */
  minHits?: number;
  /** Longest tool sequence to consider. */
  maxSteps?: number;
  /** Only consider tool calls marked ok. */
  onlyOk?: boolean;
}

/**
 * Detect repeated successful tool sequences across episodes.
 *
 * Algorithm: for each episode, extract the ordered list of successful tool
 * names, then slide a window of length 2..maxSteps over it. Every window is a
 * candidate pattern keyed by signature ("t1>t2>t3"). A signature counts once
 * per episode (not per occurrence) so one chatty episode can't dominate.
 *
 * Patterns that appear in >= minHits episodes are returned sorted by hits
 * (then recency). These are the candidates the learner turns into tools.
 */
export function detectPatterns(episodes: LearnEpisode[], opts: PatternOptions = {}): ToolPattern[] {
  const minHits = Math.max(1, opts.minHits ?? 2);
  const maxSteps = Math.max(2, opts.maxSteps ?? 3);
  const onlyOk = opts.onlyOk ?? true;

  // signature -> { count (episodes), lastSeen, tools }
  const seen = new Map<string, { count: number; lastSeen: number; tools: string[] }>();

  for (const episode of episodes) {
    // Consecutive successful tool calls only: a failed call breaks the run,
    // so patterns never join calls that weren't actually adjacent in a flow.
    const runs: string[][] = [[]];
    for (const call of episode.toolCalls) {
      if (onlyOk && !call.ok) {
        runs.push([]);
        continue;
      }
      runs[runs.length - 1]!.push(call.tool);
    }
    const episodeSignatures = new Set<string>();
    for (const names of runs) {
      for (let win = 2; win <= maxSteps; win++) {
        for (let i = 0; i + win <= names.length; i++) {
          const seq = names.slice(i, i + win);
          episodeSignatures.add(seq.join(">"));
        }
      }
    }
    for (const signature of episodeSignatures) {
      const tools = signature.split(">");
      const existing = seen.get(signature);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = Math.max(existing.lastSeen, episode.at);
      } else {
        seen.set(signature, { count: 1, lastSeen: episode.at, tools });
      }
    }
  }

  return [...seen.entries()]
    .filter(([, v]) => v.count >= minHits)
    .map(([signature, v]) => ({ signature, tools: v.tools, hits: v.count, lastSeen: v.lastSeen }))
    .sort((a, b) => b.hits - a.hits || b.lastSeen - a.lastSeen);
}

/**
 * Pick representative args for a tool step from the episode's successful call.
 * Session-specific values (long paths, hashes) are blanked so the learned
 * macro stays useful across projects.
 */
export function representativeArgs(calls: ToolCallTrace[], toolName: string): Record<string, unknown> {
  const call = calls.find((c) => c.tool === toolName && c.ok && c.args);
  if (!call?.args) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(call.args)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length > 48) continue; // session-specific blob
    out[key] = value;
  }
  return out;
}

/** Suggested tool name for a pattern, e.g. "search>read" → "learn_search_read". */
export function toolNameForPattern(pattern: ToolPattern, taken: Set<string>): string {
  const base = `learn_${pattern.tools.join("_")}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48);
  let name = base;
  let i = 2;
  while (taken.has(name)) {
    name = `${base}_${i}`;
    i++;
  }
  return name;
}

/** Human description generated for a learned macro tool. */
export function describePattern(pattern: ToolPattern): string {
  const seq = pattern.tools.map((t) => `\`${t}\``).join(" → ");
  return `Auto-learned macro (observed ${pattern.hits}×): runs ${seq} in sequence and returns the combined result. Use it for recurring tasks that follow this exact workflow.`;
}
