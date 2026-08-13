# DikaBuff API Interfaces

> The typed public contracts. Source of truth: `packages/shared/src/types.ts`
> and `packages/plugins/src/sdk.ts`.

## Tool system

```ts
interface ToolDefinition {
  name: string;                       // kebab-case, unique
  description: string;                // shown to the model
  category: "filesystem" | "terminal" | "development" | "analysis" | "plugin";
  permissionLevel: "safe" | "standard" | "sensitive" | "dangerous";
  inputSchema: ToolSchema;            // zod-derived JSON schema
  run(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  cwd: string;
  sessionId: string;
  mode: AgentMode;
  memory: MemoryGateway;
  environment: Record<string, string>;
  log: LoggerLike;
  emit: (event: AgentEvent) => void;      // permission:request etc.
  ask?: (q: AskQuestion) => Promise<AskAnswer | null>;
}

interface ToolResult { ok: boolean; output?: string; error?: string; meta?: Record<string, unknown>; }
```

### Permission resolution

```
tier(defaults)  safe/standard → allow · sensitive/dangerous → ask
per-tool policy config.permissions.tools[toolName] ∈ allow|ask|deny → override
consent callback → granted? (interactive dialog / --yes / headless deny)
```

### Built-in tools (15)

| Tool | Tier | Category |
|---|---|---|
| `read_file` | safe | filesystem |
| `write_file` | sensitive | filesystem |
| `edit_file` | sensitive | filesystem |
| `delete_file` | dangerous | filesystem |
| `search_files` | safe | filesystem |
| `code_summary` | standard | filesystem |
| `execute_command` | dangerous | terminal |
| `install_package` | dangerous | terminal |
| `git_status` | standard | development |
| `git_diff` | standard | development |
| `run_tests` | standard | development |
| `lint` | standard | development |
| `project_scan` | standard | analysis |
| `subagent` | standard | analysis |
| `web_search` | standard | analysis |
| `ask_user` | standard | analysis |

## Sub-agent fan-out

`subagent` delegates one or more **read-only** research tasks to independent
sub-agent loops that run concurrently (`Promise.allSettled`). Each sub-agent
shares the host provider but is confined to a safe tool whitelist
(`read_file`, `search_files`, `project_scan`, `code_summary`,
`dependency_analysis`, `git_status`, `git_diff`) — it can never write files or
run shell commands, so no consent dialogs are needed. Progress events are
emitted as `meta.subagent` for the UI's live per-task panel.

```ts
interface SubAgentRequest { prompt: string; label?: string }
interface SubAgentResult {
  ok: boolean; output: string; error?: string;
  turns: number; toolCalls: number; durationMs: number;
}
// ToolContext gains:
runSubAgent?: (req: SubAgentRequest, index: number, total: number) => Promise<SubAgentResult>;
```

## Auto-learning

Every agent run is recorded as an **episode** (tool sequence + outcomes) via the
`done` event. On each CLI start (and debounced after new episodes) a learning pass
runs: daily stats → pattern detection → **auto-created macro tools** saved globally.

```ts
interface LearnConfig {
  enabled: boolean;
  minPatternHits: number;      // pattern must repeat this many episodes
  maxSteps: number;            // max tools in one learned macro
  maxTools: number;            // cap on learned tools (oldest pruned)
  maxEpisodesPerDay: number;   // per-day episode retention
}

interface LearnedToolSpec {
  name: string; description: string;
  category: ToolCategory; permission: ToolPermissionLevel;
  steps: Array<{ tool: string; args: Record<string, unknown> }>;
  signature: string;           // pattern this tool was learned from
  hits: number; createdAt: number;
}

// ToolContext gains (injected by the host agent):
runTool?: (name: string, args: unknown) => Promise<ToolResult>;
```

Learned tools are **macros**: `run()` replays `steps` through `ctx.runTool`, so
nested calls flow through the same permission + consent pipeline and the same
mode/category gating as direct calls — no capability is added, only composition.
Recursion guard (no self-calls, max depth 5) prevents runaway chains.

Storage (global, config dir): `learn/episodes/<date>.jsonl`,
`learn/daily/<date>.json`, `learn/tools/<name>.json`. Surfaced via
`dikabuff learn` and `/learn` in the TUI.

## LLM provider

```ts
interface LLMProvider {
  completeWithTools(req: CompletionRequest): Promise<CompletedAssistantMessage>;
  stream(req: CompletionRequest): AsyncIterable<StreamDelta>;
}

interface CompletedAssistantMessage {
  content: string | null;
  toolCalls: ProviderToolCall[];
  reasoning?: string;
  usage?: { promptTokens: number; completionTokens: number };
}
```

`createProvider(config)` maps `openai|ollama|anthropic` → OpenAI-compatible HTTP
(SSE + `tool_calls`), `mock` → offline deterministic demo agent.

