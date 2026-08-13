import type { ToolCategory, ToolPermissionLevel } from "@dikabuff/shared";

/** One tool invocation inside an episode, with its outcome. */
export interface ToolCallTrace {
  tool: string;
  ok: boolean;
  args?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * One agent run, recorded automatically from the event bus. The learner
 * aggregates episodes into daily stats and detects repeated successful tool
 * sequences across episodes (patterns) — the raw material for new tools.
 */
export interface LearnEpisode {
  id: string;
  /** Unix ms. */
  at: number;
  /** Local date key YYYY-MM-DD (disk hygiene + daily aggregation). */
  day: string;
  /** Prompt (truncated). */
  prompt: string;
  /** Working directory the run happened in. */
  cwd: string;
  /** Whether the run completed without a fatal error. */
  ok: boolean;
  turns: number;
  toolCalls: ToolCallTrace[];
  durationMs: number;
}

/**
 * A repeated, successful tool sequence (n-gram over tool names). Only tool
 * calls that returned ok count toward a pattern.
 */
export interface ToolPattern {
  /** Canonical signature, e.g. "search_files>read_file". */
  signature: string;
  tools: string[];
  /** Number of distinct episodes the sequence appeared in (successful only). */
  hits: number;
  lastSeen: number;
}

/** A step of an auto-learned macro tool. */
export interface LearnedToolStep {
  tool: string;
  /** Args captured from a successful occurrence; session-specific values blanked. */
  args: Record<string, unknown>;
}

/**
 * Serialized definition of an auto-learned tool. Stored as JSON under the
 * config dir (`learn/tools/<name>.json`) and re-registered on every start,
 * so learned tools persist globally across projects and sessions.
 */
export interface LearnedToolSpec {
  name: string;
  description: string;
  category: ToolCategory;
  permission: ToolPermissionLevel;
  steps: LearnedToolStep[];
  /** Pattern signature this tool was created from. */
  signature: string;
  /** Observed pattern hits at creation time. */
  hits: number;
  createdAt: number;
  lastUsedAt?: number;
}

/** Per-day rollup, persisted for quick status reporting. */
export interface DailyLearn {
  day: string;
  episodeCount: number;
  okCount: number;
  toolUsage: Record<string, number>;
  topPatterns: string[];
  toolsCreated: number;
}

export interface LearnStatus {
  enabled: boolean;
  learnDir: string;
  episodesToday: number;
  episodesTotal: number;
  learnedTools: number;
  patternsPending: number;
  lastLearnAt?: number;
  recentTools: LearnedToolSpec[];
}
