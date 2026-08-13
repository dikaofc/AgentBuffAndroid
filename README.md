# ◈ DikaBuff Agent CLI

**AI coding intelligence in your terminal** — a terminal-native AI coding agent built for
**Android Termux** (and any POSIX terminal). Bring your own backend: OpenAI-compatible
gateways (OmniRoute, 9Router, OpenRouter, or any local server).

[![CI](https://github.com/dikaofc/AgentBuffAndroid/actions/workflows/ci.yml/badge.svg)](https://github.com/dikaofc/AgentBuffAndroid/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/dikaofc/AgentBuffAndroid)](https://github.com/dikaofc/AgentBuffAndroid/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📟 Live preview

```text
  ◈ DikaBuff Agent CLI

  dikabuff-mock-1 · code · ~/DIKABUFF

  ────────────────────────────────────

  type a request (or /help) — quick chats answer instantly, no scan

  /mode plan|code · /permissions · /model · /clear · /compact · /cost · /status · /memory

╭───────────────────────────────────────────────────────────────────────────────────────────────╮
│ ›                                                                                              │
│ Enter send · Shift+Enter newline · ↑ history · / for commands                                  │
╰───────────────────────────────────────────────────────────────────────────────────────────────╯
╭───────────────────────────────────────────────────────────────────────────────────────────────╮
│ ● idle · dikabuff-mock-1 · code · ~/DIKABUFF · dikabuff se… ^Q quit  ^M model  Esc sidebar /help│
╰───────────────────────────────────────────────────────────────────────────────────────────────╯
```

```text
── User ──
  what is this project

── DikaBuff ──
  ## Analysis for: what is this project
  I scanned the project and gathered context.
  • Top-level: .github, .gitignore, LICENSE, README.md, apps, docs, packages…
  • Git: branch master (clean)

  ## Plan
  1. Understand — read the relevant modules under the matching entry points.
  2. Implement — apply minimal, idiomatic edits with focused diffs.
  4. Report — summarize changes, files touched, and how to verify them.

 ✓ project_scan (380ms)
```

---

## ✨ Features

| | |
|---|---|
| 🖥️ **Beautiful Ink 5 TUI** | chat panel, activity line, tool-execution panel, sub-agent panel, diff viewer, permission dialogs, file tree sidebar |
| 🤖 **Agent loop, 5 modes** | `code` · `plan` · `debug` · `research` · `review` with a planner & automatic context compaction |
| 🛠️ **17 built-in tools** | `read_file` · `search_files` · `write_file` · `edit_file` · `execute_command` · `project_scan` · `git_status` · `git_diff` · `run_tests` · `lint` · `web_search` · `ask_user` · `subagent` · `code_summary` · `dependency_analysis` · `install_package` · `delete_file` |
| 🔐 **Permission system** | 4 modes (`default` · `acceptEdits` · `plan` · `bypassPermissions`) + per-tool permission dialogs |
| 🧠 **Long-term memory** | KV store, session store, project notes (`DIKABUFF.md` auto-loaded) |
| 🎓 **Auto-learning** | every run is an episode → patterns detected → **macro tools auto-created** & saved globally |
| 🌐 **Bring your own model** | any OpenAI-compatible gateway — OmniRoute, 9Router, OpenRouter, Ollama, local servers |
| 💰 **Cost tracking** | live `/cost`, model pricing presets, usage in run JSON |
| 🔎 **Keyless web search** | built-in `web_search` tool, no API key required |
| 🎨 **5 themes** | `dark` · `amoled` · `dracula` · `catppuccin` · `minimal` |
| 🔌 **Plugins** | plugin SDK, loader, marketplace (`plugin install <name>`) |
| 📦 **12 CLI commands** | `init` `chat` `run` `analyze` `review` `fix` `memory` `plugin` `config` `update` `doctor` `learn` |

---

## 📱 Install on Termux

```bash
pkg install nodejs git -y
git clone https://github.com/dikaofc/AgentBuffAndroid.git
cd AgentBuffAndroid
sh install.sh
```

The installer detects Termux automatically, builds the CLI, installs the `dikabuff`
command into `$PREFIX/bin`, and adds it to your PATH. On Linux/macOS it uses
`~/.local/bin` (or `/usr/local/bin` with `--system`).

> No backend handy? The default **mock provider** demos the full loop offline.

## 🚀 Quickstart

```bash
dikabuff                                    # interactive session
dikabuff "explain this repo"                # one-shot
dikabuff run "add tests for utils"          # headless run
dikabuff run "analyze" --output-format json # machine-readable output
dikabuff chat --permission-mode plan        # read-only session
dikabuff doctor                             # diagnose config + connectivity
dikabuff learn                              # auto-learning status
```

### Development (from source)

```bash
npm install
npm run build
npm run dikabuff             # or: npm run dev (tsx from source)
npm run typecheck && npm test
```

---

## ⚙️ Configuration

On first run the CLI **auto-generates** `~/.dikabuff/` (config folder) with a pre-configured
`config.json` — **you only need to add your API key**:

```bash
dikabuff config set apiKey sk-...
# or edit ~/.dikabuff/config.json directly
```

A sanitized template is also committed as [`config.example.json`](config.example.json).
Everything is overridable:

```bash
dikabuff config set provider ollama
dikabuff config set baseUrl https://your-gateway.example.com/v1
dikabuff config set model your/model-id
dikabuff config set apiKey sk-...
dikabuff config theme catppuccin           # switch theme
```

```jsonc
// ~/.dikabuff/config.json
{
  "provider": "ollama",
  "model": "oc/deepseek-v4-flash-free",
  "baseUrl": "https://your-gateway.example.com/v1",
  "theme": "dark",
  "permissionMode": "default",
  "learn": { "enabled": true, "minPatternHits": 2, "maxSteps": 3, "maxTools": 20 }
}
```

### Slash commands

| Command | Action |
|---|---|
| `/mode` | switch agent mode (`code`/`plan`/…) |
| `/permissions` | set permission mode: `default` `acceptEdits` `plan` `bypassPermissions` |
| `/model` | switch model |
| `/theme` | switch theme |
| `/compact` | compact context now |
| `/cost` | live token & cost usage |
| `/status` | session status |
| `/memory` | inspect long-term memory |
| `/doctor` | diagnostics |
| `/learn` | auto-learning status |
| `/review` | review the working tree |
| `/new` · `/resume` | new / resume session |
| `/help` · `/clear` · `/quit` | help / clear / quit |

---

## 🎓 Auto-learning

DikaBuff learns every time it runs:

1. Each agent run is recorded as an **episode** (which tools ran, in what order, success/failure).
2. Repeated successful tool sequences become **patterns** (rolled into daily stats under `~/.dikabuff/learn/`).
3. New patterns **auto-create macro tools**, auto-saved globally and available in every project.

Learned tools are read-only compositions of existing tools — they replay through the same
permission pipeline (no bypass), with recursion and depth guards.

---

## 🏗️ Architecture

```
◈ DikaBuff (9 packages)
  ├── apps/dikabuff-cli     bin `dikabuff` (DI container, entry)
  ├── packages/
  │   ├── shared            types · constants · ansi · ids · logger
  │   ├── config            ConfigManager · 5 themes · model presets
  │   ├── memory            KV/session stores · vector index (JSON default, SQLite opt-in)
  │   ├── tools             ToolRegistry · permission tiers · 17 built-ins
  │   ├── agent-core        agent loop · modes · providers (openai-compatible + mock)
  │   ├── learner           auto-learning: episodes → patterns → macro tools
  │   ├── terminal-ui       Ink app: AppShell · UiStore · markdown engine
  │   ├── plugins           plugin SDK · loader · marketplace
  │   └── cli               commander program · headless commands
  ├── docs/                 ARCHITECTURE · UX · DATABASE · API · ROADMAP
  └── examples/legacy/      archived single-file dikabuff
```

## 📚 Documentation

[Architecture](docs/ARCHITECTURE.md) · [UX](docs/UX.md) · [Database](docs/DATABASE.md) ·
[API](docs/API.md) · [Roadmap](docs/ROADMAP.md)

## 🤝 Contributing

```bash
npm run typecheck   # strict TypeScript
npm test            # vitest (42 tests)
npm run build       # tsup, all workspaces
npm run docs        # docs index + link check
```

CI runs all of the above on every push and PR — keep it green.

## 📄 License

[MIT](LICENSE) — you own your prompts, your tools, and your terminal. Run responsibly:
every permission dialog is there for a reason.
