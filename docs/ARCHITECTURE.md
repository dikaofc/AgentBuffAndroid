# DikaBuff Architecture

> The complete system blueprint for DikaBuff Agent CLI — a production-grade,
> terminal-native AI coding agent. Companion docs: [UX](UX.md) · [DATABASE](DATABASE.md) ·
> [API](API.md) · [ROADMAP](ROADMAP.md).

---

## 1. Architecture explanation

DikaBuff is a **monorepo of small, dependency-ordered packages** that together form a
terminal-native AI coding agent CLI. The design has five architectural pillars:

### 1.1 Strict layering with a single direction of dependency

```
┌────────────────────────────────────────────────────────────────────┐
│ apps/dikabuff-cli        composition root: DI container, bin entry │
├────────────────────────────────────────────────────────────────────┤
│ packages/cli             commander program + headless commands      │
│ packages/terminal-ui     Ink/React UI (AppShell, store, components) │
├────────────────────────────────────────────────────────────────────┤
│ packages/agent-core      agent loop, modes, context, providers      │
│ packages/tools           tool registry + 13 built-in tools          │
│ packages/learner         auto-learning: episodes, patterns, macros  │
│ packages/memory          key-value memory, sessions, vector index   │
│ packages/config          config manager, themes, model presets      │
│ packages/plugins         plugin SDK, loader, marketplace            │
├────────────────────────────────────────────────────────────────────┤
│ packages/shared          types, constants, ansi, ids, logger        │
└────────────────────────────────────────────────────────────────────┘
```

Rules enforced by design (and by `tsconfig` project references):

1. **`shared` has zero internal dependencies** — every package imports from it.
2. **UI never imports `agent-core` implementation details beyond the event bus**
   (`AgentEvents`) — it consumes `RuntimeAdapter` + typed state.
3. **Headless commands reuse the exact same agent machinery** as the interactive UI —
   there is no separate "scripting mode" code path.
4. **Plugins cannot import the agent** — they only receive `ToolContext` at runtime.

### 1.2 The event bus as the UI contract

The agent loop **emits typed events and never touches the terminal**. The UI subscribes
via a `UiStore` that bridges events → immutable React state with 16 ms delta batching.
This gives three guarantees:

- **The agent never blocks the renderer** (no `render()` calls inside the loop).
- **Any UI can be swapped** (Ink today, web later) by reimplementing `RuntimeAdapter`.
- **Headless mode is just "no UI attached"** — events still fire for logging/telemetry.

### 1.3 Two-phase LLM strategy

- **Tool-calling turns** use non-streaming `completeWithTools` (deterministic JSON
  parsing of `tool_calls`, reliable across providers).
- **Final answers** default to `streamMode: "replay"` — the provider returns the full
  text once and the client replays it in chunks. This is deterministic, provider-agnostic,
  and testable. `"regenerate"` is available for providers with real SSE streaming.

### 1.4 Backward compatibility as a first-class constraint

The pre-monorepo v0.2.0 script is archived at `examples/legacy/dikabuff`, and its
`config.json` shape (`providers.ollama.{baseUrl,api,apiKey,models}`) is **absorbed
automatically** by `ConfigManager.absorbLegacyConfig()` — so the existing gateway
(`oc/deepseek-v4-flash-free @ localhost:7777`) works with the new CLI with zero config.

### 1.5 Performance posture

- Lazy JSON store by default; optional `better-sqlite3` (no native deps at install).
- Tool output truncation, prompt-window compaction (`MAX_CONTEXT_MESSAGES`), and
  per-tool budget caps prevent context blow-up.
- Vector index is an O(n) bigram-overlap ranker today, behind an interface that swaps
  to real embeddings without touching callers.

---

## 2. Folder structure

```
DIKABUFF/
├── apps/
│   └── dikabuff-cli/            # bin `dikabuff` — composition root
│       └── src/
│           ├── index.ts         # shebang entry, crash handling, parse
│           └── container.ts     # DI wiring: config→memory→tools→provider→agent→UI
├── packages/
│   ├── shared/                  # types, constants, ansi, ids, logger
│   ├── config/                  # ConfigManager, themes (5), model presets, legacy absorb
│   ├── memory/                  # MemoryGateway impl, sessions, vector index
│   ├── tools/                   # ToolRegistry, permission tiers, 13 builtins
│   ├── agent-core/              # Agent loop, modes, context builder, providers
│   ├── learner/                 # auto-learning: episode capture, patterns, macro tools
│   ├── terminal-ui/             # Ink app: AppShell, UiStore, 15 components, markdown
│   ├── plugins/                 # definePlugin SDK, registry, loader, marketplace
│   └── cli/                     # commander program + headless commands
├── docs/                        # ARCHITECTURE, UX, DATABASE, API, ROADMAP
├── examples/legacy/             # archived v0.2.0 single-file dikabuff
├── scripts/gen-docs.mjs         # docs index + link checker
├── config.json                  # legacy provider config (kept for absorption)
├── package.json                 # npm workspaces root
├── tsconfig.base.json           # strict ESM/ESNext, Bundler resolution
└── vitest.config.ts
```

Each package owns `src/`, `tests/`, `tsconfig.json`, and a `tsup.config.ts`
(build → `dist/`, ESM, dts).

