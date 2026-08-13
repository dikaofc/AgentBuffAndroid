/**
 * Core domain types shared across every DikaBuff package.
 * Packages should import from `@dikabuff/shared` instead of redefining types.
 */

/* ------------------------------------------------------------------ */
/* Roles & messages                                                    */
/* ------------------------------------------------------------------ */

export type Role = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  tokenCount?: number;
  /** Set when the message is the result of a tool call. */
  toolCallId?: string;
  /** Set when the message is a tool result; the name of the tool. */
  toolName?: string;
}

/* ------------------------------------------------------------------ */
/* Agent                                                               */
/* ------------------------------------------------------------------ */

export const AGENT_MODES = ["plan", "code", "debug", "research", "review"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export interface ModeDefinition {
  id: AgentMode;
  label: string;
  description: string;
  /** Extra system-prompt directives injected when the mode is active. */
  directives: string[];
  /** Tool categories that are allowed in this mode (undefined = all). */
  allowedToolCategories?: ToolCategory[];
  /** Default tool categories (undefined = registry default). */
  defaultToolCategories?: ToolCategory[];
}

export type ToolCategory = "filesystem" | "terminal" | "development" | "analysis";

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export type ToolPermissionLevel = "safe" | "standard" | "sensitive" | "dangerous";
export type PermissionPolicy = "allow" | "ask" | "deny";

/**
 * Global permission mode (DikaBuff-flavored).
 *  - default:          prompt for sensitive/dangerous tools
 *  - acceptEdits:      auto-approve file edits, still ask for terminal commands
 *  - plan:             read-only — every mutating tool is denied
 *  - bypassPermissions: approve everything (explicit opt-in)
 */
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** JSON-Schema-flavoured definition sent to the model for function calling. */
export interface ToolSchema {
  type: "object";
  description?: string;
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  /** JSON schema used for LLM function calling + runtime validation. */
  schema: ToolSchema;
  /** Static permission tier; the policy layer maps this to allow/ask/deny. */
  permission: ToolPermissionLevel;
  category: ToolCategory;
  /** Human category label ("filesystem", "terminal", ...). */
  run: (args: TArgs, ctx: ToolContext) => Promise<ToolResult> | ToolResult;
  /** Optional imperative validation on top of the schema. */
  validate?: (args: TArgs) => string | null;
  /** Zod (or equivalent) validator used at runtime; structural to avoid a zod dep here. */
  validateSchema?: {
    safeParse(args: unknown): { success: boolean; data?: unknown; error?: unknown };
  };
  /** Whether the tool is hidden from LLM tool-listing (e.g. internal). */
  hidden?: boolean;
}

export interface ToolContext {
  cwd: string;
  sessionId: string;
  mode: AgentMode;
  memory: MemoryGateway;
  environment: Record<string, string>;
  log: LoggerLike;
  emit: (event: AgentEvent) => void;
  /** Request a free-form answer from the user (used by interactive prompts). */
  ask: (prompt: string, options?: { timeoutMs?: number }) => Promise<string | null>;
  /**
   * Fan-out capability: run one read-only sub-agent task (used by the
   * `subagent` tool). Injected by the host agent. Undefined when unavailable.
   */
  runSubAgent?: (request: SubAgentRequest, index: number, total: number) => Promise<SubAgentResult>;
  /**
   * Execute another registered tool by name (used by auto-learned macro tools).
   * Injected by the host agent. Undefined when unavailable.
   */
  runTool?: (name: string, args: unknown) => Promise<ToolResult>;
}

/** A single delegated research task for a sub-agent. */
export interface SubAgentRequest {
  prompt: string;
  /** Optional short label shown in the UI (defaults to the first words). */
  label?: string;
}

/** Outcome of one sub-agent run. */
export interface SubAgentResult {
  ok: boolean;
  output: string;
  error?: string;
  turns: number;
  toolCalls: number;
  durationMs: number;
}

export interface ToolResult {
  ok: boolean;
  output?: string;
  error?: string;
  /** Structured data for the model (JSON-safe). */
  data?: unknown;
  /** Surface metadata for UI (files changed, command, duration…). */
  meta?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Agent events (emitted to UI / CLI sinks)                            */
/* ------------------------------------------------------------------ */

export type AgentEventType =
  | "thinking"
  | "tool:start"
  | "tool:done"
  | "tool:error"
  | "message:start"
  | "message:delta"
  | "message:done"
  | "permission:request"
  | "permission:response"
  | "error"
  | "done"
  | "meta";

export interface AgentEvent {
  type: AgentEventType;
  timestamp: number;
  sessionId?: string;
  /** Free-form step label for the thinking panel. */
  step?: string;
  toolName?: string;
  toolArgs?: unknown;
  result?: ToolResult;
  delta?: string;
  content?: string;
  error?: Error;
  permission?: PermissionRequest;
  granted?: boolean;
  meta?: Record<string, unknown>;
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  permission: ToolPermissionLevel;
  description: string;
  cwd: string;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export type SessionStatus = "active" | "paused" | "closed";

export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  projectPath: string;
  model: string;
  mode: AgentMode;
  status: SessionStatus;
  startedAt: number;
  updatedAt: number;
  messageCount: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export interface SessionListEntry {
  id: string;
  title: string;
  cwd: string;
  model: string;
  mode: AgentMode;
  updatedAt: number;
  messageCount: number;
}

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

export interface MemoryGateway {
  /** Short-term: the live conversation history for this session. */
  getMessages(sessionId: string): Promise<ChatMessage[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
  /** Long-term: key/value knowledge. */
  remember(key: string, value: unknown): Promise<void>;
  recall(key: string): Promise<unknown | undefined>;
  forget(key: string): Promise<void>;
  search(prefix: string): Promise<Array<{ key: string; value: unknown }>>;
}

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface LogEntry {
  level: Exclude<LogLevel, "silent">;
  message: string;
  timestamp: number;
  scope?: string;
  data?: unknown;
}

export interface LoggerLike {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/* ------------------------------------------------------------------ */
/* Config (contract; concrete impl lives in @dikabuff/config)          */
/* ------------------------------------------------------------------ */

export type ProviderKind = "openai" | "anthropic" | "ollama" | "mock";

export interface ModelPreset {
  id: string;
  /** OpenAI-compatible endpoint for this model (provider default if empty). */
  baseUrl?: string;
  provider: ProviderKind;
  label?: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  /** Cost estimate in USD per 1M tokens (used by /cost and the status bar). */
  costPer1MInput?: number;
  costPer1MOutput?: number;
  default?: boolean;
}

/** Live token + cost accounting for a session. */
export interface CostEstimate {
  /** Input tokens sent to the provider (approximate). */
  inputTokens: number;
  /** Output tokens generated by the provider (approximate). */
  outputTokens: number;
  /** Total = input + output. */
  totalTokens: number;
  /** Estimated cost in USD (0 when the model has no pricing data). */
  costUsd: number;
  /** True when pricing data is available for the current model. */
  priced: boolean;
}

export interface AutoUpdateConfig {
  checkOnStart: boolean;
  channel: "stable" | "beta";
  intervalHours: number;
}

export interface LoggingConfig {
  level: LogLevel;
  file: boolean;
  verbose: boolean;
}

export interface ToolPolicy {
  /** Policy for a category: "allow" | "ask" | "deny". */
  categories: Partial<Record<ToolCategory, PermissionPolicy>>;
  /** Per-tool override. */
  tools: Record<string, PermissionPolicy>;
  /** Categories that never need confirmation (subsumes `allow`). */
  autoApprove: ToolCategory[];
}

/**
 * Auto-learning configuration (global, stored in the config dir).
 *
 * DikaBuff records every agent run as an "episode". Each time the CLI
 * starts it runs a learning pass: repeated successful tool sequences become
 * reusable macro tools that are auto-saved to disk and auto-registered, so
 * the agent gets faster at familiar work across projects.
 */
export interface LearnConfig {
  /** Master switch (default true). */
  enabled: boolean;
  /** A pattern must repeat this many times before a tool is auto-created. */
  minPatternHits: number;
  /** Max steps in a learned macro tool (keeps tools focused). */
  maxSteps: number;
  /** Max number of auto-learned tools kept on disk (oldest pruned first). */
  maxTools: number;
  /** Max episodes retained per day (disk hygiene). */
  maxEpisodesPerDay: number;
}

export interface DikaConfig {
  version: string;
  provider: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  theme: string;
  mode: AgentMode;
  /** Global permission mode (default | acceptEdits | plan | bypassPermissions). */
  permissionMode: PermissionMode;
  permissions: ToolPolicy;
  /** Auto-compact the conversation when it grows past this many tokens (0 = off). */
  compactThresholdTokens: number;
  update: AutoUpdateConfig;
  logging: LoggingConfig;
  debug: boolean;
  plugins: string[];
  memory: {
    enabled: boolean;
    provider: "json" | "sqlite";
    vector: boolean;
  };
  /**
   * Auto-learning: DikaBuff records every run, detects repeated successful tool
   * sequences, and auto-creates + auto-saves reusable macro tools. Global.
   */
  learn?: LearnConfig;
  /** Project instruction file auto-loaded into the system prompt (e.g. DIKABUFF.md). */
  projectMemoryFile: string;
  legacy?: {
    /** Path to a legacy single-file config (providers.ollama shape). */
    configPath?: string;
  };
}