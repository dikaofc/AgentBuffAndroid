import type {
  AgentEvent,
  DikaConfig,
  LoggerLike,
  MemoryGateway,
  SubAgentRequest,
  SubAgentResult,
  ToolContext,
} from "@dikabuff/shared";
import type { AgentEvents } from "./events";
import type { LLMProvider, ProviderMessage } from "./providers";
import type { ToolRegistry } from "@dikabuff/tools";

/**
 * Sub-agent runner.
 *
 * A sub-agent is a focused, READ-ONLY research loop that shares the host
 * provider but only ever touches the codebase through a curated set of safe
 * tools (read/search/scan/git). It never writes files, never runs shell
 * commands, and never asks for consent — the tool whitelist makes it safe
 * by construction.
 *
 * Fan-out: the `subagent` tool calls `runSubAgent` for each task and runs the
 * promises concurrently (Promise.allSettled) — so N independent research
 * questions complete in roughly the time of the slowest one.
 *
 * Progress is surfaced through `meta` events tagged `meta.subagent` so the UI
 * can render a live per-task panel without polluting the chat stream.
 */
export interface SubAgentOptions {
  provider: LLMProvider;
  registry: ToolRegistry;
  memory: MemoryGateway;
  config: DikaConfig;
  cwd: string;
  sessionId: string;
  events: AgentEvents;
  logger: LoggerLike;
  /** Per-sub-agent cap on reasoning/tool turns. */
  maxTurns?: number;
  /** Per-call provider timeout in ms. */
  timeoutMs?: number;
}

/** Tools sub-agents are allowed to use. Read-only by construction. */
export const SUBAGENT_TOOLS = new Set([
  "read_file",
  "search_files",
  "project_scan",
  "code_summary",
  "dependency_analysis",
  "git_status",
  "git_diff",
]);

const SUBAGENT_SYSTEM = `You are a focused research sub-agent of DikaBuff Agent CLI.

Your job: investigate ONE delegated question and report concise, factual findings.
You operate inside a real project directory.

RULES
- You may ONLY use these read-only tools: read_file, search_files, project_scan,
  code_summary, dependency_analysis, git_status, git_diff.
- NEVER write, edit, or delete files. NEVER run shell commands.
- Inspect the codebase before answering. Cite file paths and line numbers.
- Answer in the same language as the task.
- Be concise: a short structured report (bullets), no filler.`;

export async function runSubAgent(opts: SubAgentOptions, request: SubAgentRequest, index: number, total: number): Promise<SubAgentResult> {
  const startedAt = Date.now();
  const label = request.label ?? truncate(request.prompt, 40);
  const maxTurns = opts.maxTurns ?? 4;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const emit = (status: "running" | "tool" | "done" | "error", detail?: string): void => {
    opts.events.emitEvent({
      type: "meta",
      timestamp: Date.now(),
      sessionId: opts.sessionId,
      meta: { subagent: { index, total, label, status, detail } },
    });
  };

  emit("running");

  let messages: ProviderMessage[] = [
    { role: "system", content: SUBAGENT_SYSTEM },
    { role: "user", content: request.prompt },
  ];
  let turns = 0;
  let toolCalls = 0;

  const schemas = opts.registry.toOpenAISchemas((t) => SUBAGENT_TOOLS.has(t.name));

  try {
    while (turns < maxTurns) {
      turns++;
      // Timeout-aware: reject past timeoutMs AND abort the underlying fetch so
      // a stuck provider call can't hold resources until its own 180s timer.
      const decision = await withAbortTimeout(opts.provider.completeWithTools(messages, schemas), timeoutMs);
      if (decision.toolCalls.length === 0) {
        const answer = decision.content || "(no answer produced)";
        emit("done");
        return { ok: true, output: answer, turns, toolCalls, durationMs: Date.now() - startedAt };
      }
      messages = [...messages, { role: "assistant", content: decision.content || "…" }];
      for (const call of decision.toolCalls) {
        toolCalls++;
        emit("tool", call.name);
        const ctx = subAgentContext(opts, emit);
        const result = await opts.registry.execute(call.name, call.arguments, ctx, { force: true });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: toolResultText(result),
        });
      }
    }
    // Turn cap hit: ask for a final summary.
    const decision = await withAbortTimeout(
      opts.provider.completeWithTools([...messages, { role: "user", content: "Wrap up now: give your final concise findings." }], []),
      timeoutMs,
    );
    const answer = decision.content || "(sub-agent hit the turn cap without a summary)";
    emit("done");
    return { ok: true, output: answer, turns, toolCalls, durationMs: Date.now() - startedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit("error", message);
    return { ok: false, output: "", error: message, turns, toolCalls, durationMs: Date.now() - startedAt };
  }
}

/** Build a minimal read-only tool context for a sub-agent execution. */
function subAgentContext(opts: SubAgentOptions, emit: (status: "running" | "tool" | "done" | "error", detail?: string) => void): ToolContext {
  return {
    cwd: opts.cwd,
    sessionId: opts.sessionId,
    mode: "research",
    memory: opts.memory,
    environment: {},
    log: opts.logger,
    emit: (ev: AgentEvent) => {
      // Surface tool activity through the sub-agent progress channel only.
      if (ev.type === "tool:start" && ev.toolName) emit("tool", ev.toolName);
    },
    ask: async () => null,
  };
}

/** Serialize a tool result for the sub-agent's model context. */
function toolResultText(result: { ok: boolean; output?: string; error?: string; data?: unknown }): string {
  if (result.data !== undefined) {
    const json = JSON.stringify(result.data);
    if (json && json.length <= 4000) return json;
  }
  const text = result.output ?? result.error ?? "ok";
  return text.length > 4000 ? text.slice(0, 4000) + "\n…(truncated)" : text;
}

/**
 * Reject past `ms`. The provider call keeps running in the background until
 * its own internal timeout (180s) — bounded, so a delegated research task can
 * never hang the fan-out past the sub-agent budget.
 */
function withAbortTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error(`sub-agent timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function truncate(text: string, n: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}
