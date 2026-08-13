import type { ZodType, ZodObject, ZodString, ZodArray, ZodEnum, ZodUnion } from "zod";
import { z } from "zod";
import type { ToolSchema } from "@dikabuff/shared";

/** Convert a zod object schema to the JSON-schema-flavoured ToolSchema sent to models. */
export function zodToToolSchema<T extends ZodType>(schema: T, description?: string): ToolSchema {
  const shape = (schema as unknown as ZodObject<any>).shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, zodType] of Object.entries(shape)) {
    const unwrapped = unwrap(zodType);
    const optional = isOptional(zodType);
    properties[key] = unwrapped;
    if (!optional) required.push(key);
  }
  return {
    type: "object",
    description: description ?? (schema as any)._def?.description,
    properties,
    required: required.length ? required : undefined,
  };
}

function isOptional(type: unknown): boolean {
  return type instanceof z.ZodOptional || type instanceof z.ZodDefault;
}

/** Maps a zod type to a minimal JSON schema fragment. */
function unwrap(type: unknown): Record<string, unknown> {
  if (type instanceof z.ZodOptional || type instanceof z.ZodDefault) return unwrap((type as any)._def.innerType);
  if (type instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    const enumDef = (type as ZodString)._def;
    if ((enumDef as any).values) out.enum = (enumDef as any).values;
    return out;
  }
  if (type instanceof z.ZodNumber) return { type: "number" };
  if (type instanceof z.ZodBoolean) return { type: "boolean" };
  if (type instanceof z.ZodArray) return { type: "array", items: unwrap((type as ZodArray<any>)._def.type) };
  if (type instanceof z.ZodEnum) return { type: "string", enum: (type as ZodEnum<any>)._def.values };
  if (type instanceof z.ZodUnion) {
    const options = (type as ZodUnion<any>)._def.options;
    return { oneOf: options.map((o: unknown) => unwrap(o as any)) };
  }
  if (type instanceof z.ZodObject) {
    const shape = (type as ZodObject<any>).shape;
    const props: Record<string, unknown> = {};
    const req: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      props[k] = unwrap(v);
      if (!isOptional(v)) req.push(k);
    }
    return { type: "object", properties: props, required: req };
  }
  return {};
}

/* ------------------------------- helpers ------------------------------ */

export async function parseArgs<T>(schema: z.ZodTypeAny, args: unknown): Promise<T> {
  const result = schema.safeParse(args ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ToolSchemaError(
      `Invalid arguments for tool: ${first ? first.path.join(".") + " " + first.message : "unknown"}`,
    );
  }
  return result.data as T;
}

export class ToolSchemaError extends Error {}

/* ------------------------------ base schemas --------------------------- */

export const ContentArgs = z.object({
  path: z.string().describe("Absolute or project-relative file/dir path"),
});

export const ReadFileArgs = ContentArgs.extend({
  offset: z.number().int().min(1).optional().describe("1-based line offset to start reading"),
  limit: z.number().int().min(1).max(5000).optional().describe("Max lines to read"),
});

export const WriteFileArgs = z.object({
  path: z.string(),
  content: z.string(),
  overwrite: z.boolean().optional().describe("Allow overwrite of existing file (default: error if exists unless true)"),
});

export const EditFileArgs = z.object({
  path: z.string(),
  oldText: z.string().min(1).describe("Exact text to replace"),
  newText: z.string().describe("Replacement text"),
  count: z.number().int().min(1).optional().describe("Max replacements (default 1)"),
});

export const DeleteFileArgs = z.object({
  path: z.string(),
  recursive: z.boolean().optional().describe("Recursive delete for directories"),
});

export const SearchFilesArgs = z.object({
  pattern: z.string().describe("Regex pattern to search file contents"),
  path: z.string().optional().describe("Directory to search (default: project root)"),
  glob: z.string().optional().describe("Filename pattern filter, e.g. '*.ts'"),
  maxResults: z.number().int().min(1).max(500).optional().describe("Max matches (default 50)"),
});

export const CommandArgs = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(120_000).optional(),
  cwd: z.string().optional(),
  background: z.boolean().optional().describe("Run without blocking on completion (tail)"),
});

export const InstallArgs = z.object({
  manager: z.enum(["npm", "pnpm", "yarn", "bun", "pip", "pip3", "go"]),
  packages: z.array(z.string().min(1)).min(1),
  dev: z.boolean().optional().describe("Install as devDependency where applicable"),
});

export const GitDiffArgs = z.object({
  path: z.string().optional(),
  staged: z.boolean().optional(),
  stat: z.boolean().optional(),
});

export const RunTestsArgs = z.object({
  command: z.string().optional().describe("Override test command (default from package.json scripts)"),
  path: z.string().optional(),
});

export const LintArgs = z.object({
  command: z.string().optional().describe("Override lint command"),
  path: z.string().optional(),
});

export const CodeSummaryArgs = z.object({
  path: z.string(),
});

export const ProjectScanArgs = z.object({
  depth: z.number().int().min(1).max(6).optional().describe("Directory scan depth"),
});

export const WebSearchArgs = z.object({
  query: z.string().min(1).max(300).describe("Search query"),
  maxResults: z.number().int().min(1).max(8).optional().describe("Max results to return (default 5)"),
});

export const AskUserArgs = z.object({
  question: z.string().min(1).max(500).describe("The question to ask the user"),
  options: z.array(z.string()).max(8).optional().describe("Suggested quick answers (optional)"),
});

export const SubagentTaskSchema = z.object({
  prompt: z.string().min(1).describe("The research question for this sub-agent"),
  label: z.string().optional().describe("Short label shown in the UI"),
});

export const SubagentArgs = z.object({
  tasks: z.array(SubagentTaskSchema).min(1).max(6).describe("Research tasks to fan out"),
  parallel: z.boolean().optional().describe("Run tasks concurrently (default: true)"),
});