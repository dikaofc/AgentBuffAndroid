import type { CliContext } from "../context";
import { logMuted } from "../output";
import { runCommand } from "./run";

export interface ChatCommandOptions {
  message?: string;
  yes?: boolean;
  /** Print mode: run and print the final answer (non-interactive). */
  print?: boolean;
  outputFormat?: "text" | "json";
  permissionMode?: string;
}

/**
 * `dikabuff chat [message]` — interactive terminal app, or one-shot when a
 * message is provided on the command line. `-p` forces print mode (plain
 * answer to stdout), perfect for piping into scripts.
 */
export async function chatCommand(ctx: CliContext, opts: ChatCommandOptions): Promise<number> {
  if (opts.print || opts.outputFormat === "json") {
    if (!opts.message) {
      process.stderr.write("error: a message is required with -p/--print or --output-format json\n");
      return 1;
    }
    return runCommand(ctx, {
      prompt: opts.message,
      yes: opts.yes,
      print: opts.print,
      outputFormat: opts.outputFormat,
      permissionMode: opts.permissionMode,
    });
  }
  if (opts.message) {
    return runCommand(ctx, {
      prompt: opts.message,
      yes: opts.yes,
      print: true,
      outputFormat: undefined,
      permissionMode: opts.permissionMode,
    });
  }
  logMuted("(interactive mode)");
  return ctx.launchInteractive();
}
