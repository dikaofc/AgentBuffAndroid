/** LLM provider contracts. Every provider must satisfy these interfaces. */

export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  role: ProviderRole;
  content: string;
  /** Tool name when role === "tool". */
  name?: string;
  /** Tool call id when role === "tool" (maps to the assistant tool call). */
  toolCallId?: string;
}

export interface ProviderToolCall {
  id: string;
  name: string;
  /** Parsed JSON arguments. */
  arguments: Record<string, unknown>;
  /** Raw argument string (for debugging). */
  rawArguments: string;
}

export interface CompletedAssistantMessage {
  content: string;
  toolCalls: ProviderToolCall[];
  reasoning?: string;
}

export interface StreamDelta {
  /** Visible answer text. */
  text: string;
  /** CoT / thinking text (DeepSeek reasoning_content style). */
  reasoning?: string;
  done: boolean;
}

export interface ProviderOptions {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  /** Hard timeout for non-streaming calls (ms). */
  timeoutMs?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  readonly supportsTools: boolean;
  readonly supportsStreaming: boolean;
  /** Non-streaming turn used for tool-calling decisions. */
  completeWithTools(messages: ProviderMessage[], tools: unknown[]): Promise<CompletedAssistantMessage>;
  /** Streaming turn used for the final answer. */
  stream(messages: ProviderMessage[]): AsyncGenerator<StreamDelta>;
  countTokens(text: string): number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}