---

## 3. UX flow

See [UX.md](UX.md) for the full interaction model. The essential flow:

```
dikabuff
  → AppShell mounts, StartScreen shows (model, cwd, session)
  → user types prompt → InputBox → RuntimeAdapter.submit()
  → Agent.run() emits: thinking → tool:start/… → permission:request (if needed)
  → UiStore batches events → ChatPanel renders message boxes, tool panel, answer
  → user: Enter submit · Shift+Enter newline · ↑↓ history · Esc sidebar
          ^C cancel · ^Q quit · ^M model picker · Y/N/V permission dialog
  → sidebar lists sessions (resume with j/k/Enter), /mode switches agent mode
```

Key UX invariants:
- **Status is always visible** (phase, model, mode, tokens) — never buried.
- **Nothing happens without a visible trace** — tools, permissions, and errors
  each have a dedicated panel.
- **Destructive actions are opt-in** — the permission dialog blocks by default for
  sensitive/dangerous tools, with a `V` key to preview the diff first.

---

## 4. Component design

The terminal UI is a plain React tree driven by `useSyncExternalStore`-style
subscription (implemented as `runtime.subscribe` + `useState` sync for Ink 5).

```
AppShell (keybindings, /commands, layout)
├── Header                 logo, session title, model, mode, cwd
├── Sidebar                session list (j/k, Enter resume) + file tree
│   └── SessionList, FileTree
├── ChatPanel              message history
│   ├── MessageBox         markdown-rendered user/assistant messages
│   ├── SubagentPanel      ⧉ live fan-out task progress (◌/✓/✗)
│   ├── ToolExecutionPanel ✓/✗ tool calls with duration
│   └── ErrorPanel         fatal errors
├── PermissionDialog       Y/N/V (view diff) — blocks the loop
├── DiffViewer             overlay diff preview (Esc closes)
├── ModelSelector          ^M popover: model presets
├── InputBox               custom multiline input, history, hints, /commands
└── StatusBar              phase · model · mode · tokens · key hints
```

All colors come from a **ThemePalette** (`dark`, `amoled`, `dracula`, `catppuccin`,
`minimal`) injected via React context — components never hardcode colors.

---

## 5. Agent architecture

```
                     ┌──────────────────────────────────────┐
   prompt ──────────▶│  Agent.run(prompt)                    │
                     │  1. append user msg to memory         │
                     │  2. build prompt window               │
                     │     (system + sanitized history)      │
                     │  3. completeWithTools(provider)       │
                     │     ├─ no tool_calls → finalize       │
                     │     └─ tool_calls ─┐                  │
                     │        per call:   │                  │
                     │        validate → authorize →         │
                     │        run → emit events              │
                     │  4. loop (max MAX_AGENT_TURNS)        │
                     │  5. finalize: replay|regenerate       │
                     │  6. persist session + memory          │
                     └──────────────────────────────────────┘
```

- **Modes** (`plan|code|debug|research|review`) gate tool categories and inject
  mode-specific system directives.
- **Permission resolution**: tool tier (`safe|standard|sensitive|dangerous`) →
  per-tool policy override → consent callback (UI dialog / CLI `--yes` / deny).
- **Memory**: `MemoryGateway` abstraction — short-term messages (session store) and
  long-term key-value + vector-ranked notes, both surfaced in the system prompt.
- **Provider**: `LLMProvider` interface; `createProvider()` maps
  `openai|ollama|anthropic` → OpenAI-compatible HTTP, `mock` → offline demo agent.

---

## 6. Database design

Full schema in [DATABASE.md](DATABASE.md). Summary:

| Store | Format (default) | Contents |
|---|---|---|
| `~/.dikabuff/config.json` | JSON | config, permissions, plugins, theme |
| `~/.dikabuff/models.json` | JSON | merged model presets (user overrides) |
| `~/.dikabuff/memory/*.json` | JSON KV | long-term memory entries + vectors |
| `~/.dikabuff/sessions/<id>.json` | JSON | session metadata (title/model/mode) |
| `~/.dikabuff/sessions/<id>.messages.jsonl` | JSONL | append-only message log |
| `~/.dikabuff/learn/episodes/<date>.jsonl` | JSONL | episode log (tools + outcomes) |
| `~/.dikabuff/learn/daily/<date>.json` | JSON | per-day rollup |
| `~/.dikabuff/learn/tools/<name>.json` | JSON | auto-learned macro tools |

SQLite backend is drop-in (same `KeyValueStore`/`SessionStore` interfaces), enabled by
setting `memory.provider: "sqlite"` in config.

---

## 7. API interfaces

The public contracts — `ToolDefinition`, `ToolContext`, `ToolResult`,
`LLMProvider`, `RuntimeAdapter`, `MemoryGateway`, `PluginDefinition`,
`DikaConfig` — are all specified in [API.md](API.md) and typed in
`packages/shared/src/types.ts` (+ `packages/plugins/src/sdk.ts`).

CLI surface (11 commands + interactive): `init chat run analyze review fix memory
plugin config update doctor learn`.

---

## 8. Development roadmap

See [ROADMAP.md](ROADMAP.md) for the phased plan (v0.1 foundations → v1.0 GA).
