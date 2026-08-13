# DikaBuff Agent CLI

[![CI](https://github.com/dikaofc/AgentBuffAndroid/actions/workflows/ci.yml/badge.svg)](https://github.com/dikaofc/AgentBuffAndroid/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/dikaofc/AgentBuffAndroid)](https://github.com/dikaofc/AgentBuffAndroid/releases)

**AI coding intelligence in your terminal** — a terminal-native AI coding agent built for
Android Termux (and any POSIX terminal), with your own AI backend (OpenAI-compatible gateways
like OmniRoute, 9Router, OpenRouter, or any local server).

Monorepo: 9 packages, Ink 5 terminal UI, agent loop with 5 modes, 15 built-in tools,
permission dialogs + 4 permission modes, memory, sessions, plugins, 5 themes, live slash
commands, live activity line (animated "what the AI is doing"), ask-the-user dialogs
(answer/reject), keyless web search, cost tracking, context compaction, auto-learning
(episodes → patterns → auto-created tools), 11 CLI commands.

```
◈ DikaBuff
  ├── apps/dikabuff-cli     bin `dikabuff` (DI container, entry)
  ├── packages/
  │   ├── shared            types · constants · ansi · ids · logger
  │   ├── config            ConfigManager · 5 themes · model presets
  │   ├── memory            KV/session stores · vector index (JSON default, SQLite opt-in)
  │   ├── tools             ToolRegistry · permission tiers · 15 built-ins (incl. web_search, ask_user)
  │   ├── agent-core        agent loop · modes · providers (openai-compatible + mock)
  │   ├── learner           auto-learning: episodes · pattern detection · macro-tool synthesis
  │   ├── terminal-ui       Ink app: AppShell · UiStore · markdown engine
  │   ├── plugins           plugin SDK · loader · marketplace
  │   └── cli               commander program · headless commands
  ├── docs/                 ARCHITECTURE · UX · DATABASE · API · ROADMAP
  └── examples/legacy/      archived v0.2.0 single-file dikabuff
```

## Quickstart

```bash
npm install
npm run build
npm run dikabuff            # interactive agent (mock provider works offline)
npm run dikabuff -- --help
```

```bash
dikabuff "explain this repo"          # one-shot
dikabuff run "add tests for utils"    # headless run
dikabuff run "fix lint" -p            # print mode: plain answer to stdout
dikabuff run "analyze" --output-format json   # machine-readable output
dikabuff chat --permission-mode plan  # read-only session
cd ~/project && echo "# rules" > DIKABUFF.md   # project memory, auto-loaded
dikabuff config theme catppuccin     # switch theme
dikabuff doctor                       # diagnose config + connectivity
dikabuff learn                        # auto-learning status (episodes, patterns, tools)
dikabuff chat                         # interactive session
```

In the interactive TUI: `/help` lists all slash commands — `/mode`, `/permissions`
(`default|acceptEdits|plan|bypassPermissions`), `/model`, `/theme`, `/clear`,
`/compact`, `/cost`, `/status`, `/memory`, `/doctor`, `/learn`, `/review`, `/new`,
`/resume`, `/quit`.
Long conversations auto-compact to save tokens; `/cost` shows live usage.

## Auto-learning

DikaBuff learns every time it runs. Each agent run is recorded as an **episode**
(which tools ran, in what order, success/failure). Every CLI start runs a learning pass:

1. Rolls episodes into **daily stats** (`~/.dikabuff/learn/daily/<date>.json`).
2. Detects **repeated successful tool sequences** (patterns).
3. **Auto-creates a macro tool** for each new pattern, **auto-saves** it to
   `~/.dikabuff/learn/tools/`, and registers it — available in every project.

Learned tools are read-only compositions of tools that already exist: calling them
replays the steps through the same permission pipeline (no bypass), with recursion
and depth guards. Tune behavior in config:

```jsonc
{ "learn": { "enabled": true, "minPatternHits": 2, "maxSteps": 3, "maxTools": 20, "maxEpisodesPerDay": 200 } }
```

## Configuration

Created at `~/.dikabuff/config.json` on first run. The **legacy `config.json` at the
repository root is absorbed automatically** (`providers.ollama` shape), so the existing
gateway keeps working. A sanitized template is committed as `config.example.json` — copy
it to `config.json` (never commit your real keys):

```bash
dikabuff config set provider ollama
dikabuff config set baseUrl http://localhost:7777/v1
dikabuff config set model oc/deepseek-v4-flash-free
```

No backend handy? The default `mock` provider lets you demo the full loop offline.

## Development

```bash
npm run dev                 # tsx: run the app from source
npm run typecheck
npm test
npm run build
npm run docs                # regenerate docs index + link check
```

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [UX](docs/UX.md) · [Database](docs/DATABASE.md) ·
[API](docs/API.md) · [Roadmap](docs/ROADMAP.md)

## License

MIT — you own your prompts, your tools, and your terminal. Run responsibly: every
permission dialog is there for a reason.