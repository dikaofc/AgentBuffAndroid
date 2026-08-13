import type { AgentMode } from "@dikabuff/shared";
import { getMode } from "./modes";

export interface PlanStep {
  id: number;
  title: string;
  detail?: string;
}

/**
 * Deterministic planner: produces the mode-appropriate step skeleton the agent
 * walks through. The LLM elaborates the plan; this gives the user visible
 * structure immediately and drives the "thinking" progress UI.
 */
export class Planner {
  plan(mode: AgentMode, prompt: string): PlanStep[] {
    const steps: PlanStep[] = [{ id: 1, title: `Understanding request: ${truncate(prompt, 48)}` }];
    switch (mode) {
      case "plan":
        steps.push(
          { id: 2, title: "Analyzing project structure", detail: "read-only scan of relevant files" },
          { id: 3, title: "Evaluating approaches", detail: "trade-offs, risks, test impact" },
          { id: 4, title: "Drafting implementation plan" },
        );
        break;
      case "debug":
        steps.push(
          { id: 2, title: "Reproducing the problem" },
          { id: 3, title: "Isolating root cause" },
          { id: 4, title: "Applying minimal fix" },
          { id: 5, title: "Verifying with tests" },
        );
        break;
      case "review":
        steps.push(
          { id: 2, title: "Inspecting git diff" },
          { id: 3, title: "Reviewing logic, security, tests" },
          { id: 4, title: "Composing findings" },
        );
        break;
      case "research":
        steps.push(
          { id: 2, title: "Scanning relevant modules" },
          { id: 3, title: "Tracing dependencies" },
          { id: 4, title: "Synthesizing answer with citations" },
        );
        break;
      default:
        steps.push(
          { id: 2, title: "Analyzing project" },
          { id: 3, title: "Implementing changes" },
          { id: 4, title: "Verifying", detail: "tests / lint where available" },
          { id: 5, title: "Reporting changes" },
        );
    }
    return steps;
  }
}

function truncate(text: string, n: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}