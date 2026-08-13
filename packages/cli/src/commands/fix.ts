import type { CliContext } from "../context";
import { logInfo, logSection } from "../output";
import { runAgentTurn } from "../agent-run";

/** `dikabuff fix` — investigate and fix failures (tests/lint/errors). */
export async function fixCommand(ctx: CliContext, opts: { yes?: boolean; target?: string; permissionMode?: string }): Promise<number> {
  logSection("DikaBuff fix");
  const prompt =
    opts.target === "lint"
      ? "Run the linter, fix all reported issues, and verify the linter passes."
      : "Find and fix the current failures in this project: run tests and/or linter, diagnose root causes, apply minimal fixes, then re-run to verify. Report what you changed.";
  const { answer } = await runAgentTurn(ctx, { prompt, mode: "debug", yes: opts.yes, headless: true, permissionMode: opts.permissionMode });
  logInfo(`\n${answer}`);
  return 0;
}