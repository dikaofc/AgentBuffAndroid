import type { AgentMode, ChatMessage, DikaConfig, SessionInfo, ToolCategory } from "@dikabuff/shared";
import { MAX_CONTEXT_MESSAGES, PRODUCT_NAME, VERSION } from "@dikabuff/shared";
import { getMode } from "./modes";

export interface ProjectSnapshot {
  cwd: string;
  os: string;
  nodeVersion: string;
  files: string[];
  packageName?: string;
  gitBranch?: string;
  projectMemory?: string;
  recentNotes: string[];
}

export interface BuiltPrompt {
  system: string;
  messages: ChatMessage[];
  estimatedTokens: number;
  truncatedCount: number;
}

/** Allowed categories per mode (undefined = unrestricted). */
export function modeAllowedCategories(mode: AgentMode): ToolCategory[] | undefined {
  return getMode(mode).allowedToolCategories;
}

export function buildSystemPrompt(
  config: DikaConfig,
  session: SessionInfo,
  snapshot: Pick<ProjectSnapshot, "cwd" | "packageName" | "gitBranch" | "projectMemory">,
): string {
  const mode = getMode(session.mode);
  const sections: string[] = [
    `You are ${PRODUCT_NAME} Agent (${PRODUCT_NAME} Agent CLI v${VERSION}), an autonomous AI coding agent operating in the user's terminal.`,
    `Project directory: ${snapshot.cwd}`,
    `Mode: ${mode.label} — ${mode.description}`,
    ...mode.directives,
    "",
    "RULES",
    "- Answer in the user's language unless told otherwise.",
    "- Use tools only when the request involves the codebase (inspect, read, edit, test).",
    "- For quick or conversational requests, answer directly WITHOUT scanning the whole project — a fresh chat must stay instant.",
    "- Never hallucinate file contents; read files before quoting them.",
    "- Prefer exact `edit_file` text replacements over full-file rewrites.",
    "- When given permission to write files, keep edits minimal and idiomatic.",
    "- Run tests after code changes when a test script exists.",
    "- If a tool fails, read the error and adapt; never claim success for a failed tool.",
    "- Final answers: concise, structured markdown. For code changes, list files touched and verification steps.",
  ];
  if (config.permissions.autoApprove.length) {
    sections.push(`Auto-approved tool categories: ${config.permissions.autoApprove.join(", ")}. Dangerous/editing tools still require user consent.`);
  }
  if (snapshot.packageName) sections.push(`package.json name: ${snapshot.packageName}`);
  if (snapshot.gitBranch) sections.push(`git branch: ${snapshot.gitBranch}`);
  if (snapshot.projectMemory) {
    sections.push(
      "",
      `PROJECT MEMORY (${config.projectMemoryFile} — user-authored project instructions; treat as ground truth)`,
      snapshot.projectMemory,
    );
  }
  return sections.join("\n");
}

/**
 * Assembles the message window for a turn: keep the tail of history plus the
 * new user message, trimmed to a token budget. Always keeps system instructions
 * and the most recent context.
 */
export function buildPromptWindow(
  system: string,
  history: ChatMessage[],
  userPrompt: string,
  providerCount: (text: string) => number,
  budgetTokens: number,
): BuiltPrompt {
  let systemTokens = providerCount(system);
  const userMsg: ChatMessage = {
    id: "turn_user",
    role: "user",
    content: userPrompt,
    createdAt: Date.now(),
  };
  const available = Math.max(budgetTokens - systemTokens - providerCount(userPrompt) - 200, budgetTokens);

  const kept: ChatMessage[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < MAX_CONTEXT_MESSAGES; i--) {
    const msg = history[i]!;
    const cost = providerCount(msg.content);
    if (used + cost > available && kept.length > 2) break;
    kept.unshift(msg);
    used += cost;
  }
  const truncatedCount = history.length - kept.length;
  const messages = [...kept, userMsg];
  return {
    system,
    messages,
    estimatedTokens: systemTokens + used + providerCount(userPrompt),
    truncatedCount,
  };
}