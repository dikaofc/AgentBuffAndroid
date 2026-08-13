import path from "node:path";
import { execSync } from "node:child_process";
import type {
  AgentEvent,
  ChatMessage,
  DikaConfig,
  MemoryGateway,
  PermissionRequest,
  SessionInfo,
  ToolCategory,
  ToolContext,
  ToolResult,
} from "@dikabuff/shared";
import { MAX_AGENT_TURNS, newId, newMessageId, newSessionId } from "@dikabuff/shared";
import { ToolRegistry } from "@dikabuff/tools";
import type { SessionRecord } from "@dikabuff/memory";
import { AgentEvents } from "./events";
import { buildPromptWindow, buildSystemPrompt, modeAllowedCategories } from "./context";
import { Planner, type PlanStep } from "./planner";
import { HookManager, type AgentHooks } from "./hooks";
import { getMode } from "./modes";
import { runSubAgent } from "./subagent";
import type {
  CompletedAssistantMessage,
  LLMProvider,
  ProviderMessage,
  ProviderToolCall,
} from "./providers";

export interface AgentRunResult {
  answer: string;
  sessionId: string;
  turns: number;
  toolCalls: number;
  tokensUsed: number;
  /** Input tokens sent to the provider during this turn. */
  inputTokens: number;
  /** Output tokens generated during this turn. */
  outputTokens: number;
  /** Estimated cost in USD for this turn (0 when unpriced). */
  costUsd: number;
  /** Whether compaction ran during this turn. */
  compacted: boolean;
  durationMs: number;
}

export type StreamMode = "replay" | "regenerate";

export interface AgentOptions {
  provider: LLMProvider;
  registry: ToolRegistry;
  memory: MemoryGateway;
  config: DikaConfig;
  cwd: string;
  events: AgentEvents;
  logger: { debug(m: string, d?: unknown): void; info(m: string, d?: unknown): void; warn(m: string, d?: unknown): void; error(m: string, d?: unknown): void };
  /** Decision maker for permission dialogs (UI shows dialog; CLI resolves policy). */
  consent: (request: PermissionRequest) => Promise<boolean>;
  /** Free-text ask surfaced to the user (e.g. "which port?"). */
  askUser?: (prompt: string, options?: { timeoutMs?: number }) => Promise<string | null>;
  sessionStore?: { upsert(s: SessionRecord): Promise<void> };
  hooks?: AgentHooks;
  streamMode?: StreamMode;
  /** Model pricing (USD per 1M tokens) for cost estimation. */
  modelCost?: { costPer1MInput?: number; costPer1MOutput?: number };
  /** Called for each chunk of the final answer (UI subscribes via events anyway). */
  onDelta?: (delta: string) => void;
}

/**
 * The agent loop:
 *   user request → context → plan → tool selection → execute → observe → reflect → answer
 */
export class Agent {
  private readonly planner = new Planner();
  private readonly hooks = new HookManager();
  session: SessionInfo;

  constructor(private readonly opts: AgentOptions, session?: SessionInfo) {
    this.session = session ?? this.newSession();
    if (opts.hooks) this.hooks.register(opts.hooks);
    this.emit({ type: "meta", sessionId: this.session.id, meta: { session: this.session } });
  }

  /* ----------------------------- session ----------------------------- */

  private newSession(): SessionInfo {
    return {
      id: newSessionId(),
      title: `dikabuff session`,
      cwd: this.opts.cwd,
      projectPath: this.opts.cwd,
      model: this.opts.provider.model,
      mode: this.opts.config.mode,
      status: "active",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      tokenCount: 0,
    };
  }

  /* ------------------------------ entry ------------------------------- */

  async run(prompt: string): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const log = this.opts.logger;
    this.session.title = truncate(prompt, 48);
    this.session.updatedAt = Date.now();

    this.emit({ type: "thinking", step: "Analyzing request…", sessionId: this.session.id });
    await this.opts.memory.appendMessage(this.session.id, this.toChat("user", prompt));
    this.session.messageCount += 1;

    await this.persistSession();

    const steps = this.planner.plan(this.session.mode, prompt);
    for (const step of steps.slice(1)) {
      this.emit({ type: "thinking", step: step.title + (step.detail ? ` — ${step.detail}` : ""), sessionId: this.session.id });
    }

