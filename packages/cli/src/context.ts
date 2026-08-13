import type { ConfigManager, ModelPreset } from "@dikabuff/config";
import type { MemoryManager } from "@dikabuff/memory";
import type { LLMProvider } from "@dikabuff/agent-core";
import type { ToolRegistry } from "@dikabuff/tools";
import type { Learner } from "@dikabuff/learner";
import type { SessionListEntry } from "@dikabuff/shared";

/**
 * Contract the host application (apps/dikabuff-cli) must satisfy.
 * Keeps packages/cli free of app wiring/details.
 */
export interface CliContext {
  cwd: string;
  config: ConfigManager;
  memory: MemoryManager;
  presets: ModelPreset[];
  registry: ToolRegistry;
  /** Build the provider honoring latest config (model switches). */
  getProvider(): LLMProvider;
  logger: { info(m: string): void; error(m: string): void; debug(m: string): void };
  /** Auto-learning subsystem (episode recording + pattern → tool synthesis). */
  learner?: Learner;
  /** Interactive mode at cursor (chat). */
  launchInteractive(opts?: { message?: string; yes?: boolean }): Promise<number>;
  /** Upgrade the CLI itself. */
  updateSelf(channel?: string): Promise<string>;
  sessions(): Promise<SessionListEntry[]>;
}

/** Standard run options shared by run/analyze/review/fix. */
export interface AgentRunOptions {
  prompt: string;
  mode?: string;
  yes?: boolean;
  headless?: boolean;
  /** Override the configured global permission mode for this invocation. */
  permissionMode?: string;
  /** Machine-readable output: "text" (default) | "json". */
  outputFormat?: "text" | "json";
}