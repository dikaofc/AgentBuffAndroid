import type { AgentMode, PermissionRequest, PermissionPolicy } from "@dikabuff/shared";
import { Agent, AgentEvents } from "@dikabuff/agent-core";
import type { CliContext, AgentRunOptions } from "./context";

/** Build a consent resolver for non-interactive runs. */
export function makePolicyConsent(getPolicy: () => Record<string, PermissionPolicy>, opts: { yes?: boolean }): (req: PermissionRequest) => Promise<boolean> {
  return async (req) => {
    if (opts.yes) return true;
    const perTool = getPolicy()[req.toolName];
    if (perTool === "allow") return true;
    if (perTool === "deny") return false;
    // ask defaults to deny in headless mode
    return false;
  };
}

export interface AgentTurnResult {
  answer: string;
  sessionId: string;
  turns: number;
  toolCalls: number;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  compacted: boolean;
  durationMs: number;
}

export async function runAgentTurn(
  ctx: CliContext,
  opts: AgentRunOptions & { onDelta?: (d: string) => void },
): Promise<AgentTurnResult> {
  const events = new AgentEvents();
  // Feed every headless run into the learner (episodes → patterns → tools).
  ctx.learner?.attach(events);
  const provider = ctx.getProvider();
  const mode = (opts.mode ?? ctx.config.get().mode) as AgentMode;
  ctx.config.setByPath("mode", mode);
  if (opts.permissionMode) ctx.config.setByPath("permissionMode", opts.permissionMode);

  const policyFn = (): Record<string, PermissionPolicy> => ctx.config.get().permissions.tools;
  const preset = ctx.presets.find((p) => p.id === ctx.config.get().model);
  const agent = new Agent(
    {
      provider,
      registry: ctx.registry,
      memory: ctx.memory,
      config: ctx.config.get(),
      cwd: ctx.cwd,
      events,
      logger: {
        debug: () => {},
        info: (m) => ctx.logger.info(m),
        warn: (m) => ctx.logger.info(m),
        error: (m) => ctx.logger.error(m),
      },
      consent: makePolicyConsent(policyFn, { yes: opts.yes }),
      sessionStore: ctx.memory.sessions,
      askUser: async () => null,
      streamMode: opts.headless ? ("replay" as const) : ("regenerate" as const),
      modelCost: preset ? { costPer1MInput: preset.costPer1MInput, costPer1MOutput: preset.costPer1MOutput } : undefined,
      onDelta: opts.onDelta,
    },
    undefined,
  );

  const result = await agent.run(opts.prompt);
  return {
    answer: result.answer,
    sessionId: result.sessionId,
    turns: result.turns,
    toolCalls: result.toolCalls,
    tokensUsed: result.tokensUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    compacted: result.compacted,
    durationMs: result.durationMs,
  };
}