import type { DikaConfig } from "@dikabuff/shared";
import type { LLMProvider, ProviderOptions } from "./types";
import { OpenAICompatibleProvider } from "./openai";
import { MockProvider } from "./mock";

export type { LLMProvider, ProviderOptions, ProviderMessage, ProviderToolCall, CompletedAssistantMessage, StreamDelta, ProviderError } from "./types";

export { MockProvider } from "./mock";
export { OpenAICompatibleProvider } from "./openai";

/** Build a provider from config. Defaults to the offline mock when no key exists. */
export function createProvider(config: DikaConfig, presets: Array<{ id: string; provider: string; baseUrl?: string; contextWindow?: number }> = []): LLMProvider {
  const preset = presets.find((p) => p.id === config.model);
  const opts: ProviderOptions = {
    model: config.model,
    baseUrl: config.baseUrl ?? preset?.baseUrl,
    apiKey: config.apiKey,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };

  switch (config.provider) {
    case "mock":
      return new MockProvider(config.model);
    case "openai":
    case "ollama":
    case "anthropic": // anthropic-compatible endpoints often speak OpenAI dialect; fall through
      return new OpenAICompatibleProvider(opts);
    default:
      return new OpenAICompatibleProvider(opts);
  }
}