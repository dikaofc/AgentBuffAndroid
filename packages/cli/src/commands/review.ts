import { runCommand } from "@dikabuff/tools";
import type { CliContext } from "../context";
import { logFail, logInfo, logMuted, logSection } from "../output";
import { runAgentTurn } from "../agent-run";

/** `dikabuff review` — review the working tree diff with the agent. */
export async function reviewCommand(ctx: CliContext, opts: { yes?: boolean; permissionMode?: string }): Promise<number> {
  const git = await runCommand("git diff --stat", { cwd: ctx.cwd, timeoutMs: 30_000 });
  if (git.code !== 0) {
    logFail("not a git working tree — review needs `git diff`");
    return 1;
  }
  logSection("Code review");
  logInfo(git.stdout.trim() || "no unstaged changes");
  const { answer } = await runAgentTurn(ctx, {
    prompt: "Review the current working tree changes. Report bugs, security concerns, style issues, and missing tests with severity tags.",
    mode: "review",
    yes: opts.yes,
    headless: true,
    permissionMode: opts.permissionMode,
  });
  logInfo(`\n${answer}`);
  return 0;
}