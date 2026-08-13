import { Command } from "commander";
import { CLI_NAME, PRODUCT_NAME, VERSION } from "@dikabuff/shared";
import type { CliContext } from "./context";
import { chatCommand } from "./commands/chat";
import { runCommand } from "./commands/run";
import { analyzeCommand } from "./commands/analyze";
import { reviewCommand } from "./commands/review";
import { fixCommand } from "./commands/fix";
import { initCommand } from "./commands/init";
import { memoryCommand } from "./commands/memory";
import { pluginCommand } from "./commands/plugin";
import { configCommand } from "./commands/config";
import { updateCommand } from "./commands/update";
import { doctorCommand } from "./commands/doctor";
import { learnCommand } from "./commands/learn";
import { BANNER, paint } from "@dikabuff/shared";

/** Build the full commander program for the CLI context. */
export function buildProgram(ctx: CliContext): Command {
  const program = new Command();
  program
    .name(CLI_NAME)
    .description(`${PRODUCT_NAME} Agent CLI — AI coding intelligence in your terminal`)
    .version(VERSION)
    .option("-v, --verbose", "verbose logging", false)
    .option("-d, --debug", "debug mode (trace + verbose logs)", false)
    .option("--home <dir>", "override config home (~/.dikabuff)")
    .addHelpText("before", paint(BANNER, "cyan"))
    .hook("preAction", (_thisCommand, actionCommand) => {
      const opts = actionCommand.opts<{ verbose?: boolean; debug?: boolean }>();
      if (opts.debug || opts.verbose) {
        process.env.DIKABUFF_DEBUG = "1";
      }
    });

  program.action(async () => { await ctx.launchInteractive(); });

  program
    .command("init")
    .description("Initialize ~/.dikabuff config, memory, sessions, plugins directories")
    .action(async () => { await initCommand(ctx); });

  program
    .command("chat [message]")
    .description("Start an interactive agent session (or one-shot with a message)")
    .option("-y, --yes", "auto-approve tool permissions")
    .option("-p, --print", "print mode: run and print the final answer (non-interactive)")
    .option("--output-format <format>", "output format: text|json (default text)", "text")
    .option("--permission-mode <mode>", "permission mode: default|acceptEdits|plan|bypassPermissions")
    .action(async (message: string | undefined, opts: { yes?: boolean; print?: boolean; outputFormat?: string; permissionMode?: string }) => {
      await chatCommand(ctx, { message, yes: opts.yes, print: opts.print, outputFormat: opts.outputFormat as "text" | "json", permissionMode: opts.permissionMode });
    });

  program
    .command("run <prompt>")
    .description("One-shot agent run (headless), prints the final answer")
    .option("-y, --yes", "auto-approve tool permissions")
    .option("-p, --print", "print mode: plain answer only (no progress header)")
    .option("--output-format <format>", "output format: text|json (default text)", "text")
    .option("--permission-mode <mode>", "permission mode: default|acceptEdits|plan|bypassPermissions")
    .action(async (prompt: string, opts: { yes?: boolean; print?: boolean; outputFormat?: string; permissionMode?: string }) => {
      await runCommand(ctx, { prompt, yes: opts.yes, print: opts.print, outputFormat: opts.outputFormat as "text" | "json", permissionMode: opts.permissionMode });
    });

  program
    .command("analyze [prompt]")
    .description("Project analysis report (optionally with an agent follow-up prompt)")
    .action(async (prompt?: string) => { await analyzeCommand(ctx, { prompt }); });

  program
    .command("review")
    .description("Agent code review of the current git working tree")
    .option("-y, --yes", "auto-approve tool permissions")
    .option("--permission-mode <mode>", "permission mode: default|acceptEdits|plan|bypassPermissions")
    .action(async (opts: { yes?: boolean; permissionMode?: string }) => { await reviewCommand(ctx, { yes: opts.yes, permissionMode: opts.permissionMode }); });

  program
    .command("fix [target]")
    .description("Investigate and fix failures (target: tests|lint)")
    .option("-y, --yes", "auto-approve tool permissions")
    .option("--permission-mode <mode>", "permission mode: default|acceptEdits|plan|bypassPermissions")
    .action(async (target: string | undefined, opts: { yes?: boolean; permissionMode?: string }) => { await fixCommand(ctx, { yes: opts.yes, target, permissionMode: opts.permissionMode }); });

  program
    .command("memory <action> [key...]")
    .description("Long-term memory: list | remember <key> <value> | forget <key> | notes")
    .action(async (action: string, key: string[]) => { await memoryCommand(ctx, { action: [action, ...key].join(" ") }); });

  program
    .command("plugin <action> [name]")
    .description("Plugin management: list | search <q> | install <name> | remove <name> | verify <name>")
    .action(async (action: string, name?: string) => { await pluginCommand(ctx, { action, name }); });

  program
    .command("config <action> [key] [value]")
    .description("Configuration: get | set <key> <value> | theme <name> | list | models")
    .action(async (action: string, key?: string, value?: string) => { await configCommand(ctx, { action, key, value }); });

  program
    .command("update")
    .description("Check for and apply updates")
    .option("-c, --check", "check only")
    .option("--channel <channel>", "stable|beta", undefined)
    .action(async (opts: { channel?: string }) => { await updateCommand(ctx, { channel: opts.channel }); });

  program
    .command("doctor")
    .description("Diagnose configuration, memory, provider connectivity")
    .action(async () => { await doctorCommand(ctx); });

  program
    .command("learn")
    .description("Auto-learning status: episodes, patterns, learned tools (auto-created on every start)")
    .action(async () => { await learnCommand(ctx); });

  return program;
}