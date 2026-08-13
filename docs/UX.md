# DikaBuff UX Design

> How a human drives the agent — interaction model, states, keybindings, and invariants.

## Interaction model

DikaBuff is a **conversational command line**: you type intent in natural language and
watch the agent *think, act, and report* — with every step visible and every
side-effect permissioned.

### Launch states

| State | What you see | What you can do |
|---|---|---|
| Start screen | logo, model, cwd, session id | type a prompt, open sidebar, switch model |
| Thinking | **animated activity line** (`⠋ Reasoning (turn 1)…` → `Running project_scan…` → `Composing final response…`) + tools run with live ✓/✗/◌ rows | keep typing (queued), watch the agent think, watch the tool panel |
| Streaming | assistant message rendering chunk-by-chunk | read, ^C to abort, wait |
| Awaiting permission | dialog with tool name/args | `Y` allow · `N` deny · `V` view diff |
| Awaiting answer | the agent asks a free-text question (ask_user) | type an answer + Enter, or Esc to reject |
| Error | red error panel with message | re-prompt or `/new` |

## Keybindings

| Key | Action |
|---|---|
| `Enter` | submit prompt |
| `Shift+Enter` | newline in input |
| `↑` / `↓` | input history |
| `←` / `→` / `Home` / `End` | cursor movement |
| `Esc` | toggle sidebar (or close diff overlay) |
| `Ctrl+M` | model picker popover |
| `Ctrl+Q` | quit |
| `Ctrl+C` | cancel running agent turn |

## Slash commands

| Command | Effect |
|---|---|
| `/mode <plan\|code\|debug\|research\|review>` | switch agent mode (gates tools + system prompt) |
| `/permissions <default\|acceptEdits\|plan\|bypassPermissions>` | set the global permission mode for this session |
| `/model` | open the model picker (same as `^M`) |
| `/theme <dark\|amoled\|dracula\|catppuccin\|minimal>` | hot-swap the UI palette (persisted) |
| `/clear` | clear the conversation (session kept) |
| `/compact` | fold old messages into a recap, freeing context |
| `/cost` | live token + cost accounting |
| `/status` | session summary: id, model, mode, permissions, theme |
| `/memory` | project memory notes |
| `/doctor` | quick diagnostics |
| `/learn` | auto-learning status (episodes, patterns, learned tools) |
| `/review` | code review of the working tree in this session |
| `/new` | fresh session |
| `/resume <id>` | resume session by id (or pick from sidebar) |
| `/help` | inline command help |
| `/quit` | exit |

## Layout

```
┌ Header: ◈ DikaBuff · session title · model · mode · cwd ────────────────┐
│ ┌ Sidebar ┐ ┌ Chat ──────────────────────────────────────────────┐     │
│ │ sessions│ │ [user] explain the agent loop                      │     │
│ │ files   │ │ ┌ tools ──────────────────────────────────────┐   │     │
│ │         │ │ │ ◌ project_scan…                             │   │     │
│ │         │ │ │ ✓ git_status (0.12s)                        │   │     │
│ │         │ │ └─────────────────────────────────────────────┘   │     │
│ │         │ │ [assistant] the loop runs in 5 phases: …          │     │
│ └─────────┘ └──────────────────────────────────────────────────┘  │
│ > prompt… (multiline, history, hints)                             │
│ StatusBar: ● thinking · model · mode · 1,204 tokens · ^Q quit     │
└────────────────────────────────────────────────────────────────────┘
```

## UX invariants

1. **Traceability** — every model thought, tool call, permission, and error is rendered
   in a dedicated panel. The user is never asked to trust a black box.
2. **Non-blocking** — the UI renders from external store state; the agent loop never
   owns the terminal.
3. **Safe by default** — write/edit/terminal tools request consent; `--yes` is explicit
   and per-invocation; `V` shows the exact diff before granting.
4. **Session continuity** — sessions persist automatically; resume from sidebar or
   `/resume`; each session remembers model + mode.
5. **Fast loops** — tool panels update instantly via 16 ms delta batching;
   long outputs stream as whole lines, not character soup.

## UX patterns distilled from modern agent CLIs

DikaBuff's interaction model follows the conventions proven by the leading
terminal coding agents — verb-first commands, permission gates, live tool
panels, and in-TUI command reference. Distilled rules:

1. **Verb-first task commands** — `dikabuff fix`, `analyze`, `review`, `chat`,
   `run` all take a natural-language prompt as the argument.
2. **Fresh chat stays instant** — "minimal system prompt / token efficient"
   ethos; DikaBuff answers quick/conversational messages directly without a
   project scan (mock provider + system-prompt rule), and only enters the
   scan-tool loop when the request actually touches the codebase.
3. **Answers vary with the question** — greetings get a greeting, "who are you"
   gets an identity answer, thanks get acknowledged; a quick chat must never
   feel like a stuck loop repeating the same canned text.
4. **Permission + control flows** — every tool call is gated by the consent
   dialog, auto-approve is per-category and per-invocation, `V` shows the exact
   diff before granting. Four global permission modes (`default` ·
   `acceptEdits` · `plan` · `bypassPermissions`) tune the balance between
   autonomy and safety per session.
5. **Command reference in-TUI** — `/help` lists every slash command; the
   statusbar hint shows the essentials.
6. **Token efficiency** — auto-compaction folds long histories into a recap
   when the session exceeds `compactThresholdTokens`; `/compact` does it on
   demand; `/cost` reports live token + cost accounting.
7. **Terminal-native, env-agnostic** — works in any shell/editor; Termux notes in
   `docs/ARCHITECTURE.md` (use `TERM=xterm-256color`; `NO_COLOR` respected).
