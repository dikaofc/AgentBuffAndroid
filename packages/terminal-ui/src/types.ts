import type { AgentMode, PermissionRequest, ToolPermissionLevel } from "@dikabuff/shared";
import type { SessionListEntry } from "@dikabuff/shared";
export type { SessionInfo, SessionListEntry } from "@dikabuff/shared";

export type UiPhase = "idle" | "thinking" | "streaming" | "awaiting-permission" | "error";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
  createdAt: number;
}

export interface ToolEventUi {
  id: number;
  name: string;
  status: "running" | "ok" | "error";
  durationMs?: number;
  summary?: string;
}

/** Live progress of one fanned-out sub-agent task. */
export interface SubagentTaskUi {
  index: number;
  total: number;
  label: string;
  status: "running" | "tool" | "done" | "error";
  detail?: string;
}

export interface PermissionUi extends PermissionRequest {
  level: ToolPermissionLevel;
}

export interface StatusInfo {
  model: string;
  mode: AgentMode;
  theme: string;
  cwd: string;
  sessionTitle: string;
  sessionId?: string;
  /** Global permission mode label shown in the status bar. */
  permissionMode?: string;
  /** True when the mock provider is active — offline demo, replies are canned. */
  mock?: boolean;
}

// SessionListEntry lives in @dikabuff/shared and is re-exported above.

export interface AppViewState {
  phase: UiPhase;
  messages: UiMessage[];
  toolEvents: ToolEventUi[];
  subagentTasks: SubagentTaskUi[];
  permission?: PermissionUi;
  /** Pending free-text question from the agent (ask_user tool) awaiting an answer. */
  ask?: AskPromptUi;
  diff?: { title: string; content: string };
  error?: string;
  /** Latest activity label (what the AI is doing) for the live activity line. */
  activity?: string;
  tokenCount: number;
  sidebarOpen: boolean;
  showStartScreen: boolean;
  hint?: string;
}

/** A question the agent asks the user mid-run (answer or reject). */
export interface AskPromptUi {
  id: string;
  prompt: string;
}

export const initialState = (): AppViewState => ({
  phase: "idle",
  messages: [],
  toolEvents: [],
  subagentTasks: [],
  tokenCount: 0,
  sidebarOpen: false,
  showStartScreen: true,
});

/** Session usage summary surfaced by /cost. */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  priced: boolean;
  model: string;
}

/** Communication contract between the Ink UI and the host application. */
export interface RuntimeAdapter {
  getStatus(): StatusInfo;
  getState(): AppViewState;
  subscribe(cb: () => void): () => void;
  submit(prompt: string): Promise<void>;
  respondPermission(granted: boolean): void;
  /** Request a diff preview for the pending permission (V key). */
  requestDiff(): Promise<void>;
  cycleModel(): Promise<void>;
  /** Select a specific model preset by id. */
  setModel(id: string): Promise<void>;
  toggleSidebar(): void;
  switchMode(mode: AgentMode): Promise<void>;
  resumeSession(id: string): Promise<void>;
  newSession(): Promise<void>;
  /** Clear the current conversation (keep the session). */
  clearConversation(): Promise<void>;
  /** Compact the conversation history (frees context). */
  compactConversation(): Promise<void>;
  /** Session token + cost usage for /cost. */
  getUsage(): Promise<UsageInfo>;
  /** Switch the UI theme live (also persists to config). */
  setTheme(themeId: string): Promise<void>;
  /** Set the global permission mode. */
  setPermissionMode(mode: string): Promise<void>;
  /** Session status summary for /status. */
  getStatusInfo(): Promise<string>;
  /** Long-term memory notes for this project (/memory). */
  getMemoryNotes(): Promise<string>;
  /** Quick diagnostics summary for /doctor. */
  getDoctorInfo(): Promise<string>;
  /** Auto-learning status for /learn. */
  getLearnInfo(): Promise<string>;
  /** Deliver the user's answer to a pending ask_user prompt (null = reject). */
  respondAsk(answer: string | null): void;
  /** Run a code review of the working tree in this session (/review). */
  runReview(): Promise<void>;
  sessions(): Promise<SessionListEntry[]>;
  quit(): void;
}