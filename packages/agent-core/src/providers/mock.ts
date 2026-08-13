import type {
  CompletedAssistantMessage,
  LLMProvider,
  ProviderMessage,
  ProviderToolCall,
  StreamDelta,
} from "./types";
import { PRODUCT_NAME, VERSION } from "@dikabuff/shared";

/**
 * Offline demo/test provider. Simulates a real agent:
 *  - First turn: asks to run `project_scan` (+ `git_status`) via tool calls.
 *  - After tool results: crafts a markdown answer from the scanned data.
 *  - stream() replays the answer chunk by chunk.
 *
 * Gives a complete agent-loop experience with zero API keys — ideal for CI
 * tests and first-run demos.
 */
export class MockProvider implements LLMProvider {
  readonly id = "mock";
  readonly supportsTools = true;
  readonly supportsStreaming = true;

  constructor(
    readonly model = "dikabuff-mock-1",
    private readonly chunkDelayMs = 8,
  ) {}

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async completeWithTools(messages: ProviderMessage[], _tools: unknown[]): Promise<CompletedAssistantMessage> {
    const hasToolResults = messages.some((m) => m.role === "tool");
    if (!hasToolResults) {
      const userMsg = [...messages].reverse().find((m) => m.role === "user");
      const content = userMsg?.content ?? "";
      // Only enter the scan-tool flow when the request actually touches the
      // codebase. Casual/quick messages get a direct answer — no project scan,
      // so a fresh chat stays instant ("anti lama").
      if (content && WANTS_SCAN.test(content)) {
        const plan: ProviderToolCall[] = [{ id: "mc_scan", name: "project_scan", arguments: {}, rawArguments: "{}" }];
        return {
          content: `I'll analyze the project first to handle: "${truncate(content, 60)}".`,
          toolCalls: plan,
        };
      }
      return {
        content: directAnswer(content),
        toolCalls: [],
      };
    }

    const scan = findToolResult(messages, "project_scan");
    const scanned = parseScan(scan);
    const answer = buildAnswer(messages, scanned);
    return { content: answer, toolCalls: [], reasoning: "Assembling project snapshot and plan." };
  }

  async *stream(messages: ProviderMessage[]): AsyncGenerator<StreamDelta> {
    const last = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    const text = last?.content || "Done.";
    for (let i = 0; i < text.length; i += 12) {
      yield { text: text.slice(i, i + 12), done: false };
      if (this.chunkDelayMs > 0) await sleep(this.chunkDelayMs);
    }
    yield { text: "", done: true };
  }
}

function findToolResult(messages: ProviderMessage[], toolName: string): string {
  return (
    [...messages]
      .reverse()
      .find((m) => m.role === "tool" && m.name === toolName)?.content ?? ""
  );
}

function parseScan(content: string): Record<string, any> {
  try {
    const data = JSON.parse(content);
    return data.data ?? data;
  } catch {
    return {};
  }
}

function buildAnswer(messages: ProviderMessage[], scan: Record<string, any>): string {
  const userMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "your request";
  const totalFiles = scan.totalFiles ?? 0;
  const pkg = typeof scan.packageJson === "string" ? scan.packageJson.split("\n")[0] : undefined;
  const topLevel = Array.isArray(scan.topLevel) ? scan.topLevel.slice(0, 8).join(", ") : "—";
  const git = scan.git ?? "unknown";

  const rows = [
    `**Project snapshot** (${totalFiles} files)`,
    `- Top-level: \`${topLevel}\``,
    pkg ? `- Package: \`${pkg}\`` : "",
    `- Git: \`${git}\``,
  ].filter(Boolean);

  return [
    `## Analysis for: ${truncate(userMsg, 80)}`,
    "",
    "I scanned the project and gathered context.",
    "",
    rows.join("\n"),
    "",
    "## Plan",
    "",
    "1. **Understand** — read the relevant modules under the matching entry points.",
    "2. **Implement** — apply minimal, idiomatic edits with focused diffs.",
    "3. **Verify** — run tests / linter and re-check the changed paths.",
    "4. **Report** — summarize changes, files touched, and how to verify them.",
    "",
    "This is the offline demo provider (`dikabuff-mock-1`). Configure a real model in",
    "`~/.dikabuff/config.json` (`provider`, `model`, `apiKey`, `baseUrl`) or run",
    "`dikabuff init` to set one up.",
    "",
    "_Ready to implement — approve file changes when I propose them._",
  ].join("\n");
}

function truncate(text: string, n: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

/** Triggers the project-scan flow only for codebase-oriented requests. */
const WANTS_SCAN =
  /explore|analys|analy|scan|project|repo|codebase|implement|fix|debug|review|refactor|improve|structure|test\b|build\b|add\b|change\b/i;

/** Instant, scan-free reply for casual/quick messages in a fresh chat.
 * Varies by what the user actually asked so quick chats never feel like a stuck loop. */
function directAnswer(content: string): string {
  const topic = truncate(content, 80);
  const clean = content.toLowerCase().trim();

  if (/who are you|your name|what are you|siapa kamu|kamu siapa/.test(clean)) {
    return [
      `I'm ${PRODUCT_NAME} Agent — a terminal-native AI coding partner (CLI v${VERSION}).`,
      "I can read files, edit code, and run commands in this project — but for quick questions",
      "like this I answer instantly without scanning everything first.",
      "",
      'Say "explore the project", "analyze this repo", or "fix the bug in …" to send me deep into the codebase.',
    ].join("\n");
  }

  if (/^(hi|hii+|hallo|hello|hey|halo|hai|yo|p|morning|assalamualaikum|selamat pagi|selamat siang)\b/.test(clean)) {
    return [
      `Heya — ${PRODUCT_NAME} Agent here (v${VERSION}).`,
      "",
      "Quick-response mode is on, so I answered instantly without scanning the repo.",
      'When you want me to dig in, ask something like "explore the project" or "fix the bug in …".',
    ].join("\n");
  }

  if (/thank|terima kasih|makasih|thanks/.test(clean)) {
    return [
      "Anytime! 😊",
      "",
      "Quick-response mode is on — I answer casual messages instantly without scanning.",
      'For deeper work, say "explore the project", "analyze this repo", or "fix the bug in …".',
    ].join("\n");
  }

  return [
    `Got it${topic ? ` — "${topic}"` : ""}.`,
    "",
    "Quick response mode: I answered without scanning the project so this stays fast.",
    "If you actually want me to dig into the codebase, ask with a phrase like",
    '"explore the project", "analyze this repo", or "fix the bug in …" and I\'ll run a full scan.',
  ].join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}