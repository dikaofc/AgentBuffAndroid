import type { CliContext } from "../context";
import { logInfo, logMuted, logOk, logSection } from "../output";
import { runAgentTurn } from "../agent-run";

export interface RunCommandOptions {
  prompt: string;
  yes?: boolean;
  /** Print mode: plain final answer only, no progress chrome. */
  print?: boolean;
  /** Machine-readable output. */
  outputFormat?: "text" | "json";
  permissionMode?: string;
}

/** `dikabuff run "<prompt>"` — one-shot headless agent run with live progress. */
export async function runCommand(ctx: CliContext, opts: RunCommandOptions): Promise<number> {
  const json = opts.outputFormat === "json";
  if (!opts.print && !json) logSection("DikaBuff run");

  let last = "";
  const result = await runAgentTurn(ctx, {
    prompt: opts.prompt,
    yes: opts.yes,
    headless: true,
    permissionMode: opts.permissionMode,
    onDelta: (d) => {
      if (opts.print || json) return; // print mode: no progress stream
      last += d;
      if (d.includes("\n")) {
        logInfo(last.trimEnd());
        last = "";
      }
    },
  });

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          answer: result.answer,
          sessionId: result.sessionId,
          turns: result.turns,
          toolCalls: result.toolCalls,
          tokens: { input: result.inputTokens, output: result.outputTokens, total: result.tokensUsed },
          costUsd: result.costUsd,
          compacted: result.compacted,
          durationMs: result.durationMs,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  if (opts.print) {
    // print mode: the answer is the entire output (pipe-friendly).
    process.stdout.write((result.answer.endsWith("\n") ? result.answer : result.answer + "\n"));
    return 0;
  }

  if (last.trim()) logInfo(last.trimEnd());
  logOk(`done in ${result.turns} turn(s), ${result.toolCalls} tool call(s)`);
  logMuted(`answer: ${result.answer.slice(0, 200)}${result.answer.length > 200 ? "…" : ""}`);
  return 0;
}
