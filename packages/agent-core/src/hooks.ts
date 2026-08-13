import type { ToolResult } from "@dikabuff/shared";

export interface AgentHooks {
  beforeTurn?: (turn: number, prompt: string) => Promise<void> | void;
  afterTurn?: (turn: number) => Promise<void> | void;
  beforeTool?: (name: string, args: Record<string, unknown>) => Promise<void> | void;
  afterTool?: (name: string, result: ToolResult) => Promise<void> | void;
  onError?: (err: Error) => Promise<void> | void;
}

/** Sequential hook runner. Plugins can register hooks to observe/extend the loop. */
export class HookManager {
  private hooks: AgentHooks[] = [];

  register(hooks: AgentHooks): void {
    this.hooks.push(hooks);
  }

  async runBeforeTurn(turn: number, prompt: string): Promise<void> {
    for (const h of this.hooks) await h.beforeTurn?.(turn, prompt);
  }
  async runAfterTurn(turn: number): Promise<void> {
    for (const h of this.hooks) await h.afterTurn?.(turn);
  }
  async runBeforeTool(name: string, args: Record<string, unknown>): Promise<void> {
    for (const h of this.hooks) await h.beforeTool?.(name, args);
  }
  async runAfterTool(name: string, result: ToolResult): Promise<void> {
    for (const h of this.hooks) await h.afterTool?.(name, result);
  }
  async runOnError(err: Error): Promise<void> {
    for (const h of this.hooks) await h.onError?.(err);
  }
}