import { z } from "zod";
import type { ToolContext, ToolDefinition } from "@dikabuff/shared";
import { GitDiffArgs, LintArgs, RunTestsArgs } from "../schema";
import { detectPackageManager, runCommand, scriptFromPackageJson } from "./terminal";

/** git_status — branch + porcelain status. */
const gitStatus: ToolDefinition = {
  name: "git_status",
  description: "Show git branch and working tree status (porcelain).",
  schema: { type: "object", properties: {} },
  permission: "safe",
  category: "development",
  async run(_args, ctx) {
    return wrapGit(ctx, ["status", "--porcelain=v1", "-b", "--untracked-files=all"], "no changes");
  },
};

/** git_diff — unified diff (optionally staged, optionally just stats). */
const gitDiff: ToolDefinition<z.infer<typeof GitDiffArgs>> = {
  name: "git_diff",
  description: "Show the git diff of the working tree (or staged). Use stat:true for a summary.",
  schema: {
    type: "object",
    properties: { path: { type: "string" }, staged: { type: "boolean" }, stat: { type: "boolean" } },
  },
  permission: "safe",
  category: "development",
  validateSchema: GitDiffArgs,
  async run(args, ctx) {
    const base = ["diff"];
    if (args.staged) base.push("--cached");
    if (args.stat) base.push("--stat");
    if (args.path) base.push("--", args.path);
    return wrapGit(ctx, base, "no diff");
  },
};

/** run_tests — execute the project's test script. */
const runTests: ToolDefinition<z.infer<typeof RunTestsArgs>> = {
  name: "run_tests",
  description: "Run the project test suite (default: package.json scripts.test).",
  schema: { type: "object", properties: { command: { type: "string" }, path: { type: "string" } } },
  permission: "standard",
  category: "development",
  validateSchema: RunTestsArgs,
  async run(args, ctx) {
    const cwd = args.path ? (await abs(ctx, args.path)) : ctx.cwd;
    const found = scriptFromPackageJson(cwd, "test");
    const command = args.command ?? (found ? detectPackageManager(cwd) + " test" : undefined);
    if (!command) return { ok: false, error: "No test script found in package.json — pass command explicitly" };
    ctx.emit({ type: "thinking", timestamp: Date.now(), step: `Running tests: ${command}`, sessionId: ctx.sessionId });
    const { stdout, stderr, code } = await runCommand(command, { cwd, timeoutMs: 300_000 });
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(0, 40_000);
    const passPattern = /passing|passed|ok\b|success/im;
    const failPattern = /failing|failed|error/im;
    if (code !== 0 || failPattern.test(combined)) {
      return { ok: false, error: combined.slice(0, 6000) || "Tests failed", meta: { command, exitCode: code } };
    }
    return { ok: true, output: combined || "Tests passed", meta: { command, exitCode: 0, passed: passPattern.test(combined) } };
  },
};

/** lint — run the project linter. */
const lint: ToolDefinition<z.infer<typeof LintArgs>> = {
  name: "lint",
  description: "Run the project linter (default: package.json scripts.lint).",
  schema: { type: "object", properties: { command: { type: "string" }, path: { type: "string" } } },
  permission: "standard",
  category: "development",
  validateSchema: LintArgs,
  async run(args, ctx) {
    const cwd = args.path ? (await abs(ctx, args.path)) : ctx.cwd;
    const found = scriptFromPackageJson(cwd, "lint");
    const command = args.command ?? (found ? detectPackageManager(cwd) + " lint" : undefined);
    if (!command) return { ok: false, error: "No lint script found — pass command explicitly" };
    const { stdout, stderr, code } = await runCommand(command, { cwd, timeoutMs: 180_000 });
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(0, 40_000);
    return {
      ok: code === 0,
      output: combined || "Lint clean",
      error: code !== 0 ? combined.slice(0, 6000) || "Lint failed" : undefined,
      meta: { command, exitCode: code },
    };
  },
};

export const DEVELOPMENT_TOOLS: ToolDefinition[] = [gitStatus, gitDiff, runTests, lint] as unknown as ToolDefinition[];

async function wrapGit(ctx: ToolContext, args: string[], emptyMessage: string): Promise<ReturnType<typeof gitStatus.run>> {
  const { stdout, stderr, code } = await runCommand(`git ${args.join(" ")}`, { cwd: ctx.cwd, timeoutMs: 30_000 });
  return code === 0
    ? { ok: true, output: stdout.trim() || emptyMessage, meta: { git: true } }
    : { ok: false, error: (stderr || stdout).trim() || "git command failed", meta: { git: true } };
}

async function abs(ctx: ToolContext, p: string): Promise<string> {
  const path = await import("node:path");
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(ctx.cwd, p);
}