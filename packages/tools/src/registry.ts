import type {
  AgentEvent,
  PermissionMode,
  PermissionRequest,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "@dikabuff/shared";
import { newId } from "@dikabuff/shared";
import { applyPermissionMode, describeTool, resolvePolicy } from "./permission";
import { parseArgs } from "./schema";
import type { PermissionPolicy, ToolPolicy } from "@dikabuff/shared";

export interface ExecuteOptions {
  /** Called when a tool needs consent. Return true to allow. */
  consent?: (request: PermissionRequest) => Promise<boolean>;
  /** Ignore permission policy entirely (used by `dikabuff run --force`). */
  force?: boolean;
}

export class ToolError extends Error {
  constructor(
    message: string,
    readonly toolName: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(category?: string): ToolDefinition[] {
    const all = [...this.tools.values()];
    return category ? all.filter((t) => t.category === category) : all;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Schemas for the model (hidden tools excluded). */
  toOpenAISchemas(filter?: (tool: ToolDefinition) => boolean): unknown[] {
    return this.list()
      .filter((t) => !t.hidden)
      .filter((t) => (filter ? filter(t) : true))
      .map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.schema },
      }));
  }

  /**
   * Validate + authorize + execute a tool call.
   * Emits tool:start / tool:done / tool:error events for the UI pipeline.
   */
  async execute(name: string, rawArgs: unknown, ctx: ToolContext, opts: ExecuteOptions = {}): Promise<ToolResult> {
    const start = Date.now();
    const emit = (event: Omit<AgentEvent, "timestamp">) => ctx.emit({ ...event, timestamp: Date.now() });

    const tool = this.tools.get(name);
    if (!tool) {
      const result: ToolResult = { ok: false, error: `Unknown tool: ${name}` };
      emit({ type: "tool:error", toolName: name, result });
      return result;
    }

    const args = (rawArgs ?? {}) as Record<string, unknown>;
    emit({ type: "tool:start", step: `Running ${name}…`, toolName: name, toolArgs: args, sessionId: ctx.sessionId });

    if (!opts.force) {
      const allowed = await this.authorize(tool, args, ctx, opts);
      if (!allowed) {
        const result: ToolResult = { ok: false, error: `Permission denied for ${name}` };
        emit({ type: "tool:error", toolName: name, result, sessionId: ctx.sessionId });
        return result;
      }
    }

    try {
      const schema = tool.validateSchema;
      if (schema) {
        await parseArgs(schema as any, rawArgs);
      }
      if (tool.validate) {
        const customError = tool.validate(args as never);
        if (customError) throw new ToolError(customError, name);
      }
      ctx.log.debug(`tool:${name}`, args);
      const result = await tool.run(args as never, ctx);
      const outcome = { ...result, meta: { ...(result.meta ?? {}), durationMs: Date.now() - start } };
      emit({ type: result.ok ? "tool:done" : "tool:error", toolName: name, result: outcome, sessionId: ctx.sessionId });
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result: ToolResult = { ok: false, error: message, meta: { durationMs: Date.now() - start } };
      emit({ type: "tool:error", toolName: name, result, sessionId: ctx.sessionId });
      ctx.log.error(`tool:${name} failed`, err);
      return result;
    }
  }

  private async authorize(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    ctx: ToolContext,
    opts: ExecuteOptions,
  ): Promise<boolean> {
    const policy: ToolPolicy = (ctx as any)._policy ?? { categories: {}, tools: {}, autoApprove: [] };
    const mode: PermissionMode = (ctx as any)._permissionMode ?? "default";
    const resolved = applyPermissionMode(mode, tool, resolvePolicy(tool, policy));
    if (resolved === "allow") return true;
    if (resolved === "deny") return false;

    const request: PermissionRequest = {
      id: newId("perm"),
      toolName: tool.name,
      args,
      permission: tool.permission,
      description: describeTool(tool, args),
      cwd: ctx.cwd,
    };
    ctx.emit({ type: "permission:request", timestamp: Date.now(), permission: request, sessionId: ctx.sessionId });

    let granted: boolean;
    if (opts.consent) {
      granted = await opts.consent(request);
    } else if (ctx.ask) {
      const answer = await ctx.ask(
        `Allow ${tool.name}? ${tool.permission} tool — ${request.description}\n  [y] yes  [n] no  [v] view args`,
        { timeoutMs: 120_000 },
      );
      granted = answer !== null && /^(y|yes|v|view|a|allow)$/i.test(answer.trim());
    } else {
      granted = false;
    }
    ctx.emit({ type: "permission:response", timestamp: Date.now(), permission: request, granted, sessionId: ctx.sessionId });
    return granted;
  }

  /** Attach the config policy + permission mode to a tool context before executing. */
  static withPolicy(ctx: ToolContext, policy: ToolPolicy, mode?: PermissionMode): ToolContext {
    return { ...ctx, _policy: policy, _permissionMode: mode } as ToolContext & { _policy: ToolPolicy; _permissionMode?: PermissionMode };
  }
}

export type { PermissionPolicy };