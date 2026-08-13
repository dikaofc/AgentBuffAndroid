import { exec, spawn } from "node:child_process";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import type { ToolContext, ToolDefinition, ToolResult } from "@dikabuff/shared";
import { CommandArgs, InstallArgs } from "../schema";

export interface RunCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

/** Run a shell command, capturing stdout/stderr/exit code. Never throws. */
export function runCommand(command: string, opts: RunCommandOptions = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: opts.maxBuffer ?? 10 * 1024 * 1024,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: error && typeof (error as any).code === "number" ? (error as any).code : error ? 1 : 0,
        });
      },
    );
  });
}

/* ---------------------------- execute_command ------------------------- */

const executeCommand: ToolDefinition<z.infer<typeof CommandArgs>> = {
  name: "execute_command",
  description: "Run a shell command in the project directory. Returns combined output.",
  schema: {
    type: "object",
    properties: { command: { type: "string" }, timeoutMs: { type: "number" }, cwd: { type: "string" }, background: { type: "boolean" } },
    required: ["command"],
  },
  permission: "dangerous",
  category: "terminal",
  validateSchema: CommandArgs,
  async run(args, ctx) {
    const cwd = args.cwd ? (path.isAbsolute(args.cwd) ? args.cwd : path.resolve(ctx.cwd, args.cwd)) : ctx.cwd;
    if (args.background) {
      const child = spawn(args.command, { cwd, shell: true, stdio: "ignore", detached: true });
      child.unref();
      return {
        ok: true,
        output: `Started background process (pid ${child.pid ?? "?"}): ${args.command}`,
        meta: { pid: child.pid, background: true },
      };
    }
    const started = Date.now();
    const { stdout, stderr, code } = await runCommand(args.command, { cwd, timeoutMs: args.timeoutMs });
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(0, 60_000);
    ctx.emit({
      type: "meta",
      timestamp: Date.now(),
      meta: { command: args.command, exitCode: code, durationMs: Date.now() - started },
      sessionId: ctx.sessionId,
    });
    if (code !== 0) {
      return {
        ok: false,
        error: combined.slice(0, 4000) || `Command exited with code ${code}`,
        meta: { exitCode: code, command: args.command },
      };
    }
    return { ok: true, output: combined || `Command completed (exit 0)`, meta: { exitCode: 0, command: args.command } };
  },
};

/* ---------------------------- install_package ------------------------- */

const installPackage: ToolDefinition<z.infer<typeof InstallArgs>> = {
  name: "install_package",
  description: "Install packages with the project's package manager.",
  schema: {
    type: "object",
    properties: { manager: { type: "string", enum: ["npm", "pnpm", "yarn", "bun", "pip", "pip3", "go"] }, packages: { type: "array", items: { type: "string" } }, dev: { type: "boolean" } },
    required: ["manager", "packages"],
  },
  permission: "dangerous",
  category: "terminal",
  validateSchema: InstallArgs,
  async run(args, ctx) {
    const pkgs = args.packages.join(" ");
    const flag = args.dev ? (args.manager === "npm" || args.manager === "pnpm" ? "-D" : args.manager === "yarn" || args.manager === "bun" ? "--dev" : "") : "";
    const prefixes: Record<string, string> = {
      npm: "npm install", pnpm: "pnpm add", yarn: "yarn add", bun: "bun add",
      pip: "pip install", pip3: "pip3 install", go: "go get",
    };
    const base = prefixes[args.manager];
    if (!base) return { ok: false, error: `Unsupported manager ${args.manager}` };
    const command = `${base} ${flag} ${pkgs}`.trim();
    const { stdout, stderr, code } = await runCommand(command, { cwd: ctx.cwd, timeoutMs: 180_000 });
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(0, 20_000);
    if (code !== 0) return { ok: false, error: combined.slice(0, 4000) || `Install failed (exit ${code})`, meta: { command } };
    return { ok: true, output: combined || `Installed ${args.packages.join(", ")}`, meta: { command } };
  },
};

/* -------------------------------- helpers ----------------------------- */

export function detectPackageManager(cwd: string): string {
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(cwd, "bun.lockb")) || existsSync(path.join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

export function scriptFromPackageJson(cwd: string, script: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    return pkg.scripts?.[script];
  } catch {
    return undefined;
  }
}

export const TERMINAL_TOOLS: ToolDefinition[] = [executeCommand, installPackage] as unknown as ToolDefinition[];