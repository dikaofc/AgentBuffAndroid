import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolContext, ToolDefinition, ToolResult } from "@dikabuff/shared";
import {
  CodeSummaryArgs,
  DeleteFileArgs,
  EditFileArgs,
  ReadFileArgs,
  SearchFilesArgs,
  WriteFileArgs,
} from "../schema";

function resolvePath(ctx: ToolContext, p: string): string {
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(ctx.cwd, p);
}

/* ------------------------------ read_file ----------------------------- */

const readFile: ToolDefinition<z.infer<typeof ReadFileArgs>> = {
  name: "read_file",
  description: "Read a text file with optional line range. Returns content with line numbers.",
  schema: { type: "object", properties: { path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["path"] },
  permission: "safe",
  category: "filesystem",
  validateSchema: ReadFileArgs,
  async run(args, ctx) {
    const file = resolvePath(ctx, args.path);
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) return { ok: false, error: `${file} is a directory` };
      if (stat.size > 8 * 1024 * 1024) return { ok: false, error: `${file} is ${stat.size} bytes — too large to read` };
      const text = await fs.readFile(file, "utf8");
      const lines = text.split("\n");
      const offset = args.offset ?? 1;
      const limit = args.limit ?? Math.min(lines.length, 1000);
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const rendered = slice.map((line, i) => `${String(offset + i).padStart(5)} | ${line}`).join("\n");
      const truncated = offset - 1 + limit < lines.length;
      return {
        ok: true,
        output: rendered,
        meta: { totalLines: lines.length, bytes: stat.size, truncated },
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

/* ------------------------------ write_file ---------------------------- */

const writeFile: ToolDefinition<z.infer<typeof WriteFileArgs>> = {
  name: "write_file",
  description: "Create or overwrite a file with the given content.",
  schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, overwrite: { type: "boolean" } }, required: ["path", "content"] },
  permission: "sensitive",
  category: "filesystem",
  validateSchema: WriteFileArgs,
  async run(args, ctx) {
    const file = resolvePath(ctx, args.path);
    try {
      if (await exists(file)) {
        if (!args.overwrite) {
          return { ok: false, error: `${file} already exists — pass overwrite:true to replace it` };
        }
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, args.content, "utf8");
      return { ok: true, output: `Wrote ${args.content.split("\n").length} lines to ${shorten(file, ctx.cwd)}`, meta: { path: file } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

/* ------------------------------- edit_file ---------------------------- */

const editFile: ToolDefinition<z.infer<typeof EditFileArgs>> = {
  name: "edit_file",
  description: "Replace exact text in a file (like an editor find-and-replace).",
  schema: {
    type: "object",
    properties: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" }, count: { type: "number" } },
    required: ["path", "oldText", "newText"],
  },
  permission: "sensitive",
  category: "filesystem",
  validateSchema: EditFileArgs,
  async run(args, ctx) {
    const file = resolvePath(ctx, args.path);
    try {
      const content = await fs.readFile(file, "utf8");
      const count = args.count ?? 1;
      const occurrences = occurrencesOf(content, args.oldText);
      if (occurrences === 0) {
        return {
          ok: false,
          error: `oldText not found in ${shorten(file, ctx.cwd)}. Snippet of file:\n${content.slice(0, 2000)}`,
        };
      }
      if (count > occurrences) {
        return { ok: false, error: `Requested ${count} replacements but only ${occurrences} found` };
      }
      const updated = replaceN(content, args.oldText, args.newText, count);
      await fs.writeFile(file, updated, "utf8");
      return {
        ok: true,
        output: `Edited ${shorten(file, ctx.cwd)} (${count} replacement${count > 1 ? "s" : ""})`,
        meta: { path: file, replacements: count, fileChars: updated.length },
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

/* ------------------------------ delete_file --------------------------- */

const deleteFile: ToolDefinition<z.infer<typeof DeleteFileArgs>> = {
  name: "delete_file",
  description: "Delete a file or directory (recursive opt-in).",
  schema: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" } }, required: ["path"] },
  permission: "dangerous",
  category: "filesystem",
  validateSchema: DeleteFileArgs,
  async run(args, ctx) {
    const file = resolvePath(ctx, args.path);
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory() && !args.recursive) {
        return { ok: false, error: `${file} is a directory — pass recursive:true to delete it` };
      }
      await fs.rm(file, { recursive: args.recursive ?? false, force: false });
      return { ok: true, output: `Deleted ${shorten(file, ctx.cwd)}`, meta: { path: file } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

/* ------------------------------ search_files -------------------------- */

const searchFiles: ToolDefinition<z.infer<typeof SearchFilesArgs>> = {
  name: "search_files",
  description: "Search file contents by regex within a directory. Returns file:line matches.",
  schema: {
    type: "object",
    properties: { pattern: { type: "string" }, path: { type: "string" }, glob: { type: "string" }, maxResults: { type: "number" } },
    required: ["pattern"],
  },
  permission: "safe",
  category: "filesystem",
  validateSchema: SearchFilesArgs,
  async run(args, ctx) {
    const root = args.path ? resolvePath(ctx, args.path) : ctx.cwd;
    const maxResults = args.maxResults ?? 50;
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, "i");
    } catch (err) {
      return { ok: false, error: `Invalid regex: ${(err as Error).message}` };
    }
    const entries: string[] = [];
    let scanned = 0;
    try {
      for await (const file of walk(root, { maxDepth: 12, filter: (p) => !args.glob || p.endsWith(args.glob) })) {
        scanned++;
        if (entries.length >= maxResults) break;
        let buf: Buffer;
        try {
          buf = await fs.readFile(file);
        } catch {
          continue;
        }
        if (buf.includes(0)) continue; // binary
        if (buf.length > 2 * 1024 * 1024) continue;
        const lines = buf.toString("utf8").split("\n");
        for (let i = 0; i < lines.length && entries.length < maxResults; i++) {
          if (regex.test(lines[i]!)) {
            entries.push(`${shorten(file, ctx.cwd)}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
          }
        }
      }
    } catch {
      /* walk stops at permission errors */
    }
    return {
      ok: true,
      output: entries.length ? entries.join("\n") : `No matches for /${args.pattern}/ in ${shorten(root, ctx.cwd)}`,
      meta: { matches: entries.length, filesScanned: scanned, truncated: entries.length >= maxResults },
    };
  },
};

/* ------------------------------ code_summary -------------------------- */

const codeSummary: ToolDefinition<z.infer<typeof CodeSummaryArgs>> = {
  name: "code_summary",
  description: "Summarize a source file: language, LOC, imports, functions, classes.",
  schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  permission: "safe",
  category: "analysis",
  validateSchema: CodeSummaryArgs,
  async run(args, ctx) {
    const file = resolvePath(ctx, args.path);
    try {
      const text = await fs.readFile(file, "utf8");
      const lines = text.split("\n");
      const loc = lines.filter((l) => l.trim().length > 0).length;
      const imports = [...text.matchAll(/^(?:import|from|require)\s+.*$/gm)].map((m) => m[0].trim().slice(0, 120));
      const funcs = [...text.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?/gm)].map(
        (m) => m[1] ?? m[2],
      ).filter(Boolean);
      const classes = [...text.matchAll(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
      const ext = path.extname(file) || "unknown";
      return {
        ok: true,
        output: [
          `File: ${shorten(file, ctx.cwd)}`,
          `Extension: ${ext} | Lines: ${lines.length} | Non-empty LOC: ${loc}`,
          `Imports: ${imports.length}`,
          imports.slice(0, 10).map((i) => `  ${i}`).join("\n"),
          `Functions: ${funcs.length}`,
          funcs.slice(0, 15).map((f) => `  - ${f}`).join("\n"),
          `Classes: ${classes.length}`,
          classes.slice(0, 15).map((c) => `  - ${c}`).join("\n"),
        ].filter(Boolean).join("\n"),
        meta: { lines: lines.length, loc, imports: imports.length, functions: funcs, classes },
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};

/* -------------------------------- helpers ----------------------------- */

export const FILESYSTEM_TOOLS: ToolDefinition[] = [readFile, writeFile, editFile, deleteFile, searchFiles, codeSummary] as unknown as ToolDefinition[];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function shorten(p: string, cwd: string): string {
  const rel = path.relative(cwd, p);
  return rel.startsWith("..") ? p : rel;
}

function occurrencesOf(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function replaceN(haystack: string, needle: string, replacement: string, n: number): string {
  let out = "";
  let idx = 0;
  let done = 0;
  while (done < n) {
    const at = haystack.indexOf(needle, idx);
    if (at === -1) break;
    out += haystack.slice(idx, at) + replacement;
    idx = at + needle.length;
    done++;
  }
  return out + haystack.slice(idx);
}

export const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", ".cache", ".next",
  ".nuxt", ".turbo", "target", "venv", ".venv", "__pycache__", ".dikabuff", ".idea",
  ".vscode", "bundle", ".parcel-cache", ".yarn", ".pytest_cache",
]);

export async function* walk(
  root: string,
  opts: { maxDepth?: number; filter?: (path: string) => boolean } = {},
): AsyncGenerator<string> {
  const maxDepth = opts.maxDepth ?? 10;
  const filter = opts.filter;
  async function* recurse(dir: string, depth: number): AsyncGenerator<string> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        for await (const f of recurse(path.join(dir, entry.name), depth + 1)) yield f;
      } else if (entry.isFile()) {
        const full = path.join(dir, entry.name);
        if (filter && !filter(full)) continue;
        yield full;
      }
    }
  }
  for await (const f of recurse(root, 0)) yield f;
}