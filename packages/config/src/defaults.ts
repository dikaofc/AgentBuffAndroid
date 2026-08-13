import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, MAX_CONTEXT_MESSAGES } from "@dikabuff/shared";
import type { DikaConfig, ModelPreset } from "@dikabuff/shared";

/**
 * Pre-configured gateway written into the generated `~/.dikabuff/config.json`
 * so a fresh install only needs its API key (empty placeholder below).
 * Users can override everything with `dikabuff config set …`.
 */
export const DEFAULT_GATEWAY_URL = "https://ai.krynox.dev/v1";

export function defaultConfig(version: string): DikaConfig {
  return {
    version,
    provider: "ollama",
    model: "oc/deepseek-v4-flash-free",
    baseUrl: DEFAULT_GATEWAY_URL,
    apiKey: "",
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    theme: "dark",
    mode: "code",
    permissionMode: "default",
    compactThresholdTokens: 24_000,
    projectMemoryFile: "DIKABUFF.md",
    permissions: {
      categories: {
        filesystem: "ask",
        terminal: "ask",
        development: "allow",
        analysis: "allow",
      },
      tools: {
        read_file: "allow",
        search_files: "allow",
        project_scan: "allow",
        dependency_analysis: "allow",
        code_summary: "allow",
        git_status: "allow",
        git_diff: "allow",
        run_tests: "allow",
        lint: "allow",
      },
      autoApprove: ["analysis", "development"],
    },
    update: { checkOnStart: true, channel: "stable", intervalHours: 24 },
    logging: { level: "info", file: true, verbose: false },
    debug: false,
    plugins: [],
    memory: { enabled: true, provider: "json", vector: false },
    learn: {
      enabled: true,
      minPatternHits: 2,
      maxSteps: 3,
      maxTools: 20,
      maxEpisodesPerDay: 200,
    },
  };
}

/**
 * Default preset models. Users extend via ~/.dikabuff/models.json.
 * All gateways below speak the OpenAI-compatible dialect, so the same
 * HTTP provider serves every one of them.
 */
export const DEFAULT_MODELS: ModelPreset[] = [
  {
    id: "dikabuff-mock-1",
    provider: "mock",
    label: "Offline demo (mock)",
    contextWindow: 32000,
    maxOutputTokens: 2048,
    supportsTools: true,
    supportsStreaming: true,
    default: true,
  },
  {
    id: "oc/deepseek-v4-flash-free",
    provider: "ollama",
    label: "DeepSeek V4 Flash (gateway)",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
    costPer1MInput: 0.14,
    costPer1MOutput: 0.28,
    default: true,
  },
  {
    id: "deepseek/deepseek-chat",
    provider: "ollama",
    label: "DeepSeek Chat (OpenRouter)",
    baseUrl: "https://openrouter.ai/api/v1",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
    costPer1MInput: 0.14,
    costPer1MOutput: 0.28,
  },
  {
    id: "openrouter/auto",
    provider: "ollama",
    label: "OpenRouter auto (routing)",
    baseUrl: "https://openrouter.ai/api/v1",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "omniroute/default",
    provider: "ollama",
    label: "OmniRoute gateway (local)",
    baseUrl: "http://localhost:20128/v1",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "9router/default",
    provider: "ollama",
    label: "9Router gateway (local)",
    baseUrl: "http://localhost:20128/v1",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsStreaming: true,
  },
];

export const MODEL_WINNOW = MAX_CONTEXT_MESSAGES;

/** Key paths that are masked in logs / `config get` output. */
export const SECRET_KEYS = new Set(["apikey", "api_key", "key", "token", "secret"]);

export function maskSecrets(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(maskSecrets);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? "***" : maskSecrets(v);
    }
    return out;
  }
  return input;
}