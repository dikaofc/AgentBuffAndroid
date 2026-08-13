import { z } from "zod";
import type { ToolDefinition, ToolResult } from "@dikabuff/shared";
import { AskUserArgs } from "../schema";

/**
 * `ask_user` — ask the user a question in the terminal.
 *
 * The agent uses this when it needs information only the user has (e.g. which
 * API key, a decision between options, confirmation of intent). The user can
 * type a free-form answer (submitted with Enter) or reject (Esc); a rejection
 * comes back as `user declined`, so the agent should continue without it.
 */
export const askUserTool: ToolDefinition<z.infer<typeof AskUserArgs>> = {
  name: "ask_user",
  description:
    "Ask the user a question in the terminal and get their typed answer back. Use only when you genuinely need information the user must provide (a decision, a preference, a value you cannot derive). Prefer answering from context/tools when possible. The user can also decline.",
  schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" },
      options: { type: "array", items: { type: "string" }, description: "Suggested quick answers (optional)" },
    },
    required: ["question"],
  },
  permission: "standard",
  category: "analysis",
  validateSchema: AskUserArgs,
  async run(args, ctx): Promise<ToolResult> {
    let prompt = args.question;
    if (args.options && args.options.length > 0) {
      prompt += `\n(${args.options.join(" / ")})`;
    }
    const answer = await ctx.ask(prompt, { timeoutMs: 180_000 });
    if (answer === null || answer.trim() === "") {
      return { ok: true, output: "user declined to answer", meta: { declined: true } };
    }
    return { ok: true, output: `user answered: ${answer.trim()}` };
  },
};
