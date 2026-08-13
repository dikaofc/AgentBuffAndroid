import type { ToolContext, ToolDefinition, ToolResult, ToolSchema } from "@dikabuff/shared";
import type { LearnedToolSpec, LearnedToolStep } from "./types";

/** Learned macros take no parameters — steps carry their own captured args. */
const MacroSchema: ToolSchema = { type: "object", properties: {} };

/** Pass-through validator matching the ToolDefinition.validateSchema shape. */
const MacroValidator = {
  safeParse(args: unknown) {
    return { success: true, data: args };
  },
};

/**
 * Turn a serialized learned-tool spec into an executable ToolDefinition.
 *
 * The tool is a *macro*: it replays the learned steps by calling
 * `ctx.runTool(step.tool, step.args)` for each one, in order, and returns the
 * concatenated outputs. It introduces no new capabilities — it only composes
 * tools that already exist, and every nested call flows through the same
 * permission + consent pipeline the host provides (no bypass).
 */
export function makeLearnedTool(spec: LearnedToolSpec): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    schema: MacroSchema,
    permission: spec.permission,
    category: spec.category,
    validateSchema: MacroValidator,
    async run(_args, ctx) {
      return runSteps(spec.steps, ctx, spec.name);
    },
  };
}

/**
 * Shared step runner so nested learned tools reuse the same guard rails.
 *
 * Guard rails: no self-recursion, and a hard depth cap so even mutually
 * recursive learned tools (A calls B calls A) can't run away. Depth travels
 * through the ToolContext so nested calls share the counter.
 */
export async function runSteps(steps: LearnedToolStep[], ctx: ToolContext, owner: string): Promise<ToolResult> {
  if (!ctx.runTool) {
    return { ok: false, error: "Learned macro tools require a host that supports runTool (not available in this context)." };
  }
  const depth = ((ctx as MacroContext).learnDepth ?? 0) + 1;
  if (depth > MAX_MACRO_DEPTH) {
    return { ok: false, error: `Recursion guard: learned macro nesting exceeded ${MAX_MACRO_DEPTH} levels.` };
  }
  (ctx as MacroContext).learnDepth = depth;
  const parts: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.tool === owner) {
      return { ok: false, error: `Recursion guard: ${owner} may not call itself.`, meta: { partial: parts.join("\n") } };
    }
    const result = await ctx.runTool(step.tool, step.args);
    if (!result.ok) {
      return {
        ok: false,
        error: `Step ${i + 1} (${step.tool}) failed: ${result.error ?? "unknown error"}`,
        meta: { partial: parts.join("\n") },
      };
    }
    parts.push(`### ${step.tool}\n${result.output ?? ""}`);
  }
  return { ok: true, output: parts.join("\n\n"), meta: { learned: true, steps: steps.length } };
}

const MAX_MACRO_DEPTH = 5;

interface MacroContext {
  learnDepth?: number;
}
