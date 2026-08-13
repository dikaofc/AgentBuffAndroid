# DikaBuff Roadmap

> Phased plan from foundations to GA.

## Phase 0 — Scaffolding (done)

- [x] npm workspaces monorepo, `tsconfig.base.json` (strict ESM), vitest
- [x] `@dikabuff/shared`: types, constants, ansi, ids, logger
- [x] `@dikabuff/config`: ConfigManager, 5 themes, defaults, legacy absorption
- [x] `@dikabuff/memory`: KV/session stores, vector index (default JSON)
- [x] `@dikabuff/tools`: registry, permission tiers, 13 built-ins
- [x] `@dikabuff/agent-core`: agent loop, modes, providers (openai-compatible + mock)
- [x] `@dikabuff/plugins`: SDK, loader, marketplace
- [x] `@dikabuff/terminal-ui`: AppShell + 15 components + markdown engine + UiStore
- [x] `@dikabuff/cli` + `apps/dikabuff-cli`: commander program, DI container, bin
- [x] docs (ARCHITECTURE / UX / DATABASE / API / ROADMAP), legacy archive

## Phase 1 — Hardening (v0.1 → v0.2) ✓

- [x] `npm install`, full `tsc --noEmit` clean, `vitest` green, tsup builds
- [x] Smoke tests: `--help`, `config theme catppuccin`, `run` with mock provider
- [x] Headless CI harness (agent under test with mock provider)
- [ ] Error taxonomy: provider errors → retry w/ backoff; tool errors → loop continues
- [x] Token accounting (per-turn input/output, session totals via `/cost`)
- [ ] `dikabuff doctor` network probe (GET /models + POST ping)

## Phase 1.5 — UX & intelligence upgrade (done)

- [x] Permission modes: `default · acceptEdits · plan · bypassPermissions` (+ `--permission-mode`, `/permissions`)
- [x] Full slash commands: `/clear /compact /cost /status /model /theme /memory /doctor /permissions`
- [x] Print & JSON mode: `-p` / `--print`, `--output-format text|json` for `run`/`chat`
- [x] Project memory: `DIKABUFF.md` auto-loaded into the system prompt
- [x] Context compaction: auto (`compactThresholdTokens`) + manual `/compact`
- [x] Cost tracking: model pricing presets, `/cost`, usage in run JSON
- [x] Gateway presets: OpenRouter, OmniRoute, 9Router, custom OpenAI-compatible endpoints

## Phase 2 — Intelligence (v0.2 → v0.5) ← current version track (v0.5.0)

> Version track: v0.5.0. Phase 2 is in progress — the unchecked items below remain open.

- [ ] Real streaming (`streamMode: "regenerate"`) for openai-compatible providers
- [x] Sub-agent delegation tool (parallel fan-out research, read-only whitelist, live progress panel)
- [x] Auto-learning: episodes recorded per run → daily stats → pattern detection → auto-created macro tools auto-saved globally (`@dikabuff/learner`, `dikabuff learn`, `/learn`)
- [ ] On-demand project indexing (chunked files → vector embeddings, optional adapter)
- [ ] Context packing: truncate-by-token with importance ordering
- [ ] Multi-session planning (/plan writes roadmap to session memory)
- [ ] `askUser` interstitial prompts from tools (interactive forms)

## Phase 3 — Ecosystem (v0.5 → v0.8)

- [ ] Marketplace v1: signed plugin index, `plugin install <name>` w/ checksum verify
- [ ] Template plugins (mcp-server client, subagent, web_fetch) in repo
- [ ] Config wizard (`dikabuff setup`) — pick provider + model interactively
- [ ] `dikabuff update` auto-install via npm when run from a package manager context
- [ ] Local-first telemetry: anonymized event log (`~/.dikabuff/events.log`)

## Phase 4 — GA (v0.8 → v1.0)

- [ ] SQLite default on capable platforms (still zero native deps for CI)
- [ ] Plugin marketplaces + sandboxed tool execution (cgroup/rlimit on Linux)
- [ ] Sessions UI: search/filter, pin favorite sessions
- [ ] LSP integration for edit_file (diagnostics before/after)
- [ ] i18n: EN + ID locales (legacy UI was Indonesian)
- [ ] Security review, threat model write-up, `audit` command

## Non-goals (v1)

- Cloud accounts, SaaS telemetry, proprietary model endpoints
- Replacing the user's editor — orchestration happens *in the terminal*