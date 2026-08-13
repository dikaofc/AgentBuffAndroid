import { z } from "zod";
import type { SubAgentResult, ToolDefinition } from "@dikabuff/shared";
import { SubagentArgs } from "../schema";

/**
 * `subagent` — fan out research work.
 *
 * The main agent delegates one or more focused read-only tasks; each task is
 * executed by an independent sub-agent loop (same provider, whitelisted
 * read-only tools). Tasks run concurrently by default (`Promise.allSettled`),
 * so N independent questions finish in roughly the time of the slowest one.
 */
export const subagentTool: ToolDefinition<z.infer<typeof SubagentArgs>> = {
  name: "subagent",
  description:
    "Fan out one or more independent research questions to read-only sub-agents running in parallel. Use when the request has several independent aspects that can be investigated simultaneously (e.g. 'how is auth done' + 'where are the tests'). Each task returns a concise findings report.",
  schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description: "Research tasks to fan out",
        items: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The research question for this sub-agent" },
            label: { type: "string", description: "Short label shown in the UI" },
          },
          required: ["prompt"],
        },
      },
      parallel: { type: "boolean", description: "Run tasks concurrently (default true)" },
    },
    required: ["tasks"],
  },
  permission: "standard",
  category: "analysis",
  validateSchema: SubagentArgs,
  async run(args, ctx) {
    if (!ctx.runSubAgent) {
      return { ok: false, error: "subagent runner is not available in this context" };
    }
    const tasks = args.tasks.map((t) => ({ prompt: t.prompt, label: t.label }));
    const parallel = args.parallel !== false;

    const started = Date.now();
    const results = parallel
      ? await Promise.allSettled(tasks.map((task, index) => ctx.runSubAgent!(task, index, tasks.length)))
      : await runSequential(tasks, ctx.runSubAgent);

    const sections = results.map((entry, i) => {
      const task = tasks[i]!;
      const label = task.label ?? firstWords(task.prompt, 7);
      if (entry.status === "fulfilled" && entry.value.ok) {
        return `## ${label}\n${entry.value.output.trim()}`;
      }
      if (entry.status === "fulfilled") {
        return `## ${label}\n⚠️ failed: ${entry.value.error ?? "unknown error"}`;
      }
      return `## ${label}\n⚠️ failed: ${(entry.reason as Error).message}`;
    });

    const okCount = results.filter((r) => r.status === "fulfilled" && (r.value as SubAgentResult).ok).length;
    // Cap the combined report so long fan-outs can't blow up session memory.
    const combined = sections.join("\n\n");
    const output = combined.length > 20_000 ? combined.slice(0, 20_000) + "\n…(report truncated)" : combined;
    return {
      ok: true,
      output,
      meta: {
        subagents: tasks.length,
        okCount,
        durationMs: Date.now() - started,
      },
    };
  },
};

async function runSequential(
  tasks: Array<{ prompt: string; label?: string }>,
  run: (request: { prompt: string; label?: string }, index: number, total: number) => Promise<SubAgentResult>,
): Promise<PromiseSettledResult<SubAgentResult>[]> {
  const out: PromiseSettledResult<SubAgentResult>[] = [];
  for (let i = 0; i < tasks.length; i++) {
    try {
      out.push({ status: "fulfilled", value: await run(tasks[i]!, i, tasks.length) });
    } catch (err) {
      out.push({ status: "rejected", reason: err });
    }
  }
  return out;
}

function firstWords(text: string, n: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").slice(0, n).join(" ");
  return words.length > 60 ? words.slice(0, 59) + "…" : words;
}
