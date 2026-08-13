import { projectScan } from "@dikabuff/tools";
import type { CliContext } from "../context";
import { logInfo, logMuted, logOk, logSection } from "../output";
import { runAgentTurn } from "../agent-run";
import type { ToolContext } from "@dikabuff/shared";

/** `dikabuff analyze [path]` — project analysis report without LLM. */
export async function analyzeCommand(ctx: CliContext, opts: { prompt?: string }): Promise<number> {
  logSection("Project analysis");
  const toolCtx: ToolContext = {
    cwd: ctx.cwd,
    sessionId: "analyze",
    mode: "research",
    memory: ctx.memory,
    environment: process.env as Record<string, string>,
    log: { debug() {}, info() {}, warn() {}, error() {} },
    emit: () => {},
    ask: async () => null,
  };
  const res = await projectScan.run({ depth: 4 }, toolCtx);
  if (!res.ok) {
    logMuted(`scan failed: ${res.error}`);
    return 1;
  }
  logInfo(res.output ?? "");
  if (opts.prompt) {
    logOk("analysis snapshot prepared — prompting agent");
    const { answer } = await runAgentTurn(ctx, { prompt: opts.prompt, headless: true });
    logInfo(`\n${answer}`);
  }
  return 0;
}