    // Auto-compact: when the session history is large, fold old turns into a
    // short summary so long sessions stay inside the context window (token
    // efficiency without losing the conversation's through-line).
    const compacted = await this.maybeCompact();
    if (compacted) {
      this.emit({ type: "thinking", step: "Conversation compacted to keep context lean.", sessionId: this.session.id });
    }

    const snapshot = await this.buildSnapshot();
    const system = buildSystemPrompt(this.opts.config, this.session, snapshot);
    const history = await this.sanitizedHistory();
    const budget = this.session.model === "mock" ? 24_000 : this.opts.config.maxTokens * 4;
    const window = buildPromptWindow(system, history, prompt, (t) => this.opts.provider.countTokens(t), budget);

    let messages: ProviderMessage[] = [
      { role: "system", content: window.system },
      ...window.messages.map((m) => this.toProvider(m)),
    ];

    let turns = 0;
    let toolCalls = 0;
    let tokensUsed = 0;
    let inputTokens = window.estimatedTokens;
    let outputTokens = 0;

    this.emit({ type: "message:start", delta: "", sessionId: this.session.id });

    while (true) {
      turns++;
      await this.hooks.runBeforeTurn(turns, prompt);
      this.emit({ type: "thinking", step: `Reasoning (turn ${turns})…`, sessionId: this.session.id });

      let decision: CompletedAssistantMessage;
      try {
        decision = await this.opts.provider.completeWithTools(messages, this.toolSchemas());
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit({ type: "error", error, sessionId: this.session.id });
        await this.hooks.runOnError(error);
        const fallback = `⚠️ Provider error: ${error.message}\n\nCheck \`~/.dikabuff/config.json\` (provider/model/baseUrl/apiKey) or run \`dikabuff doctor\`.`;
        await this.persistAnswer(prompt, fallback);
        return this.finish(prompt, fallback, turns, toolCalls, tokensUsed, inputTokens, outputTokens, compacted, startedAt);
      }

      // Output tokens: what the model generated this turn. Input tokens: the
      // window we sent plus tool results echoed back on subsequent turns.
      outputTokens += this.opts.provider.countTokens(decision.content ?? "");
      tokensUsed += this.opts.provider.countTokens(decision.content ?? "");

      if (decision.toolCalls.length === 0) {
        const answer = await this.finalize(messages, prompt, decision, turns, toolCalls, tokensUsed, inputTokens, outputTokens, compacted, startedAt);
        return answer;
      }

      // Execute tool calls and observe results.
      messages = this.appendAssistant(messages, decision);
      for (const call of decision.toolCalls) {
        toolCalls++;
        const result = await this.executeTool(call, log);
        await this.hooks.runAfterTool(call.name, result);
        const content = toolResultToContent(result);
        inputTokens += this.opts.provider.countTokens(content);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content,
        });
        await this.opts.memory.appendMessage(this.session.id, this.toChat("tool", result.output ?? result.error ?? "done", { toolName: call.name, toolCallId: call.id }));
      }
      await this.persistSession();
      await this.hooks.runAfterTurn(turns);

      if (turns >= MAX_AGENT_TURNS) {
        const stopMsg = "Reached max agent turns — producing summary with current context.";
        this.emit({ type: "thinking", step: stopMsg, sessionId: this.session.id });
        const answer = await this.finalize(messages, prompt, { content: stopMsg + await this.summarize(), toolCalls: [], reasoning: undefined }, turns, toolCalls, tokensUsed, inputTokens, outputTokens, compacted, startedAt);
        return answer;
      }
    }
  }

  /* --------------------------- finalization --------------------------- */

  private async finalize(
    messages: ProviderMessage[],
    prompt: string,
    decision: CompletedAssistantMessage,
    turns: number,
    toolCalls: number,
    tokensUsed: number,
    inputTokens: number,
    outputTokens: number,
    compacted: boolean,
    startedAt: number,
  ): Promise<AgentRunResult> {
    this.emit({ type: "thinking", step: "Composing final response…", sessionId: this.session.id });
    const answer = this.opts.streamMode === "regenerate"
      ? await this.streamAnswerViaProvider(messages, decision)
      : await this.replayAnswer(decision.content);
    await this.persistAnswer(prompt, answer);
    return this.finish(prompt, answer, turns, toolCalls, tokensUsed, inputTokens, outputTokens, compacted, startedAt);
  }

  /** Client-side chunked replay — identical text on every provider. */
  private async replayAnswer(content: string): Promise<string> {
    if (this.opts.streamMode === "regenerate") return content; // safe fallback
    const CHUNK = 8;
    for (let i = 0; i < content.length; i += CHUNK) {
      const delta = content.slice(i, i + CHUNK);
      this.emit({ type: "message:delta", delta, sessionId: this.session.id });
      this.opts.onDelta?.(delta);
      this.session.tokenCount += this.opts.provider.countTokens(delta);
      await sleep(6);
    }
    return content;
  }

  /** Ask the model to generate the final answer with real streaming. */
  private async streamAnswerViaProvider(messages: ProviderMessage[], decision: CompletedAssistantMessage): Promise<string> {
    this.emit({ type: "message:start", delta: "", sessionId: this.session.id });
    // Strip tool/assistant-preamble messages for a clean final generation.
    const clean = messages.filter((m) => m.role !== "tool" && m.content !== "");
    let full = "";
    try {
      for await (const delta of this.opts.provider.stream(clean)) {
        if (delta.reasoning) {
          this.emit({ type: "thinking", step: delta.reasoning, sessionId: this.session.id });
        }
        if (delta.text) {
          full += delta.text;
          this.emit({ type: "message:delta", delta: delta.text, sessionId: this.session.id });
          this.opts.onDelta?.(delta.text);
          this.session.tokenCount += this.opts.provider.countTokens(delta.text);
        }
      }
    } catch (err) {
      full = `${full}\n\n⚠️ Streaming failed: ${(err as Error).message}`;
    }
    return full || decision.content;
  }

  private finish(
    prompt: string,
    answer: string,
    turns: number,
    toolCalls: number,
    tokensUsed: number,
    inputTokens: number,
    outputTokens: number,
    compacted: boolean,
    startedAt: number,
  ): AgentRunResult {
    const costUsd = this.estimateCost(inputTokens, outputTokens);
    const result: AgentRunResult = {
      answer,
      sessionId: this.session.id,
      turns,
      toolCalls,
      tokensUsed,
      inputTokens,
      outputTokens,
      costUsd,
      compacted,
      durationMs: Date.now() - startedAt,
    };
    // Note: session.tokenCount is already updated per-delta by replayAnswer /
    // streamAnswerViaProvider; adding tokensUsed here would double-count.
    this.session.messageCount += 1;
    this.session.updatedAt = Date.now();
    this.session.status = "paused";
    this.session.metadata = {
      ...(this.session.metadata ?? {}),
      costUsd: (Number((this.session.metadata as any)?.costUsd) || 0) + costUsd,
      inputTokens: (Number((this.session.metadata as any)?.inputTokens) || 0) + inputTokens,
      outputTokens: (Number((this.session.metadata as any)?.outputTokens) || 0) + outputTokens,
    };
    void this.persistSession();
    this.emit({ type: "message:done", content: answer, sessionId: this.session.id, meta: { ...result, prompt } });
    this.emit({ type: "done", content: answer, sessionId: this.session.id, meta: { ...result, prompt } });
    return result;
  }

  /** Estimated USD cost for the given token counts (0 when unpriced). */
  estimateCost(inputTokens: number, outputTokens: number): number {
    const cost = this.opts.modelCost;
    if (!cost) return 0;
    const perIn = cost.costPer1MInput ?? 0;
    const perOut = cost.costPer1MOutput ?? 0;
    if (perIn === 0 && perOut === 0) return 0;
    return (inputTokens / 1_000_000) * perIn + (outputTokens / 1_000_000) * perOut;
  }

  /** Session-wide cost + token summary (used by /cost). */
  getUsage(): { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; priced: boolean } {
    const meta = (this.session.metadata ?? {}) as Record<string, unknown>;
    const inputTokens = Number(meta.inputTokens) || 0;
    const outputTokens = Number(meta.outputTokens) || 0;
    const costUsd = Number(meta.costUsd) || 0;
    const priced = this.opts.modelCost != null && ((this.opts.modelCost.costPer1MInput ?? 0) > 0 || (this.opts.modelCost.costPer1MOutput ?? 0) > 0);
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd, priced };
  }

  private async persistAnswer(prompt: string, answer: string): Promise<void> {
    await this.opts.memory.appendMessage(this.session.id, this.toChat("assistant", answer));
  }

  /* --------------------------- tool execution -------------------------- */

  private async executeTool(call: ProviderToolCall, log: { info(m: string, d?: unknown): void }): Promise<ToolResult> {
    const tool = this.opts.registry.get(call.name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${call.name}` };
    }
    const allowed = modeAllowedCategories(this.session.mode);
    if (allowed && !allowed.includes(tool.category)) {
      return { ok: false, error: `Tool ${call.name} (${tool.category}) is not allowed in ${this.session.mode} mode` };
    }
    const ctx: ToolContext = {
      cwd: this.opts.cwd,
      sessionId: this.session.id,
      mode: this.session.mode,
      memory: this.opts.memory,
      environment: process.env as Record<string, string>,
      log: this.opts.logger,
      emit: (ev: AgentEvent) => this.emit(ev),
      ask: async (prompt, options) => this.opts.askUser?.(prompt, options) ?? null,
      runSubAgent: (request, index, total) =>
        runSubAgent(
          {
            provider: this.opts.provider,
            registry: this.opts.registry,
            memory: this.opts.memory,
            config: this.opts.config,
            cwd: this.opts.cwd,
            sessionId: this.session.id,
            events: this.opts.events,
            logger: this.opts.logger,
          },
          request,
          index,
          total,
        ),
    };
    // Capability for auto-learned macro tools: run another registered tool
    // through the same policy + consent pipeline (no permission bypass), and
    // apply the same mode/category gating as a direct call would get.
    // NOTE: must be assigned BEFORE withPolicy below — withPolicy spreads ctx,
    // so a runTool assigned afterwards would never reach the tool's run().
    ctx.runTool = (name, args) => {
      const inner = this.opts.registry.get(name);
      if (!inner) return Promise.resolve({ ok: false, error: `Unknown tool: ${name}` });
      const allowed = modeAllowedCategories(this.session.mode);
      if (allowed && !allowed.includes(inner.category)) {
        return Promise.resolve({ ok: false, error: `Tool ${name} (${inner.category}) is not allowed in ${this.session.mode} mode` });
      }
      return this.opts.registry.execute(name, args as Record<string, unknown>, withPolicy, { consent: this.opts.consent });
    };

    const withPolicy = ToolRegistry.withPolicy(ctx, this.opts.config.permissions, this.opts.config.permissionMode);
    this.emit({ type: "thinking", step: `Running ${call.name}…`, sessionId: this.session.id });
    await this.hooks.runBeforeTool(call.name, call.arguments);
    return this.opts.registry.execute(call.name, call.arguments, withPolicy, { consent: this.opts.consent });
  }

  /* ----------------------------- context ------------------------------- */

  private async sanitizedHistory(): Promise<ChatMessage[]> {
    const raw = await this.opts.memory.getMessages(this.session.id);
    const out: ChatMessage[] = [];
    const last = raw.length - 1;
    for (let i = 0; i < raw.length; i++) {
      const msg = raw[i]!;
      if (msg.role === "tool") continue; // tool outputs aren't reshown to the model
      if (msg.role === "assistant" && i < last && raw[i + 1]!.role === "tool") continue; // tool-call preamble
      if (msg.role === "assistant" && !msg.content.trim()) continue;
      out.push(msg);
    }
    return out;
  }

  private async buildSnapshot(): Promise<{ cwd: string; packageName?: string; gitBranch?: string; projectMemory?: string }> {
    let packageName: string | undefined;
    try {
      const { readFileSync } = await import("node:fs");
      const pkg = JSON.parse(readFileSync(path.join(this.opts.cwd, "package.json"), "utf8")) as { name?: string };
      packageName = pkg.name;
    } catch { /* not a node project */ }
    let gitBranch: string | undefined;
    try {
      gitBranch = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", { cwd: this.opts.cwd }).toString().trim();
    } catch { /* not a git repo */ }
    let projectMemory: string | undefined;
    try {
      const { readFileSync } = await import("node:fs");
      const file = path.join(this.opts.cwd, this.opts.config.projectMemoryFile);
      const raw = readFileSync(file, "utf8");
      if (raw.trim()) projectMemory = raw.slice(0, 8000);
    } catch { /* no project memory file */ }
    return { cwd: this.opts.cwd, packageName, gitBranch, projectMemory };
  }

  private toolSchemas(): unknown[] {
    return this.opts.registry.toOpenAISchemas((tool) => {
      const allowed = modeAllowedCategories(this.session.mode);
      return allowed ? allowed.includes(tool.category) : true;
    });
  }

  /* ----------------------------- plumbing ------------------------------ */

  private emit(ev: Omit<AgentEvent, "timestamp">): void {
    this.opts.events.emitEvent({ ...ev, timestamp: Date.now() });
  }

  private toChat(role: ChatMessage["role"], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
    return { id: newMessageId(), role, content, createdAt: Date.now(), ...extra };
  }

  private toProvider(msg: ChatMessage): ProviderMessage {
    return { role: msg.role as ProviderMessage["role"], content: msg.content, name: msg.toolName, toolCallId: msg.toolCallId };
  }

  private appendAssistant(messages: ProviderMessage[], decision: CompletedAssistantMessage): ProviderMessage[] {
    return [...messages, { role: "assistant", content: decision.content || "…" }];
  }

  private async persistSession(): Promise<void> {
    this.session.messageCount = (await this.opts.memory.getMessages(this.session.id)).length;
    await this.opts.sessionStore?.upsert({
      id: this.session.id,
      title: this.session.title,
      cwd: this.session.cwd,
      projectPath: this.session.projectPath,
      model: this.session.model,
      mode: this.session.mode,
      status: this.session.status,
      startedAt: this.session.startedAt,
      updatedAt: Date.now(),
      messageCount: this.session.messageCount,
      tokenCount: this.session.tokenCount,
      metadata: this.session.metadata,
    });
  }

  /**
   * Auto-compact: fold the old message history into a condensed summary once
   * the session exceeds compactThresholdTokens. Keeps long sessions efficient
   * while preserving the through-line for the model.
   */
  private async maybeCompact(): Promise<boolean> {
    const threshold = this.opts.config.compactThresholdTokens;
    if (!threshold || threshold <= 0) return false;
    const history = await this.opts.memory.getMessages(this.session.id);
    if (history.length <= 8) return false;
    const total = history.reduce((sum, m) => sum + this.opts.provider.countTokens(m.content), 0);
    if (total < threshold) return false;
    await this.compact();
    return true;
  }

  /**
   * Manual compaction (invoked by /compact or `dikabuff run --compact`):
   * collapses everything except the newest turns into a short recap message
   * and clears the old raw messages from the session log.
   */
  async compact(): Promise<void> {
    const history = await this.opts.memory.getMessages(this.session.id);
    if (history.length <= 6) return;
    const KEEP = 6; // keep the newest turns verbatim
    const older = history.slice(0, Math.max(0, history.length - KEEP));
    const newest = history.slice(-KEEP);

    const recap = buildRecap(older);
    const recapMsg = this.toChat("assistant", `_Earlier conversation compacted — ${recap}_`);

    // Rewrite the log: recap + newest turns.
    await this.opts.memory.clearSession(this.session.id);
    for (const msg of [recapMsg, ...newest]) {
      await this.opts.memory.appendMessage(this.session.id, msg);
    }
    this.session.metadata = { ...(this.session.metadata ?? {}), compactedAt: Date.now() };
    await this.persistSession();
    this.emit({ type: "thinking", step: `Compacted ${older.length} old message(s) into a recap.`, sessionId: this.session.id });
  }

  private async summarize(): Promise<string> {
    return "\n\n### Summary\nI ran into the agent turn limit. Re-run with a more focused request for better results.";
  }
}

/** Build a compact recap line from the dropped messages (dependency-free). */
function buildRecap(messages: Array<{ role: string; content: string; toolName?: string }>): string {
  const parts: string[] = [];
  let userCount = 0;
  let toolCount = 0;
  for (const m of messages) {
    if (m.role === "user") {
      userCount++;
      parts.push(`user asked: ${truncate(m.content.replace(/\s+/g, " "), 90)}`);
    } else if (m.role === "assistant" && m.content && !m.content.startsWith("_Earlier")) {
      parts.push(`agent answered: ${truncate(m.content.replace(/\s+/g, " "), 90)}`);
    } else if (m.role === "tool") {
      toolCount++;
    }
  }
  if (toolCount > 0) parts.push(`${toolCount} tool call(s) were executed and resolved`);
  const body = parts.slice(-12).join(" | ");
  return body || "earlier messages were removed";
}

/** Serialize a tool result for the model (JSON data preferred, truncated). */
export function toolResultToContent(result: ToolResult): string {
  if (result.data !== undefined) {
    const json = JSON.stringify(result.data);
    if (json && json.length <= 6000) return json;
  }
  const text = result.output ?? result.error ?? "ok";
  return text.length > 6000 ? text.slice(0, 6000) + "\n…(truncated)" : text;
}

function truncate(text: string, n: number): string {
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}