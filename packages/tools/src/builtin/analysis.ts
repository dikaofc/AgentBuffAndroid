import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolContext, ToolDefinition, ToolResult } from "@dikabuff/shared";
import { ProjectScanArgs } from "../schema";
import { runCommand } from "./terminal";
import { walk, SKIP_DIRS } from "./filesystem";

/** Yield to the event loop so the TUI can repaint during long scans (no frozen UI). */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/* ------------------------------ project_scan -------------------------- */

export const projectScan: ToolDefinition<z.infer<typeof ProjectScanArgs>> = {
  name: "project_scan",
  description: "Scan the project: structure, file counts by type, package.json summary, git state.",
  schema: { type: "object", properties: { depth: { type: "number" } } },
  permission: "safe",
  category: "analysis",
  validateSchema: ProjectScanArgs,
  async run(args, ctx): Promise<ToolResult> {
    const depth = args.depth ?? 4;
    const MAX_FILES = 4000; // hard cap: huge monorepos shouldn't stall the agent
    const byExt = new Map<string, number>();
    const topLevel: string[] = [];
    let total = 0;
    let totalBytes = 0;
    let truncated = false;
    const seen = new Set<string>();

    for await (const file of walk(ctx.cwd, { maxDepth: depth })) {
      if (total >= MAX_FILES) {
        truncated = true;
        break;
      }
      total++;
      try {
        const stat = await fs.stat(file);
        totalBytes += stat.size;
      } catch { /* ignore */ }
      const ext = path.extname(file).toLowerCase() || "(none)";
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
      const rel = path.relative(ctx.cwd, file);
      const first = rel.split(path.sep)[0]!;
      if (!seen.has(first)) {
        seen.add(first);
        topLevel.push(first);
      }
      // keep the terminal responsive: repaint every ~24 files
      if (total % 24 === 0) await tick();
    }

    await tick();

    let pkgInfo = "";
    try {
      const pkgRaw = await fs.readFile(path.join(ctx.cwd, "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw) as { name?: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
      pkgInfo = [
        `name: ${pkg.name ?? "?"}@${pkg.version ?? "?"}`,
        `deps: ${Object.keys(pkg.dependencies ?? {}).length} | devDeps: ${Object.keys(pkg.devDependencies ?? {}).length}`,
        `scripts: ${Object.keys(pkg.scripts ?? {}).slice(0, 12).join(", ") || "none"}`,
      ].join("\n");
    } catch { /* not a node project */ }

    const git = await gitInfo(ctx.cwd);
    const topExts = [...byExt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    const output = [
      `Project: ${ctx.cwd}`,
      `Files: ${total}${truncated ? "+ (scan truncated at 4000 files)" : ""} (${formatBytes(totalBytes)})`,
      `Top-level: ${topLevel.slice(0, 30).join(", ")}`,
      pkgInfo && `package.json:\n${pkgInfo}`,
      `Extensions: ${topExts.map(([e, n]) => `${e || "(none)"}=${n}`).join(" ")}`,
      `Git: ${git}`,
    ].filter(Boolean).join("\n");

    return {
      ok: true,
      output,
      data: {
        totalFiles: total,
        totalBytes,
        topLevel: topLevel.slice(0, 30),
        byExtension: Object.fromEntries(topExts),
        packageJson: pkgInfo || undefined,
        git,
      },
    };
  },
};

/* -------------------------- dependency_analysis ------------------------ */

const dependencyAnalysis: ToolDefinition = {
  name: "dependency_analysis",
  description: "Analyze project dependencies and their health (local, no network).",
  schema: { type: "object", properties: {} },
  permission: "safe",
  category: "analysis",
  async run(_args, ctx): Promise<ToolResult> {
    const lines: string[] = [];
    const pkgFile = path.join(ctx.cwd, "package.json");
    let deps: Record<string, string> = {};
    let devDeps: Record<string, string> = {};
    try {
      const pkg = JSON.parse(await fs.readFile(pkgFile, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      deps = pkg.dependencies ?? {};
      devDeps = pkg.devDependencies ?? {};
    } catch {
      lines.push("No package.json found — trying lockfiles");
    }

    const lockfiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "Cargo.lock", "poetry.lock", "requirements.txt"];
    const found: string[] = [];
    for (const l of lockfiles) {
      if (await existsPath(path.join(ctx.cwd, l))) found.push(l);
    }
    lines.push(`Lockfiles: ${found.join(", ") || "none"}`);
    lines.push(`Dependencies: ${Object.keys(deps).length} | Dev: ${Object.keys(devDeps).length}`);
    const nodeModules = await existsPath(path.join(ctx.cwd, "node_modules"));
    lines.push(`node_modules installed: ${nodeModules ? "yes" : "no"}`);
    if (nodeModules) {
      const missing: string[] = [];
      for (const name of Object.keys({ ...deps, ...devDeps })) {
        if (!(await existsPath(path.join(ctx.cwd, "node_modules", name)))) missing.push(name);
      }
      lines.push(missing.length ? `Missing from node_modules: ${missing.slice(0, 20).join(", ")}` : "All deps present");
    } else {
      lines.push("Run your package manager to install dependencies");
    }
    const heavy = Object.entries({ ...deps, ...devDeps })
      .filter(([, v]) => /^\d+\./.test(v ?? ""))
      .sort((a, b) => (b[0].length + 20) - (a[0].length + 20))
      .slice(0, 15)
      .map(([name, ver]) => `${name}@${ver}`);
    if (heavy.length) lines.push(`Top pinned deps: ${heavy.join(", ")}`);

    return { ok: true, output: lines.join("\n"), data: { deps: Object.keys(deps).length, devDeps: Object.keys(devDeps).length, installed: nodeModules } };
  },
};

/* ---------------------------------- index ------------------------------ */

export const ANALYSIS_TOOLS: ToolDefinition[] = [projectScan, dependencyAnalysis] as unknown as ToolDefinition[];

async function gitInfo(cwd: string): Promise<string> {
  const { stdout } = await runCommand("git status --porcelain=v1 -b 2>/dev/null | head -5", { cwd, timeoutMs: 10_000 });
  const branch = stdout.match(/^## (.*\S)/m)?.[1] ?? "not a git repo";
  if (branch === "not a git repo") return branch;
  return `branch ${branch}${stdout.split("\n").length > 2 ? " (dirty)" : " (clean)"}`;
}

async function existsPath(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}