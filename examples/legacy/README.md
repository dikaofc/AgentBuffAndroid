# Legacy single-file DikaBuff (v0.2.0)

Archived from the repository root on the monorepo migration.

- `dikabuff` — the original dependency-free Node script (Indonesian UI, bash-style).
  Run with `node dikabuff` or `./dikabuff "prompt"`.
- Config: still lives at the repository root as `config.json` and is **automatically
  absorbed** by the new CLI (`absorbLegacyConfig` reads the `providers.ollama` shape),
  so `oc/deepseek-v4-flash-free @ localhost:7777` keeps working with `dikabuff chat`.
- The old README describing v0.2.0 was replaced by the repository-root README.

Migration notes:
- Old flags `--model`, `--config`, `--doctor`, `FBAI_*` env vars are superseded by
  the new CLI commands (`config`, `doctor`, `run/chat/analyze/...`).
- Tool names changed: `bash` → `execute_command`, `read_file` → `read_file` (same),
  `write_file` → `write_file`, `edit_file` → `edit_file`, `list_dir` → `search_files`,
  `web_fetch` → (plugin) `http/fetch`, `subagent` → planned plugin.