## RuntimeAdapter (UI ⇄ host contract)

```ts
interface RuntimeAdapter {
  getStatus(): StatusInfo;
  getState(): AppViewState;
  subscribe(cb: () => void): () => void;
  submit(prompt: string): Promise<void>;
  respondPermission(granted: boolean): void;
  respondAsk(answer: string | null): void;   // resolve the agent's ask_user prompt (null = reject)
  runReview(): Promise<void>;                // /review — review the working tree
  requestDiff(): Promise<void>;
  cycleModel(): Promise<void>;
  setModel(id: string): Promise<void>;
  toggleSidebar(): void;
  switchMode(mode: AgentMode): Promise<void>;
  resumeSession(id: string): Promise<void>;
  newSession(): Promise<void>;
  clearConversation(): Promise<void>;
  compactConversation(): Promise<void>;
  getUsage(): Promise<UsageInfo>;
  setTheme(themeId: string): Promise<void>;
  setPermissionMode(mode: string): Promise<void>;
  getStatusInfo(): Promise<string>;
  getMemoryNotes(): Promise<string>;
  getDoctorInfo(): Promise<string>;
  getLearnInfo(): Promise<string>;
  sessions(): Promise<SessionListEntry[]>;
  quit(): void;
}
```

### Live activity line

The agent emits `thinking` events (`Analyzing request…`, `Reasoning (turn N)…`,
`Running <tool>…`, `Composing final response…`); the UI renders the latest one as
an animated line with a spinner so you always see what the AI is doing before it
answers.

### Ask the user (`ask_user`) & web search (`web_search`)

- `ask_user` — the agent asks a free-text question mid-run via `ToolContext.ask`;
  the host wires it to the AskDialog where you type an answer + Enter or reject
  with Esc (the tool returns `null` on reject). Timeout and decline are always
  safe: the agent continues without the answer.
- `web_search` — **keyless by default** (DuckDuckGo HTML), optionally upgraded to
  Tavily by setting `TAVILY_API_KEY` in the environment. Returns title/URL/snippet
  results for docs, news, APIs, and errors outside the project.

## MemoryGateway

```ts
interface MemoryGateway {
  remember(key: string, value: unknown, opts?: { tags?: string[]; ttlMs?: number }): Promise<void>;
  recall(key: string): Promise<unknown | undefined>;
  forget(key: string): Promise<void>;
  search(query: string, limit?: number): Promise<Array<{ key: string; value: unknown; score: number }>>;
  projectNotes(projectKey: string): Promise<Array<{ text: string; at: number }>>;
}
```

## Plugin SDK

```ts
interface PluginDefinition {
  manifest: PluginManifest;      // name, version, description, engines, permissions
  tools?: ToolDefinition[];
  hooks?: { onSessionStart?; onSessionEnd?; beforeToolRun?; afterToolRun? };
  activate?(ctx: { cwd; config; logger }): Promise<void> | void;
}
const myPlugin = definePlugin({ … });   // zod-validated
```

Loaded from `~/.dikabuff/plugins/<name>/` (default export), registered into the
`ToolRegistry`, and gated by `manifest.permissions`.

## CLI

```
dikabuff [prompt?]                       interactive (or one-shot with a message)
dikabuff init                            create ~/.dikabuff
dikabuff chat [message] [-y] [-p] [--output-format text|json] [--permission-mode <mode>]
dikabuff run "<prompt>" [-y] [-p] [--output-format text|json] [--permission-mode <mode>]
dikabuff analyze [prompt]
dikabuff review [-y] [--permission-mode <mode>]
dikabuff fix [tests|lint] [-y] [--permission-mode <mode>]
dikabuff memory list|remember|forget|notes
dikabuff plugin list|search|install|remove|verify
dikabuff config get|set|theme|list|models
dikabuff update [--check] [--channel]
dikabuff doctor
dikabuff learn                          # auto-learning status
```

### Print & JSON mode

`-p` / `--print` runs the agent and prints only the final answer (pipe-friendly).
`--output-format json` emits a structured result object:

```json
{ "ok": true, "answer": "…", "sessionId": "s_…", "turns": 2,
  "toolCalls": 3, "tokens": { "input": 1200, "output": 400, "total": 1600 },
  "costUsd": 0.0002, "compacted": false, "durationMs": 8100 }
```

### Permission modes

`--permission-mode <mode>` (or `/permissions` in the TUI) overrides the global
permission posture for an invocation:

| Mode | Behavior |
|---|---|
| `default` | prompt for sensitive/dangerous tools (per-tool policy applies) |
| `acceptEdits` | auto-approve file edits; terminal commands still ask |
| `plan` | read-only — every mutating/terminal tool is denied |
| `bypassPermissions` | approve everything (explicit opt-in) |