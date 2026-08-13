# DikaBuff Database Design

> Storage architecture for config, memory, sessions, and indexing.

## Roots

| Path | Purpose |
|---|---|
| `~/.dikabuff/config.json` | runtime configuration |
| `~/.dikabuff/models.json` | model presets (merged with built-ins) |
| `~/.dikabuff/memory/` | long-term memory entries |
| `~/.dikabuff/sessions/` | per-session metadata + message logs |
| `~/.dikabuff/plugins/` | installed plugins (dir per plugin) |
| `~/.dikabuff/dikabuff.log` | file logger (optional) |

## Config document (`config.json`)

```jsonc
{
  "provider": "mock",            // openai | ollama | anthropic | mock
  "model": "dikabuff-mock",
  "baseUrl": "",                 // for openai-compatible gateways
  "apiKey": "",                  // secrets masked in output
  "theme": "catppuccin",
  "mode": "code",
  "plugins": [],
  "memory": { "provider": "json", "vector": "bigram" },
  "logging": { "level": "info", "file": true },
  "permissions": { "tools": {} },
  "update": { "channel": "stable" }
}
```

### Legacy absorption

`absorbLegacyConfig()` merges the old `providers.ollama` blob:

```json
{ "providers": { "ollama": {
  "baseUrl": "http://localhost:7777/v1", "api": "openai-completions",
  "apiKey": "sk-…", "models": [{ "id": "oc/deepseek-v4-flash-free" }]
} } }
```

→ `provider:"ollama"`, `baseUrl`, `apiKey`, `model:"oc/deepseek-v4-flash-free"`.
Applied automatically when no explicit key is set — the old gateway keeps working.

## Memory store (`~/.dikabuff/memory/`)

`KeyValueStore` interface: `get/set/delete/list/search(k, limit)`.

Each entry:

```jsonc
{ "key": "notes.project.a1b2c3",
  "value": { "text": "…", "tags": ["project"] },
  "createdAt": 1720000000000, "updatedAt": 1720000000000 }
```

### Vector index

`VectorIndex.search(query, limit)` ranks entries by **bigram overlap** over a
whitespace-normalized bag of words:

```
score(entry, q) = |bigrams(entry) ∩ bigrams(q)| / max(1, |bigrams(q)|)
```

Deterministic, dependency-free, O(n) per query for small corpora — the interface is
designed so a real embedding provider can replace the ranking without touching callers.

## Session store (`~/.dikabuff/sessions/`)

`SessionStore` interface: `upsert/get/list/appendMessage/getMessages/clearMessages`.

### Session meta — `<id>.json`

```jsonc
{ "id": "s_8f3a…", "title": "explain the agent loop",
  "cwd": "/data/data/com.termux/files/home/DIKABUFF",
  "model": "oc/deepseek-v4-flash-free", "mode": "code",
  "startedAt": 1720000000000, "updatedAt": 1720000000000,
  "messageCount": 12, "tokenCount": 3400 }
```

### Message log — `<id>.messages.jsonl` (append-only)

```
{"id":"m_…","role":"user","content":"…","createdAt":…,"meta":{}}
{"id":"m_…","role":"assistant","content":"…","createdAt":…,"meta":{"model":"…","tokens":…}}
{"id":"m_…","role":"tool","toolName":"project_scan","content":"…","createdAt":…}
```

Tool messages are stored for audit and **stripped from the prompt window**
(`sanitizedHistory`) since tool results are re-fetched by the loop.

## SQLite backend

Optional drop-in replacing the JSON files: same interfaces backed by
`better-sqlite3` (`memory.provider: "sqlite"`), with WAL pragmas and a single
`kv` + `sessions` + `messages` schema. Lazy-required — no native module at install.

## Persistence rules

- Keys are namespaced: `notes.<project>.*`, `prefs.*`, `doctor.*`.
- Session metadata is upserted after every turn; the message log is append-only.
- Nothing is written destructively — config writes go through `setByPath` with
  atomic `writeFileSync(tmp) → rename`.
- Vector + KV are updated transactionally per `remember()` call.