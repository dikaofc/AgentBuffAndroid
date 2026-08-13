import { CHAT_COMPLETIONS_PATH } from "@dikabuff/shared";
import type {
  CompletedAssistantMessage,
  LLMProvider,
  ProviderError as ProviderErrorType,
  ProviderMessage,
  ProviderOptions,
  ProviderToolCall,
  StreamDelta,
} from "./types";
import { ProviderError } from "./types";

/**
 * OpenAI-compatible chat completions provider (works with OpenAI, local
 * gateways, Ollama /v1, vLLM, LM Studio, DeepSeek…).
 * Strategy: non-streaming for tool-calling turns, SSE streaming for answers.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = "openai-compatible";
  readonly model: string;
  readonly supportsTools = true;
  readonly supportsStreaming = true;

  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ProviderOptions) {
    this.model = opts.model;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey;
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
  }

  countTokens(text: string): number {
    // Fast approximation: OpenAI BPE betrays ~4 chars/token.
    return Math.ceil(text.length / 4);
  }

  async completeWithTools(messages: ProviderMessage[], tools: unknown[]): Promise<CompletedAssistantMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint(), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          messages: toWire(messages),
          tools,
          tool_choice: tools.length ? "auto" : "none",
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 2000);
        throw new ProviderError(`Provider ${this.model} returned ${res.status}`, res.status, body);
      }
      const data = (await res.json()) as OpenAIChatResponse;
      const choice = data.choices?.[0];
      if (!choice) throw new ProviderError(`Provider returned no choices: ${JSON.stringify(data).slice(0, 500)}`);
      const msg = choice.message ?? {};
      const toolCalls: ProviderToolCall[] = (msg.tool_calls ?? []).map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments ?? "{}");
        } catch {
          args = { raw: tc.function.arguments };
        }
        return {
          id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
          name: tc.function.name ?? "unknown",
          arguments: args,
          rawArguments: tc.function.arguments ?? "",
        };
      });
      return {
        content: msg.content ?? "",
        toolCalls,
        reasoning: msg.reasoning_content,
      };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new ProviderError(`Provider timed out after ${this.timeoutMs}ms`);
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`Network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(messages: ProviderMessage[]): AsyncGenerator<StreamDelta> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint(), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          messages: toWire(messages),
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw new ProviderError(`Provider ${this.model} returned ${res.status}`, res.status, body.slice(0, 2000));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            yield { text: "", done: true };
            return;
          }
          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;
          yield {
            text: delta.content ?? "",
            reasoning: delta.reasoning_content,
            done: false,
          };
        }
      }
      yield { text: "", done: true };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new ProviderError(`Provider stream timed out after ${this.timeoutMs}ms`);
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`Network error during stream: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private endpoint(): string {
    return this.baseUrl.replace(/\/+$/, "") + CHAT_COMPLETIONS_PATH;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    return headers;
  }
}

function toWire(messages: ProviderMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

function normalizeBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return "https://api.openai.com/v1";
  const url = baseUrl.replace(/\/+$/, "");
  if (url.endsWith("/chat/completions")) return url.slice(0, -"/chat/completions".length);
  return url;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function: { name?: string; arguments?: string };
      }>;
      reasoning_content?: string;
    };
  }>;
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string };
  }>;
}