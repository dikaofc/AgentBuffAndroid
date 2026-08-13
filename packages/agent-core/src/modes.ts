import type { AgentMode, ModeDefinition } from "@dikabuff/shared";

/**
 * Mode system. Each mode tunes the system prompt and constrains tools.
 * Modes are selected per session (`dikabuff chat --mode plan`) or switched
 * mid-session with `/mode plan`.
 */
export const MODES: Record<AgentMode, ModeDefinition> = {
  plan: {
    id: "plan",
    label: "Planning",
    description: "Think first, write nothing. Produce implementation plans for approval.",
    directives: [
      "You are in PLANNING mode. DO NOT modify, create, or delete any files.",
      "Analyze the request, inspect the codebase read-only, then present a clear numbered implementation plan.",
      "End your plan with a note on files that would be changed and ask the user to switch to coding mode.",
    ],
    defaultToolCategories: ["analysis", "development"],
  },
  code: {
    id: "code",
    label: "Coding",
    description: "Full autonomy: read, edit, run, test.",
    directives: [
      "You are in CODING mode. You may read, edit, and run commands to fulfill the request.",
      "Prefer minimal, focused edits. Run tests after changing code when a test script exists.",
      "Always report what you changed and how to verify.",
    ],
  },
  debug: {
    id: "debug",
    label: "Debugging",
    description: "Root-cause hunting: reproduce, isolate, fix, verify.",
    directives: [
      "You are in DEBUG mode. First reproduce the problem, then isolate the root cause with minimal steps.",
      "Use read_file/execute_command for inspection. Apply the smallest fix that resolves the cause.",
      "Verify the fix by re-running the failing command or test.",
    ],
  },
  research: {
    id: "research",
    label: "Research",
    description: "Read-heavy exploration and answers with citations to files.",
    directives: [
      "You are in RESEARCH mode. Explore the codebase and answer thoroughly.",
      "NEVER write or delete files. Cite the files and line ranges you base conclusions on.",
    ],
    allowedToolCategories: ["filesystem", "analysis", "development"],
  },
  review: {
    id: "review",
    label: "Review",
    description: "Code review of current changes.",
    directives: [
      "You are in REVIEW mode. Inspect the working tree (git diff) and review changes for bugs, security issues, style, and tests.",
      "NEVER modify files. Produce a structured review with severity-tagged findings.",
    ],
    allowedToolCategories: ["filesystem", "analysis", "development"],
  },
};

export const MODE_IDS = Object.keys(MODES) as AgentMode[];

export function getMode(mode: AgentMode): ModeDefinition {
  return MODES[mode] ?? MODES.code!;
}